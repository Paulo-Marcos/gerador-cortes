"""
Serviço de Ingestão — download yt-dlp + extração de legendas
"""

import asyncio
import json
import re
import traceback
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from pathlib import Path

from app.channel_paths import para_relativo_ao_projeto, projetos_dir
from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.json3_parser import parse_json3
from app.domain.transcricao_utils import TranscricaoIndisponivelError
from app.domain.vtt_parser import parse_vtt
from app.models import Projeto, StatusProjeto
from app.services.app_logging import operational_debug, operational_error, operational_info

# Registro de filas de progresso por projeto
_progress_queues: dict[str, asyncio.Queue] = {}


def _data_publicacao_yt_dlp(info: dict) -> str:
    timestamp = info.get("timestamp")
    if timestamp is None:
        timestamp = info.get("release_timestamp")

    try:
        if timestamp is not None:
            return datetime.fromtimestamp(int(timestamp), tz=UTC).strftime("%Y%m%d%H%M%S")
    except (TypeError, ValueError, OSError, OverflowError):
        pass

    upload_date = str(info.get("upload_date", ""))
    return upload_date[:8] if len(upload_date) >= 8 else ""


_PROGRESSO_YTDLP = re.compile(r"\[download\]\s+([\d.]+)%")

# Gravar no banco a cada linha do yt-dlp era uma transação por DÉCIMO de por
# cento — centenas de escritas num download, competindo com o resto do app pelo
# SQLite. A tela continua recebendo TODAS as linhas (isso é de graça, vai pelo
# WebSocket); o banco só guarda o que serve para retomar depois de um restart.
_PASSO_MINIMO_PARA_GRAVAR = 1.0


def _progresso_da_linha(texto: str) -> float | None:
    """A porcentagem numa linha do yt-dlp, ou None quando a linha é outra coisa."""
    achado = _PROGRESSO_YTDLP.search(texto)
    return float(achado.group(1)) if achado else None


class _ProgressoGravado:
    """Decide se vale gravar: só a cada 1% ou no 100%."""

    def __init__(self) -> None:
        self._ultimo = -1.0

    def vale_gravar(self, progresso: float) -> bool:
        if progresso < 100 and progresso - self._ultimo < _PASSO_MINIMO_PARA_GRAVAR:
            return False
        self._ultimo = progresso
        return True


def _rodar_ytdlp_lendo_saida(cmd: list[str], ao_progresso) -> int:
    """Roda o yt-dlp numa thread LENDO a saída linha a linha (D-653).

    Ler é obrigatório em dois sentidos: dá progresso para a tela e esvazia o
    cano — sem isso o processo trava quando o buffer enche.
    """
    import subprocess

    processo = subprocess.Popen(  # noqa: S603 — comando montado por nós
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
        bufsize=1,
    )
    with processo.stdout:
        for linha in processo.stdout:
            texto = linha.strip()
            operational_debug("yt-dlp", texto)
            progresso = _progresso_da_linha(texto)
            if progresso is not None:
                ao_progresso(progresso)
    return processo.wait()


