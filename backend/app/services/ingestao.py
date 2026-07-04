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
            operational_info("INGESTAO", f"Status BAIXANDO salvo. Iniciando download de: {youtube_url}")
            video_path = await IngestaoService._baixar_video(projeto_id, youtube_url, queue)

            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.TRANSCREVENDO)
            transcricao = await IngestaoService._extrair_legenda(projeto_id, youtube_url)

            await IngestaoService._salvar_transcricao(projeto_id, transcricao, video_path)
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.PRONTO)
            await queue.put({"status": "pronto", "progresso": 100})

            # Pipeline para aqui: análise/desvios/brutos são disparados manualmente
            # pelo usuário via UI. `_auto_pipeline` continua disponível para chamada
            # explícita, mas não roda mais automaticamente após download.

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
            async for line in process.stdout:
                text = line.decode("utf-8", errors="ignore").strip()
                operational_debug("yt-dlp", text)
                match = re.search(r"\[download\]\s+([\d.]+)%", text)
                if match:
                    progress = float(match.group(1))
                    await queue.put({"status": "baixando", "progresso": progress})
                    await IngestaoService._salvar_progresso(projeto_id, progress)
            await process.wait()
            returncode = process.returncode
        except NotImplementedError:
            # Fallback para Windows
            import subprocess

            operational_info("INGESTAO", "Aviso: Usando fallback via Thread para yt-dlp.")

            def run_ytdlp():
                return subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    errors="replace",
                )

            result = await asyncio.to_thread(run_ytdlp)
            operational_debug("yt-dlp", f"Output (sync):\n{result.stdout[-1000:]}")
            returncode = result.returncode

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
                await process.wait()
            except NotImplementedError:
                import subprocess

                await asyncio.to_thread(
                    lambda cmd=cmd_sub: subprocess.run(
                        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT
                    )
                )

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
            return [
                {
                    "inicio": "00:00:00.000",
                    "fim": "00:00:01.000",
                    "texto": "[Legenda automática não disponível para este vídeo]",
                }
            ]

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
            return [
                {"inicio": "00:00:00.000", "fim": "00:00:01.000", "texto": f"[Erro no parser: {e}]"}
            ]

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

    @staticmethod
    async def _auto_pipeline(projeto_id: str, skip_analise: bool = False):
        """
        Pipeline automático pós-download:
          1. Análise de transcrição (n8n) -> gera cortes propostos
          2. Detecção de desvios em massa em todos os cortes
          3. Download dos cortes brutos de todos os cortes aprovados automáticos

        `skip_analise=True` pula a etapa 1 e vai direto para desvios + brutos.
        Use quando o projeto já tem cortes (ex.: retomada após falha) — evita
        duplicar cortes, já que `importar_resultado` acumula em vez de substituir.
        """
        try:
            # 1. Analisa transcrição (pulada se o projeto já tem cortes)
            if skip_analise:
                operational_info(
                    "AUTO-PIPELINE",
                    f"{projeto_id}: pulando análise de transcrição (skip_analise=True).",
                )
            else:
                operational_info(
                    "AUTO-PIPELINE", f"{projeto_id}: iniciando análise de transcrição..."
                )
                from app.services.analise import AnaliseService

                await AnaliseService.analisar_transcricao(projeto_id)
                operational_info("AUTO-PIPELINE", f"{projeto_id}: análise concluída.")

            # 2. Detecta desvios em todos os cortes em paralelo (máx 4)
            operational_info("AUTO-PIPELINE", f"{projeto_id}: iniciando análise de desvios...")
            from app.services.corte import CorteService

            await CorteService.analisar_desvios_todos_impl(projeto_id)
            operational_info("AUTO-PIPELINE", f"{projeto_id}: desvios concluídos.")

            # 3. Baixa cortes brutos de todos os cortes aprovados
            operational_info(
                "AUTO-PIPELINE", f"{projeto_id}: iniciando download de cortes brutos..."
            )
            from app.services.export import ExportService

            await ExportService.cortar_todos_impl(projeto_id)
            operational_info("AUTO-PIPELINE", f"{projeto_id}: cortes brutos concluídos.")

        except Exception as e:
            operational_error(
                "AUTO-PIPELINE",
                f"ERRO no projeto {projeto_id}: {e}\n{traceback.format_exc()}",
            )
            # Marca projeto como ERRO para que "reiniciar falhados" consiga retomá-lo.
            await IngestaoService._atualizar_status(projeto_id, StatusProjeto.ERRO, str(e))