class IngestaoService:
    @staticmethod
    async def processar_projeto(projeto_id: str, youtube_url: str):
        """Pipeline completo: download + transcrição."""
        operational_info("INGESTAO", f">>> INICIANDO processar_projeto para {projeto_id}")
        queue = asyncio.Queue()
        _progress_queues[projeto_id] = queue

        try:
            operational_info("INGESTAO", "Atualizando status para BAIXANDO...")
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.BAIXANDO)
            operational_info(
                "INGESTAO", f"Status BAIXANDO salvo. Iniciando download de: {youtube_url}"
            )
            video_path = await IngestaoService._baixar_video(projeto_id, youtube_url, queue)

            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.TRANSCREVENDO)
            try:
                transcricao = await IngestaoService._extrair_legenda(projeto_id, youtube_url)
            except TranscricaoIndisponivelError:
                # O vídeo é o ativo caro da ingestão (dezenas de minutos, GBs).
                # Grava-o antes de propagar o erro: assim o projeto termina em
                # `erro` com o motivo na tela, mas 'Refazer transcrição' já
                # encontra o arquivo e conclui sem rebaixar nada (D-444).
                await IngestaoService._salvar_transcricao(projeto_id, [], video_path)
                raise

            await IngestaoService._salvar_transcricao(projeto_id, transcricao, video_path)
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.PRONTO)
            await queue.put({"status": "pronto", "progresso": 100})

            # Pipeline para aqui: análise/desvios/brutos são disparados manualmente
            # pelo usuário via UI. Nada roda automaticamente após o download.

        except Exception as e:
            operational_error(
                "INGESTAO",
                f"Erro na ingestão do projeto {projeto_id}: "
                f"{type(e).__name__}: {e}\n{traceback.format_exc()}",
            )
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.ERRO, str(e))
            await queue.put({"status": "erro", "mensagem": str(e)})
        finally:
            _progress_queues.pop(projeto_id, None)

    @staticmethod
    async def rebaixar_video(projeto_id: str) -> None:
        """Baixa SÓ o vídeo de uma live já limpa, preservando o resto (D-527).

        Diferente de `processar_projeto`, que é a ingestão inteira, e diferente
        de `reiniciar-download`, que zera transcrição, título e duração. Aqui a
        live já foi baixada, transcrita, analisada e cortada uma vez: o que
        sumiu foi o arquivo pesado, e é só ele que volta.

        Refazer a transcrição junto seria pior que inútil — os cortes apontam
        para tempos daquela transcrição, e uma nova (o YouTube reprocessa
        legendas) deslocaria tudo.

        Ao fim, `arquivos_limpos` volta a `False`: a live pesada está no disco de
        novo, e a limpeza precisa voltar a ser oferecida — senão o operador
        rebaixa e não tem como liberar depois.
        """
        queue: asyncio.Queue = asyncio.Queue()
        _progress_queues[projeto_id] = queue
        try:
            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if not projeto:
                    return
                url = projeto.youtube_url

            operational_info("INGESTAO", f"Rebaixando video da live {projeto_id[:8]}")
            video_path = await IngestaoService._baixar_video(projeto_id, url, queue)

            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    projeto.arquivo_video_path = para_relativo_ao_projeto(video_path, projeto_id)
                    projeto.arquivos_limpos = 0
                    projeto.rebaixando_video = 0
                    projeto.progresso_download = 100
                    await db.commit()
            await queue.put({"status": "pronto", "progresso": 100})
            operational_info("INGESTAO", f"Video da live {projeto_id[:8]} de volta ao disco")

        except Exception as e:
            operational_error(
                "INGESTAO",
                f"Erro ao rebaixar o video do projeto {projeto_id}: {type(e).__name__}: {e}",
            )
            async with AsyncSessionLocal() as db:
                projeto = await db.get(Projeto, projeto_id)
                if projeto:
                    # O status NAO vira ERRO: a live continua analisada e com os
                    # cortes de pe. Falhou o download, nao o projeto.
                    projeto.rebaixando_video = 0
                    await db.commit()
            await queue.put({"status": "erro", "mensagem": str(e)})
        finally:
            _progress_queues.pop(projeto_id, None)

    @staticmethod
    async def _baixar_video(projeto_id: str, url: str, queue: asyncio.Queue) -> str:
        """Executa yt-dlp para baixar o vídeo."""
        projeto_dir = projetos_dir() / projeto_id
        projeto_dir.mkdir(parents=True, exist_ok=True)

        output_template = str(projeto_dir / "video.%(ext)s")

        cmd = [
            "yt-dlp",
            "-f",
            settings.ytdlp_format,
            "--output",
            output_template,
            "--write-info-json",  # salva metadados JSON
            "--newline",  # progresso linha a linha
            "--merge-output-format",
            "mkv",
            url,
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            # Lê progresso linha a linha
            ultimo_gravado = _ProgressoGravado()
            async for line in process.stdout:
                text = line.decode("utf-8", errors="ignore").strip()
                operational_debug("yt-dlp", text)
                progresso = _progresso_da_linha(text)
                if progresso is None:
                    continue
                await queue.put({"status": "baixando", "progresso": progresso})
                if ultimo_gravado.vale_gravar(progresso):
                    await IngestaoService._salvar_progresso(projeto_id, progresso)
            await process.wait()
            returncode = process.returncode
        except NotImplementedError:
            # Fallback quando o event loop não sabe abrir subprocesso (Selector).
            # D-653: aqui o download ficava MUDO — `subprocess.run` só volta no
            # fim, então a barra de progresso ficava parada em 0% por horas e a
            # tela parecia travada. Agora lê linha a linha, como o caminho async.
            operational_info("INGESTAO", "Aviso: Usando fallback via Thread para yt-dlp.")
            loop = asyncio.get_running_loop()
            ultimo_gravado = _ProgressoGravado()

            def ao_progresso(progresso: float) -> None:
                loop.call_soon_threadsafe(
                    queue.put_nowait, {"status": "baixando", "progresso": progresso}
                )
                if ultimo_gravado.vale_gravar(progresso):
                    asyncio.run_coroutine_threadsafe(
                        IngestaoService._salvar_progresso(projeto_id, progresso), loop
                    )

            returncode = await asyncio.to_thread(_rodar_ytdlp_lendo_saida, cmd, ao_progresso)

        if returncode != 0:
            raise RuntimeError(f"yt-dlp falhou com código {returncode}")

        # Encontra o arquivo de vídeo gerado (MKV preferencialmente)
        video_files = list(projeto_dir.glob("video.mkv"))
        if not video_files:
            video_files = list(projeto_dir.glob("video.mp4"))
        if not video_files:
            video_files = list(projeto_dir.glob("video.*"))
        if not video_files:
            raise RuntimeError("Arquivo de vídeo não encontrado após download")

        return str(video_files[0])

    @staticmethod
    async def _extrair_legenda(
        projeto_id: str, url: str, video_path: str = "", legenda_offset_ms: int = 0
    ) -> list[dict]:
        """
        Extrai a legenda automática do YouTube via yt-dlp usando json3,vtt.
        O formato vtt garante sincronização correta com transmissões ao vivo (tem PTS offset).
        O formato json3 garante precisão em nível de palavra.
        Combinamos ambos lendo o offset do vtt e aplicando no json3.

        `video_path` é LEGADO e ignorado: a pasta do projeto passou a ser resolvida
        pelo canal ativo (`projetos_dir()`), não mais derivada dele. Mantido só para
        não quebrar callers travados; será removido na cura de raiz (D-172, Fatia 2).
        """
        # A pasta de legendas é um artefato NOVO: ancoramos na raiz de dados VIGENTE
        # do canal (projetos_dir() / projeto_id), não no caminho gravado no banco —
        # que pode estar stale após relocação (D-155/D-158), apontando para um diretório
        # inexistente e estourando WinError 3 no mkdir. `parents=True` cria a árvore.
        projeto_dir = projetos_dir() / projeto_id
        subs_path = projeto_dir / "subtitles"
        subs_path.mkdir(parents=True, exist_ok=True)

        for sub_format in ("json3", "vtt"):
            cmd_sub = [
                "yt-dlp",
                "--write-auto-sub",
                "--write-sub",
                "--sub-lang",
                "pt,pt-BR,pt-PT,en",
                "--sub-format",
                sub_format,
                "--skip-download",
                "--output",
                str(subs_path / "sub"),
                url,
            ]

            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd_sub,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                )
                # D-653: `communicate` e não `wait`. Com o cano aberto e ninguém
                # lendo, o buffer do sistema enche e o yt-dlp PARA de escrever —
                # fica pendurado para sempre, sem erro nenhum para mostrar.
                await process.communicate()
            except NotImplementedError:
                import subprocess

                await asyncio.to_thread(
                    lambda cmd=cmd_sub: subprocess.run(
                        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
                    )
                )

        await IngestaoService._baixar_chat_replay(url, subs_path)

        # Ler VTT e JSON3
        vtt_files = list(subs_path.glob("*.vtt"))
        json3_files = list(subs_path.glob("*.json3"))

        if not json3_files:
            if vtt_files:
                from app.domain.time_convert import hms_to_seg
                from app.domain.transcricao_utils import limpar_e_ordenar_transcricao

                operational_info("INGESTAO", "JSON3 não disponível. Usando VTT como fallback.")
                offset_seg = legenda_offset_ms / 1000.0
                trans_bruta = parse_vtt(vtt_files[0].read_text(encoding="utf-8"))
                if offset_seg:
                    trans_bruta = [
                        {
                            "start": max(0, hms_to_seg(seg["inicio"]) + offset_seg),
                            "end": max(0.05, hms_to_seg(seg["fim"]) + offset_seg),
                            "texto": seg["texto"],
                        }
                        for seg in trans_bruta
                    ]
                return limpar_e_ordenar_transcricao(trans_bruta)

            operational_error("INGESTAO", "Falha ao extrair legenda JSON3 ou VTT.")
            raise TranscricaoIndisponivelError(
                "O YouTube ainda não publicou as legendas automáticas deste vídeo. "
                "É o normal em live recém-encerrada: a geração pode levar horas. "
                "O vídeo já está baixado — quando as legendas saírem, use "
                "'Refazer transcrição' para concluir sem baixar de novo."
            )

        # Se não vier VTT, o offset é zero
        offset_ms = 0
        if vtt_files:
            from app.domain.time_convert import hms_to_seg

            try:
                vtt_segs = parse_vtt(vtt_files[0].read_text(encoding="utf-8"))
                if vtt_segs:
                    vtt_start_ms = int(hms_to_seg(vtt_segs[0]["inicio"]) * 1000)
                    # Para descobrir o json3_start_ms real, precisamos de um parser bruto ou usar o json
                    import json

                    json_data = json.loads(json3_files[0].read_text(encoding="utf-8"))
                    json3_start_ms = 0
                    events = json_data.get("events", [])
                    if events:
                        # Encontra o primeiro evento válido
                        for ev in events:
                            if (
                                ev.get("segs")
                                and "".join([s.get("utf8", "") for s in ev.get("segs")]).strip()
                            ):
                                json3_start_ms = ev.get("tStartMs", 0)
                                break
                    offset_ms = vtt_start_ms - json3_start_ms
                    operational_debug(
                        "INGESTAO",
                        f"PTS Offset calculado: {offset_ms}ms "
                        f"(VTT {vtt_start_ms} - JSON3 {json3_start_ms})",
                    )
            except Exception as e:
                operational_error("INGESTAO", f"Erro ao calcular offset VTT: {e}")

        from app.domain.transcricao_utils import limpar_e_ordenar_transcricao

        # Soma o offset matemático (PTS da live) com o offset manual do projeto
        offset_total = offset_ms + legenda_offset_ms
        operational_debug(
            "INGESTAO",
            f"Aplicando offset total: {offset_total}ms "
            f"(PTS {offset_ms} + Manual {legenda_offset_ms})",
        )

        try:
            raw_content = json3_files[0].read_text(encoding="utf-8")
            trans_bruta = parse_json3(raw_content, offset_ms=offset_total)
            operational_info("INGESTAO", f"Transcrição extraída com {len(trans_bruta)} segmentos.")
            return limpar_e_ordenar_transcricao(trans_bruta)
        except Exception as e:
            operational_error("INGESTAO", f"Erro crítico ao parsear JSON3: {e}")
            raise TranscricaoIndisponivelError(
                f"A legenda baixada do YouTube veio corrompida e não pôde ser lida ({e}). "
                "Use 'Refazer transcrição' para baixá-la de novo."
            ) from e

    @staticmethod
    async def _baixar_chat_replay(url: str, subs_path: Path) -> None:
        """Baixa o chat replay da live, quando existe (M1).

        É o único sinal de audiência que a live traz de graça: os momentos em
        que o chat se agitou viram pista para a análise propor cortes. Nem toda
        live tem replay — de 4 lives medidas, 1 não tinha — então a falha aqui
        é silenciosa por projeto: o pipeline segue sem a pista, como já segue
        sem diarização.

        Flags diferentes das legendas de propósito: o chat é `--write-subs`
        (faixa real, não automática) na "língua" `live_chat`.
        """
        cmd = [
            "yt-dlp",
            "--write-subs",
            "--sub-langs",
            "live_chat",
            "--skip-download",
            "--output",
            str(subs_path / "chat"),
            url,
        ]
        try:
            processo = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT
            )
            await processo.communicate()  # D-653: sem ler o cano, o processo trava
        except NotImplementedError:
            import subprocess

            await asyncio.to_thread(
                lambda c=cmd: subprocess.run(c, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            )
        except Exception as e:  # noqa: BLE001 — pista opcional não derruba ingestão
            operational_info("INGESTAO", f"Chat replay indisponível: {e}")
            return

        achados = list(subs_path.glob("*.live_chat.json"))
        if achados:
            operational_info(
                "INGESTAO", f"Chat replay salvo ({achados[0].stat().st_size // 1024} KB)."
            )

    @staticmethod
    async def _salvar_transcricao(projeto_id: str, transcricao: list[dict], video_path: str):
        """Salva transcrição e metadados do vídeo no banco."""
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)
                # Grava RELATIVO ao projeto (D-172): sobrevive a relocação do canal.
                projeto.arquivo_video_path = para_relativo_ao_projeto(video_path, projeto_id)

                # Tenta carregar metadados do info.json do yt-dlp
                info_files = list(Path(video_path).parent.glob("*.info.json"))
                if info_files:
                    info = json.loads(info_files[0].read_text(encoding="utf-8"))
                    projeto.titulo_live = info.get("title", "")
                    projeto.duracao_segundos = info.get("duration", 0)
                    data_publicacao = _data_publicacao_yt_dlp(info)
                    if data_publicacao and len(data_publicacao) >= len(projeto.data_live or ""):
                        projeto.data_live = data_publicacao

                await db.commit()

    @staticmethod
    async def _atualizar_status(projeto_id: str, status: str, erro: str = ""):
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.status = status
                projeto.erro_msg = erro
                await db.commit()

    @staticmethod
    async def _salvar_progresso(projeto_id: str, progresso: float):
        async with AsyncSessionLocal() as db:
            projeto = await db.get(Projeto, projeto_id)
            if projeto:
                projeto.progresso_download = progresso
                await db.commit()

    @staticmethod
    async def stream_progresso(projeto_id: str) -> AsyncGenerator[dict]:
        """Gerador assíncrono de updates de progresso via WebSocket."""
        queue = _progress_queues.get(projeto_id)
        if not queue:
            yield {"status": "sem_progresso", "mensagem": "Nenhum download em andamento"}
            return

        while True:
            update = await queue.get()
            yield update
            if update.get("status") in ("pronto", "erro"):
                break
