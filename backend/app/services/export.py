"""
Serviço de Export — CSV LosslessCut + corte lossless com ffmpeg + processamento (áudio + intro/outro)
"""

import asyncio
import importlib.util
import json
import shutil
from pathlib import Path

from app.channel_paths import (
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Corte, Projeto, StatusCorte

# Instala auto-editor automaticamente em tempo de execução para não quebrar o container docker existente
if importlib.util.find_spec("auto_editor") is None:
    import subprocess

    # Bootstrap em tempo de import (antes de app_logging ser importado abaixo):
    # mantém print puro de propósito — não há infra de log disponível aqui ainda.
    print("[ExportService] Instalando auto-editor via pip...")
    subprocess.check_call(["pip", "install", "auto-editor"])

from app.domain.bruto_interval import calcular_intervalo_bruto
from app.domain.bruto_pipeline import build_bruto_pipeline
from app.domain.cinema_filters import FILTROS_CINEMA, get_filtro_vf
from app.domain.csv_builder import build_losslesscut_csv, build_single_cut_desvios_llc
from app.domain.ffmpeg_commands import (
    build_audio_offset_cmd,
    build_concat_cmd,
    build_filter_complex_cmd,
    build_lossless_cut_cmd,
    build_normalize_cmd,
)
from app.domain.segment_calculator import (
    calcular_segmentos,
    mesclar_desvios_sobrepostos,
    normalizar_desvio,
)
from app.domain.time_convert import seg_to_hms
from app.infrastructure.ffmpeg_runner import run_ffmpeg, run_ffmpeg_simple
from app.services.app_logging import (
    current_log_level,
    is_debug_enabled,
    operational_debug,
    operational_error,
    operational_info,
)
from app.services.bruto_progress import BrutoProgress
from app.services.tasks import fire_and_forget


class ExportService:
    # Acima deste número de segmentos, um único filter_complex fica grande/frágil
    # demais; caímos no fallback de re-encode por segmento (mais lento, robusto).
    _SEGMENT_FALLBACK_THRESHOLD: int = 10

    _tarefas_corte: dict[str, str] = {}
    _bulk_processar_sem: asyncio.Semaphore | None = None
    _bulk_upload_sem: asyncio.Semaphore | None = None
    _fila_processamento: dict[str, dict[str, str]] = {}
    _fila_youtube: dict[str, dict[str, str]] = {}
    _bulk_brutos_sem: asyncio.Semaphore | None = None

    @classmethod
    def get_tarefa_corte_status(cls, corte_id: str) -> str:
        return cls._tarefas_corte.get(corte_id, "nao_iniciado")

    @classmethod
    def set_tarefa_corte_status(cls, corte_id: str, status: str):
        cls._tarefas_corte[corte_id] = status

    @classmethod
    def get_fila_processamento(cls) -> dict:
        return cls._fila_processamento

    @classmethod
    def get_fila_youtube(cls) -> dict:
        return cls._fila_youtube

    @classmethod
    async def cortar_todos_impl(cls, projeto_id: str) -> list[str]:
        from app.database import AsyncSessionLocal
        from app.models import Corte, StatusCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.status == StatusCorte.APROVADO)
                .where(Corte.arquivo_clip_path.is_(None))
            )
            cortes = result.scalars().all()

        iniciados = []
        for corte in cortes:
            if cls.get_tarefa_corte_status(corte.id) != "cortando":
                cls.set_tarefa_corte_status(corte.id, "cortando")
                fire_and_forget(cls.cortar_clip_lossless(corte.id), name=f"cortar-{corte.id[:8]}")
                iniciados.append(corte.id)
        return iniciados

    @classmethod
    async def gerar_todos_brutos_e_scripts_impl(cls, projeto_id: str):
        import asyncio

        from app.database import AsyncSessionLocal
        from app.models import Corte
        from sqlalchemy import or_, select

        if cls._bulk_brutos_sem is None:
            cls._bulk_brutos_sem = asyncio.Semaphore(4)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(or_(Corte.arquivo_clip_path.is_(None), Corte.arquivo_clip_path == ""))
            )
            cortes = result.scalars().all()
            corte_ids = [c.id for c in cortes]

        if not corte_ids:
            operational_info(
                "ExportService",
                f"Nenhum bruto pendente para {projeto_id}. Recriando scripts direto.",
            )
            await cls.gerar_scripts_losslesscut_logic(projeto_id)
            return

        async def _cortar_com_sem(corte_id: str):
            async with cls._bulk_brutos_sem:
                cls.set_tarefa_corte_status(corte_id, "cortando")
                try:
                    await cls.cortar_clip_lossless(corte_id)
                    cls.set_tarefa_corte_status(corte_id, "pronto")
                except Exception as e:
                    cls.set_tarefa_corte_status(corte_id, f"erro: {str(e)}")

        operational_info("ExportService", f"Gerando {len(corte_ids)} brutos para {projeto_id}...")
        await asyncio.gather(*[_cortar_com_sem(cid) for cid in corte_ids])

        operational_info("ExportService", "Todos brutos finalizados. Recriando scripts...")
        await cls.gerar_scripts_losslesscut_logic(projeto_id)
        operational_info("ExportService", f"Concluído para projeto {projeto_id}.")

    @classmethod
    async def bulk_processar_impl(cls, projeto_id: str, corte_ids: list[str], filtro: str):
        import asyncio

        if cls._bulk_processar_sem is None:
            cls._bulk_processar_sem = asyncio.Semaphore(4)

        sem = cls._bulk_processar_sem

        cls._fila_processamento[projeto_id] = {cid: "aguardando" for cid in corte_ids}

        async def _processar_com_sem(corte_id: str):
            async with sem:
                cls._fila_processamento[projeto_id][corte_id] = "processando"
                operational_info("ExportService", f"Iniciando: {corte_id} com filtro '{filtro}'")
                try:
                    await cls.processar_clip(corte_id, filtro=filtro)
                    cls._fila_processamento[projeto_id][corte_id] = "concluido"
                    operational_info("ExportService", f"Concluído: {corte_id}")
                except Exception as e:
                    cls._fila_processamento[projeto_id][corte_id] = "erro"
                    operational_error("ExportService", f"Erro: {corte_id}: {e}")

        async def _run_all_processar():
            await asyncio.gather(*[_processar_com_sem(cid) for cid in corte_ids])
            await asyncio.sleep(300)
            cls._fila_processamento.pop(projeto_id, None)

        fire_and_forget(_run_all_processar(), name=f"processar-todos-{projeto_id[:8]}")

    @classmethod
    async def bulk_upload_youtube_impl(
        cls,
        projeto_id: str,
        corte_ids: list[str],
        scheduled_dates: list[str | None],
    ):
        agenda = cls._montar_agenda_youtube(corte_ids, scheduled_dates)
        if not agenda:
            return

        cls._fila_youtube[projeto_id] = {corte_id: "aguardando" for corte_id, _ in agenda}
        fire_and_forget(
            cls._run_youtube_upload_queue(projeto_id, agenda),
            name=f"yt-upload-{projeto_id[:8]}",
        )

    @staticmethod
    def _montar_agenda_youtube(
        corte_ids: list[str],
        scheduled_dates: list[str | None],
    ) -> list[tuple[str, str | None]]:
        return [
            (corte_id, scheduled_dates[index] if index < len(scheduled_dates) else None)
            for index, corte_id in enumerate(corte_ids)
        ]

    @classmethod
    async def _run_youtube_upload_queue(
        cls,
        projeto_id: str,
        agenda: list[tuple[str, str | None]],
        cleanup_delay: float | None = 300,
    ) -> None:
        if cls._bulk_upload_sem is None:
            cls._bulk_upload_sem = asyncio.Semaphore(1)

        for idx, (corte_id, scheduled_at) in enumerate(agenda):
            resultado = await cls._upload_youtube_item(projeto_id, corte_id, scheduled_at)
            if resultado.get("cota_excedida"):
                restantes = [cid for cid, _ in agenda[idx + 1 :]]
                cls._marcar_restantes_cota_excedida(projeto_id, restantes)
                break

        if cleanup_delay is not None:
            await asyncio.sleep(cleanup_delay)
            cls._fila_youtube.pop(projeto_id, None)

    @classmethod
    async def _upload_youtube_item(
        cls,
        projeto_id: str,
        corte_id: str,
        scheduled_at: str | None,
    ) -> dict:
        from app.services.youtube import YouTubeService

        async with cls._bulk_upload_sem:
            fila = cls._fila_youtube.setdefault(projeto_id, {})
            fila[corte_id] = "enviando"
            operational_info("ExportService", f"Enviando: {corte_id} | Agendado: {scheduled_at}")
            try:
                resultado = await YouTubeService.upload_video(corte_id, scheduled_at=scheduled_at)
            except Exception as exc:
                resultado = {"status": "erro", "mensagem": str(exc)}

            if resultado.get("cota_excedida"):
                fila[corte_id] = "cota_excedida"
            elif resultado.get("status") == "ok":
                fila[corte_id] = "concluido"
            else:
                fila[corte_id] = "erro"
            operational_info("ExportService", f"Resultado: {corte_id}: {resultado}")
            return resultado

    @classmethod
    def _marcar_restantes_cota_excedida(cls, projeto_id: str, corte_ids: list[str]) -> None:
        """Marca cortes restantes como cota_excedida sem tentar upload."""
        fila = cls._fila_youtube.setdefault(projeto_id, {})
        for corte_id in corte_ids:
            fila[corte_id] = "cota_excedida"
        if corte_ids:
            operational_info(
                "ExportService",
                f"Cota YouTube excedida. "
                f"{len(corte_ids)} uploads restantes cancelados. "
                f"Reset ~04h Brasília.",
            )

    @staticmethod
    async def gerar_csv_losslesscut(projeto_id: str, db=None) -> str:
        """
        Gera CSV compatível com LosslessCut para um projeto.
        Inclui todos os segmentos aprovados e seus desvios (marcados como DESVIO_).
        """
        from sqlalchemy import select

        close_db = False
        if db is None:
            from app.database import AsyncSessionLocal

            db = AsyncSessionLocal()
            close_db = True

        try:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.status.in_([StatusCorte.APROVADO, StatusCorte.PROPOSTO]))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            csv_content = build_losslesscut_csv(cortes)

            csv_dir = projetos_dir() / projeto_id
            csv_dir.mkdir(parents=True, exist_ok=True)
            csv_path = csv_dir / "losslesscut.csv"
            csv_path.write_text(csv_content, encoding="utf-8")
            return str(csv_path)
        finally:
            if close_db:
                await db.close()

    @staticmethod
    async def gerar_csv_desvios_corte(corte_id: str) -> str:
        """
        Gera um CSV LosslessCut específico para um único corte contendo apenas os tempos de seus desvios.
        O CSV é salvo na pasta do corte para que o usuário possa carregá-lo no LosslessCut.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                raise ValueError("Corte não encontrado")

            stem = "clip_raw_base"
            if corte.arquivo_clip_path:
                p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
                if p.exists():
                    stem = p.stem

            csv_content, llc_json_content = build_single_cut_desvios_llc(corte, stem)

            csv_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
            csv_dir.mkdir(parents=True, exist_ok=True)

            llc_path = csv_dir / f"{stem}-proj.llc"
            llc_path.write_text(llc_json_content, encoding="utf-8")

            csv_path = csv_dir / f"{stem}.csv"
            csv_path.write_text(csv_content, encoding="utf-8")
            return str(csv_path)

    @staticmethod
    async def cortar_clip_lossless(corte_id: str):
        """
        Corta o vídeo losslessly usando ffmpeg, removendo os desvios.

        Algoritmo:
        - Sem desvios: ffmpeg -ss inicio -to fim -i video.mp4 -c copy out.mp4
        - Com N desvios: corta cada segmento separado e concatena losslessly
          Segmentos gerados para um corte [T1,T2] com desvio [D1,D2]:
            parte1: [T1 -> D1], parte2: [D2 -> T2]
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            projeto_id = corte.projeto_id
            video_path = projetos_dir() / projeto_id / "video.mp4"
            if not video_path.exists():
                # Tenta extensões alternativas
                for ext in ["mkv", "webm", "avi", "mov"]:
                    candidate = video_path.with_suffix(f".{ext}")
                    if candidate.exists():
                        video_path = candidate
                        break

            if not video_path.exists():
                async with AsyncSessionLocal() as db2:
                    c = await db2.get(Corte, corte_id)
                    if c:
                        c.status = (
                            StatusCorte.PROCESSADO
                        )  # usa PROCESSADO p/ erro tmb, erro_msg no projeto
                corte_dict = {
                    "status": "erro",
                    "mensagem": f"Arquivo de vídeo não encontrado em {projetos_dir()}/{projeto_id}/",
                }
                return corte_dict

            # Pasta de output
            out_dir = projetos_dir() / projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)

            import re

            safe_title = re.sub(r"[^A-Za-z0-9_\- ]", "", corte.titulo_proposto)
            safe_title = safe_title.replace(" ", "_")[:40]
            nome_arq = f"{corte.numero:02d}_{safe_title}"

            out_path = out_dir / f"{nome_arq}.mkv"

            if out_path.exists():
                try:
                    out_path.unlink()
                except Exception:
                    return {
                        "status": "erro",
                        "mensagem": f"{out_path.name} está aberto em outro programa. Feche-o e tente novamente.",
                    }

            try:
                # Extrai o clipe bruto exatamente no intervalo [inicio_seg, fim_seg] do corte.
                # Sem padding: a duração do arquivo coincide com (fim - inicio) mostrado no editor.
                inicio_real, fim_real = calcular_intervalo_bruto(
                    corte.inicio_seg,
                    corte.fim_seg,
                    projeto.duracao_segundos,
                )

                cmd = build_lossless_cut_cmd(video_path, out_path, inicio_real, fim_real)
                await ExportService._run_cmd_via_worker(
                    f"{corte_id}_lossless",
                    [str(c) for c in cmd],
                    str(out_dir.absolute()),
                )

                # F-063: corrige o lip-sync no bruto, se o corte tiver offset.
                await ExportService._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

                # Gera o CSV de desvios automaticamente na pasta
                try:
                    await ExportService.gerar_csv_desvios_corte(corte_id)
                except Exception as e_csv:
                    operational_error(
                        "ExportService", f"Atenção: Erro ao auto-gerar CSV do LosslessCut: {e_csv}"
                    )

                # Atualiza banco — clip gerado, status processado se já era aprovado
                async with AsyncSessionLocal() as db2:
                    c = await db2.get(Corte, corte_id)
                    if c:
                        c.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), c.projeto_id)
                        # Só avança para processado se já estava aprovado.
                        # Se estava proposto (geração bruta prévia), mantém proposto.
                        if c.status == StatusCorte.APROVADO:
                            c.status = StatusCorte.PROCESSADO
                        await db2.commit()

                return {"status": "pronto", "clip_path": str(out_path)}

            except Exception as e:
                operational_error("ExportService", f"Erro ao cortar {corte_id}: {e}")
                return {"status": "erro", "mensagem": str(e)}

    @staticmethod
    async def _run_cmd_via_worker(
        job_id: str, cmd: list[str], cwd: str, timeout: int = 600
    ) -> None:
        """Despacha um comando FFmpeg ao Native Worker (fila JSON) e aguarda o resultado.

        Mesmo mecanismo que gerar_bruto_via_worker — evita NotImplementedError do
        asyncio.create_subprocess_exec no Windows (SelectorEventLoop).

        Raises RuntimeError se o worker não responder no timeout ou reportar falha.
        """
        fila_dir = projetos_dir() / "fila_remotion"
        fila_dir.mkdir(parents=True, exist_ok=True)

        req_file = fila_dir / f"req_{job_id}.json"
        res_file = fila_dir / f"res_{job_id}.json"

        if req_file.exists():
            req_file.unlink()
        if res_file.exists():
            res_file.unlink()

        job_data = {"id": job_id, "cwd": cwd, "cmd": cmd, "log_level": current_log_level().value}
        with open(req_file, "w", encoding="utf-8") as f:
            json.dump(job_data, f, ensure_ascii=False)

        operational_info("ExportService", f"Job '{job_id}' enfileirado para Native Worker.")

        elapsed = 0
        while elapsed < timeout:
            if res_file.exists():
                break
            await asyncio.sleep(2)
            elapsed += 2

        if not res_file.exists():
            raise RuntimeError(f"Native Worker não respondeu em {timeout}s (job={job_id})")

        try:
            with open(res_file, encoding="utf-8") as f:
                resultado = json.load(f)
            res_file.unlink()
        except Exception as e:
            raise RuntimeError(f"Falha ao ler resposta do Native Worker: {e}") from e

        if resultado.get("status") != "sucesso":
            raise RuntimeError(f"FFmpeg falhou (worker): {resultado.get('erro', 'desconhecido')}")

    @classmethod
    async def processar_desvios_rerender(cls, corte_id: str):
        """
        Caminho A: Re-renderiza o vídeo removendo todos os desvios de forma automatizada usando ffmpeg filter_complex.
        """
        try:
            async with AsyncSessionLocal() as db:
                corte = await db.get(Corte, corte_id)
                if not corte:
                    return {"status": "erro", "mensagem": "Corte não encontrado"}

                projeto = await db.get(Projeto, corte.projeto_id)
                if not projeto:
                    return {"status": "erro", "mensagem": "Projeto não encontrado"}

                video_path = None
                db_video_path = str(resolver_do_projeto(projeto.arquivo_video_path, projeto.id))

                if db_video_path and Path(db_video_path).exists():
                    video_path = Path(db_video_path)
                else:
                    # Fallback: busca na pasta do projeto
                    base_path = projetos_dir() / corte.projeto_id / "video"
                    for ext in ["mkv", "webm", "avi", "mov", "mp4"]:
                        candidate = base_path.with_suffix(f".{ext}")
                        if candidate.exists():
                            video_path = candidate
                            break

                if not video_path or not video_path.exists():
                    return {
                        "status": "erro",
                        "mensagem": f"Arquivo de vídeo original não encontrado. (Procurado em: {projeto.arquivo_video_path})",
                    }

                out_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
                out_dir.mkdir(parents=True, exist_ok=True)

                # Output final consolidado (MKV preferível para evitar corrupção e manter sync no FFmpeg)
                out_path = out_dir / "clip_raw.mkv"
                if out_path.exists():
                    try:
                        out_path.unlink()
                    except Exception:
                        return {
                            "status": "erro",
                            "mensagem": "O arquivo de vídeo final está aberto em outro programa. Feche-o e tente novamente.",
                        }

                try:
                    desvios_raw = json.loads(corte.desvios or "[]")
                except json.JSONDecodeError:
                    print(
                        f"[ExportService] desvios do corte {corte_id} corrompidos "
                        f"(JSON inválido); assumindo lista vazia."
                    )
                    desvios_raw = []
                desvios = [normalizar_desvio(d) for d in desvios_raw]
                segmentos = calcular_segmentos(
                    float(corte.inicio_seg), float(corte.fim_seg), desvios
                )

                if not segmentos:
                    return {"status": "erro", "mensagem": "Nenhum segmento válido para renderizar."}

                if len(segmentos) > cls._SEGMENT_FALLBACK_THRESHOLD:
                    operational_info(
                        "ExportService",
                        f"Muitas partes ({len(segmentos)}), usando fallback por segmentos (re-encode).",
                    )
                    try:
                        await cls._rerender_by_reencode_segments_local(
                            video_path, out_path, segmentos
                        )
                        operational_info(
                            "ExportService",
                            "✅ Re-renderização por segmentos concluída com sucesso!",
                        )
                    except Exception as e:
                        operational_error("ExportService", f"❌ ERRO re-encode segments: {e}")
                        return {
                            "status": "erro",
                            "mensagem": "Erro na re-renderização por segmentos. Veja logs.",
                        }
                else:
                    cmd = build_filter_complex_cmd(video_path, out_path, segmentos)
                    operational_info(
                        "ExportService", f"Iniciando re-renderização do corte {corte_id}..."
                    )
                    result = await run_ffmpeg(cmd, label=f"rerender_{corte_id}")
                    if result.returncode != 0:
                        operational_error("ExportService", f"❌ ERRO FFmpeg:\n{result.stderr_tail}")
                        return {
                            "status": "erro",
                            "mensagem": "Erro na re-renderização. Veja os logs do servidor.",
                        }
                    operational_info("ExportService", "✅ Re-renderização concluída com sucesso!")

                # F-063: corrige o lip-sync no bruto, se o corte tiver offset.
                await ExportService._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

                # Atualiza o arquivo de clip gerado para o novo (relativo ao projeto)
                corte.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), corte.projeto_id)
                corte.status = StatusCorte.PROCESSADO
                await db.commit()

                return {"status": "pronto", "clip_path": str(out_path)}
        except Exception as e:
            import traceback

            operational_error(
                "ExportService", f"💥 Exceção na exportação: {e}\n{traceback.format_exc()}"
            )
            return {"status": "erro", "mensagem": f"Erro interno no servidor: {str(e)}"}

    @classmethod
    async def gerar_bruto_via_worker(
        cls,
        corte_id: str,
        *,
        refazer_transcricao: bool = True,
        refazer_cenas: bool = True,
    ) -> dict:
        """Gera o vídeo bruto do corte delegando o FFmpeg ao Native Worker.

        Pipeline único: per-segment com PCM/h264 + concat demuxer estilo
        LosslessCut.  Detalhes em ``app.domain.bruto_pipeline``.

        Output: ``clip_raw_<timestamp_ms>.mkv`` na pasta do corte.  Nome
        único evita conflito de lock com o player do navegador.

        D-160 — o vídeo bruto (silêncios + render) roda sempre; ``refazer_transcricao``
        e ``refazer_cenas`` gateiam as etapas derivadas. O endpoint mantém os dois
        ``True`` na 1ª geração (cadeia completa) e passa ``False`` na regeração
        quando o usuário não pediu opt-in — assim reprocessar o recorte não refaz
        texto/cenas que já estão bons.

        Returns:
            ``{"status": "pronto", "clip_path": str}`` em caso de sucesso, ou
            ``{"status": "erro", "mensagem": str}`` caso contrário.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            BrutoProgress.iniciar(corte_id)
            BrutoProgress.marcar(corte_id, "silencios", "rodando")
            # Salvaguarda F-017: roda retirada de silencios antes de calcular
            # segmentos. Garante que cliques em "Bruto" ou "Regerar bruto"
            # nunca produzam clip com silencios mesmo se o editor esqueceu de
            # rodar a detecao manual. limpar_anteriores=True remove apenas
            # desvios cujo motivo eh "Silencio Detectado (IA/Tecnico)";
            # desvios manuais sao preservados. Falha eh nao-fatal.
            try:
                from app.services.corte import CorteService

                await CorteService.detectar_silencios_tecnico(corte_id, limpar_anteriores=True)
                await db.refresh(corte)
                BrutoProgress.marcar(corte_id, "silencios", "concluido")
            except Exception as exc:
                operational_error(
                    "ExportService", f"Salvaguarda de silencios falhou para {corte_id}: {exc}"
                )
                BrutoProgress.marcar(corte_id, "silencios", "erro")

            BrutoProgress.marcar(corte_id, "render", "rodando")
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            video_path = cls._resolver_video_path(projeto, corte.projeto_id)
            if not video_path:
                return {"status": "erro", "mensagem": "Arquivo de vídeo original não encontrado."}

            out_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
            out_dir.mkdir(parents=True, exist_ok=True)

            # Nome único por geração — evita conflito de lock com o player
            # do navegador, que segura o `clip_raw.mkv` carregado enquanto a
            # aba está aberta.  Cada `gerar-bruto` escreve em um arquivo novo
            # e o DB aponta pro mais recente.  Limpeza best-effort dos antigos.
            import time as _time

            out_path = out_dir / f"clip_raw_{int(_time.time() * 1000)}.mkv"

            # Cleanup best-effort de arquivos clip_raw* antigos.  Os que estão
            # lockados (player aberto) são ignorados; a próxima geração tenta
            # de novo eventualmente.
            for old in out_dir.glob("clip_raw*.mkv"):
                if old == out_path:
                    continue
                try:
                    old.unlink()
                except OSError as e:
                    if settings.bruto_verbose_log or is_debug_enabled():
                        print(
                            f"[ExportService] Arquivo bruto antigo lockado: {old.name} ({e})",
                            flush=True,
                        )

            try:
                desvios_raw = json.loads(corte.desvios or "[]")
            except json.JSONDecodeError:
                print(
                    f"[ExportService] desvios do corte {corte_id} corrompidos "
                    f"(JSON inválido); assumindo lista vazia."
                )
                desvios_raw = []
            desvios = [normalizar_desvio(d) for d in desvios_raw]

            # Limita fim_seg à duração real do vídeo para evitar segmentos além do final
            inicio_seg = float(corte.inicio_seg)
            fim_seg = float(corte.fim_seg)
            if projeto.duracao_segundos:
                fim_seg = min(fim_seg, float(projeto.duracao_segundos))

            # Mescla desvios sobrepostos em intervalos atômicos.  Semanticamente
            # equivalente a passar a lista original para calcular_segmentos (que
            # já trata sobreposições via cursor), mas deixa explícito quantos
            # blocos de remoção únicos existem.
            desvios_mesclados = mesclar_desvios_sobrepostos(desvios)

            segmentos_data = calcular_segmentos(inicio_seg, fim_seg, desvios_mesclados)
            segmentos = [(s["start"], s["end"]) for s in segmentos_data]

            if not segmentos:
                return {"status": "erro", "mensagem": "Nenhum segmento válido."}

            # Log opcional (controlado por settings.bruto_verbose_log).
            log_path = out_dir / "DEBUG_gerar_bruto.log"
            if settings.bruto_verbose_log or is_debug_enabled():
                debug_log = (
                    f"================================================================================\n"
                    f"[GERAR_BRUTO DEBUG] Corte: {corte_id}\n"
                    f"Corte range: {inicio_seg}s -> {fim_seg}s  (duracao_video={projeto.duracao_segundos}s)\n"
                    f"Total de {len(desvios)} desvios brutos, {len(desvios_mesclados)} após mesclar sobrepostos:\n"
                )
                for i, dv in enumerate(desvios_mesclados):
                    tipo = dv.get("motivo", "???")[:60]
                    debug_log += (
                        f"  [{i}] [{dv.get('inicio_seg')}s -> {dv.get('fim_seg')}s] {tipo}\n"
                    )
                debug_log += f"\nSegmentos CALCULADOS: {len(segmentos)}\n"
                for i, (seg_i, seg_f) in enumerate(segmentos):
                    debug_log += (
                        f"  Seg[{i}]: [{seg_i:.3f}s -> {seg_f:.3f}s] dur={seg_f - seg_i:.3f}s\n"
                    )
                debug_log += "================================================================================"
                log_path.write_text(debug_log, encoding="utf-8")
                print(debug_log, flush=True)

            # Despacho para o Native Worker (fila JSON evita NotImplementedError do
            # asyncio.create_subprocess_exec em Windows + SelectorEventLoop).
            fila_dir = projetos_dir() / "fila_remotion"
            fila_dir.mkdir(parents=True, exist_ok=True)

            job_id = f"{corte_id}_bruto"
            req_file = fila_dir / f"req_{job_id}.json"
            res_file = fila_dir / f"res_{job_id}.json"

            if req_file.exists():
                req_file.unlink()
            if res_file.exists():
                res_file.unlink()

            # Pipeline única: per-segment com PTS contíguo + concat estilo
            # LosslessCut.  Detalhes em app.domain.bruto_pipeline.
            import tempfile as _temp

            # Diretório temporário único DENTRO da pasta do corte (não no tempdir
            # global, que é world-writable e tem nome previsível → colisão/TOCTOU
            # entre jobs). mkdtemp garante nome imprevisível e criação atômica.
            tmp_dir = Path(_temp.mkdtemp(prefix=f"tmp_rerender_{job_id}_", dir=str(out_dir)))

            pipeline = build_bruto_pipeline(
                video_path=video_path,
                out_path=out_path,
                work_dir=out_dir,
                tmp_dir=tmp_dir,
                segmentos=segmentos,
            )
            for path, content in pipeline.files.items():
                Path(path).parent.mkdir(parents=True, exist_ok=True)
                Path(path).write_text(content, encoding="utf-8")

            if settings.bruto_verbose_log or is_debug_enabled():
                cmd_summary = " ".join(str(c) for c in pipeline.cmd)
                files_summary = "\n".join(
                    f"  - {p}  ({len(c.encode('utf-8'))} bytes)" for p, c in pipeline.files.items()
                )
                detail = (
                    f"\n[PIPELINE DEBUG]\n"
                    f"out_path: {out_path}\n"
                    f"tmp_dir: {pipeline.tmp_dir}\n"
                    f"arquivos auxiliares ({len(pipeline.files)}):\n{files_summary}\n"
                    f"cmd dispatched: {cmd_summary}\n"
                )
                print(detail, flush=True)
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(detail)

            job_data = {
                "id": job_id,
                "cwd": str(out_dir.absolute()),
                "cmd": [str(c) for c in pipeline.cmd],
                "log_level": current_log_level().value,
            }

            if settings.bruto_verbose_log or is_debug_enabled():
                print(
                    f"[ExportService] Enfileirando geração de bruto para {corte_id}...", flush=True
                )
            with open(req_file, "w", encoding="utf-8") as f:
                json.dump(job_data, f, ensure_ascii=False)

            # Aguarda o Native Worker processar (polling com timeout de 10min)
            timeout = 600
            elapsed = 0
            while elapsed < timeout:
                if res_file.exists():
                    break
                await asyncio.sleep(2)
                elapsed += 2

            if not res_file.exists():
                return {
                    "status": "erro",
                    "mensagem": "Timeout: Native Worker não respondeu em 10 minutos.",
                }

            try:
                with open(res_file, encoding="utf-8") as f:
                    resultado = json.load(f)
                res_file.unlink()
            except Exception:
                return {"status": "erro", "mensagem": "Falha ao ler resposta do Native Worker."}

            if resultado.get("status") != "sucesso":
                return {
                    "status": "erro",
                    "mensagem": f"FFmpeg falhou: {resultado.get('erro', 'desconhecido')}",
                }

            # Garantia 1: arquivo de saída foi criado com tamanho mínimo.
            if not out_path.exists() or out_path.stat().st_size < 1024:
                return {"status": "erro", "mensagem": "Arquivo bruto não foi gerado pelo worker."}

            # F-063: corrige o lip-sync no bruto, se o corte tiver offset. Aplicado
            # ANTES do probe de duração para que duracao_clip_seg reflita o arquivo
            # final. No-op quando offset=0 — cortes sem ajuste ficam idênticos.
            await ExportService._aplicar_audio_offset(out_path, int(corte.audio_offset_ms or 0))

            # Garantia 2: duração real está dentro de tolerância da esperada.
            duracao_esperada = sum(sf - si for si, sf in segmentos)
            duracao_real = await cls._probe_duracao(out_path)
            if duracao_real is not None and abs(duracao_real - duracao_esperada) > 5.0:
                # Sempre logamos divergência (mesmo com verbose off) — é erro grave.
                operational_error(
                    "ExportService",
                    f"⚠️ Duração divergente: "
                    f"esperado={duracao_esperada:.1f}s real={duracao_real:.1f}s",
                )
                return {
                    "status": "erro",
                    "mensagem": (
                        f"Duração divergente: esperado={duracao_esperada:.1f}s, "
                        f"real={duracao_real:.1f}s. Tente gerar novamente."
                    ),
                }

            # Atualiza banco e sincroniza transcrição (path relativo ao projeto)
            corte.arquivo_clip_path = para_relativo_ao_projeto(str(out_path), corte.projeto_id)
            # Persiste a duração REAL do arquivo (medida via ffprobe) para o
            # frontend exibir o valor exato em vez de estimar.  Evita o
            # problema de mostrar "11:48" quando o arquivo tem 11:49.343.
            if duracao_real is not None:
                corte.duracao_clip_seg = float(duracao_real)
                if settings.bruto_verbose_log or is_debug_enabled():
                    print(
                        f"[ExportService] duracao_clip_seg salvo: {duracao_real:.3f}s",
                        flush=True,
                    )
            # Se estava aprovado, avança para processado
            if corte.status == "aprovado":
                corte.status = "processado"
            await db.commit()
            BrutoProgress.marcar(corte_id, "render", "concluido")

            # D-160 — a re-sincronização do texto (transcricao_final ↔ recorte
            # atual) é opt-in na regeração. Pular não afeta o vídeo bruto em si,
            # só o texto derivado usado por cenas/metadados.
            if refazer_transcricao:
                BrutoProgress.marcar(corte_id, "transcricao", "rodando")
                from app.services.corte import CorteService

                await CorteService.sincronizar_transcricao_corte(corte_id, db=db)
                BrutoProgress.marcar(corte_id, "transcricao", "concluido")

            # F-054: dispara detecção de mudanças de cena no bruto recém-gerado.
            # Fire-and-forget — o usuário vê as sugestões aparecerem no painel de
            # YT layout assim que o React Query refetch ler `segmentos_detectados`
            # do banco. Falha é não-fatal: o botão manual ainda permite re-rodar.
            try:
                from app.services.deteccao_segmentos import executar_deteccao_segmentos

                fire_and_forget(
                    executar_deteccao_segmentos(corte_id, out_path),
                    name=f"deteccao-seg-{corte_id[:8]}",
                )
            except Exception as exc:
                operational_error(
                    "ExportService",
                    f"Auto-trigger de detecção de segmentos falhou para {corte_id}: {exc}",
                )

            # O status só vira "pronto" quando o worker inteiro retorna (inclui as
            # cenas abaixo) — assim o botão fica em loading até TUDO terminar.
            # F-038 — cenas via Claude APÓS o re-sync (transcrição já sem
            # silêncios), para os timings (startLeg) ficarem precisos. Import
            # lazy evita ciclo; falha é não-fatal (não derruba o bruto).
            # D-160 — cenas por IA também são opt-in na regeração (refazer_cenas).
            gerar_cenas = refazer_cenas and settings.claude_auto_cenas_no_bruto
            operational_debug(
                "ExportService",
                f"refazer_cenas={refazer_cenas} "
                f"claude_auto_cenas_no_bruto={settings.claude_auto_cenas_no_bruto}"
                f" -> {'iniciando cenas via Claude' if gerar_cenas else 'pulando cenas'}"
                f" p/ {corte_id}",
            )
            if gerar_cenas:
                BrutoProgress.marcar(corte_id, "cenas", "rodando")
                try:
                    from app.services.claude_ia import ClaudeIaService

                    await ClaudeIaService.gerar_cenas_via_claude(corte_id)
                    BrutoProgress.marcar(corte_id, "cenas", "concluido")
                except Exception as exc:
                    BrutoProgress.marcar(corte_id, "cenas", "erro")
                    operational_error(
                        "ExportService", f"Cenas via Claude falharam para {corte_id}: {exc}"
                    )

            if settings.bruto_verbose_log or is_debug_enabled():
                print(f"[ExportService] ✅ Bruto gerado: {out_path.name}", flush=True)
            return {"status": "pronto", "clip_path": str(out_path)}

    @staticmethod
    async def _probe_duracao(file_path: Path) -> float | None:
        """Retorna a duração em segundos via ffprobe, ou None se falhar.

        Exemplo:
            >>> dur = await ExportService._probe_duracao(Path("clip.mkv"))
            >>> dur > 0
            True
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return float(stdout.decode().strip())
        except Exception:
            return None

    @staticmethod
    def _resolver_video_path(projeto, projeto_id: str):
        """Localiza o arquivo de vídeo original do projeto.

        Exemplo:
            >>> path = ExportService._resolver_video_path(projeto, "abc")
            >>> path.suffix
            '.mp4'
        """
        if projeto.arquivo_video_path and Path(projeto.arquivo_video_path).exists():
            return Path(projeto.arquivo_video_path)

        base_path = projetos_dir() / projeto_id / "video.mp4"
        if base_path.exists():
            return base_path

        for ext in ["mkv", "webm", "avi", "mov", "mp4"]:
            candidate = base_path.with_suffix(f".{ext}")
            if candidate.exists():
                return candidate

        return None

    @staticmethod
    async def _aplicar_audio_offset(clip_path: Path, offset_ms: int) -> None:
        """Aplica o offset de áudio (lip-sync, F-063) ao bruto recém-gerado.

        No-op quando offset_ms == 0 (caso padrão, sem regressão). Caso contrário,
        reescreve o clip no lugar, deslocando o áudio em relação ao vídeo. Como
        grade/overlay/render final herdam o áudio do bruto, a correção propaga.
        """
        if not offset_ms:
            return
        tmp_path = clip_path.with_name(f"{clip_path.stem}.offset.tmp{clip_path.suffix}")
        cmd = build_audio_offset_cmd(clip_path, tmp_path, offset_ms)
        await run_ffmpeg_simple(cmd, label="ffmpeg_audio_offset")
        tmp_path.replace(clip_path)

    @staticmethod
    async def _ffmpeg_corte_simples(video: Path, out: Path, inicio: float, fim: float):
        """Corta um segmento losslessly. Usa -ss INPUT para precisão."""
        cmd = build_lossless_cut_cmd(video, out, inicio, fim)
        await run_ffmpeg_simple(cmd, label="ffmpeg_corte_simples")

    @staticmethod
    async def _ffmpeg_concat(partes: list, out: Path):
        """Concatena várias partes losslessly usando ffmpeg concat demuxer."""
        concat_file = out.parent / "concat_list.txt"
        linhas = [f"file '{str(p.resolve())}'" for p in partes]
        concat_file.write_text("\n".join(linhas), encoding="utf-8")

        cmd = build_concat_cmd(concat_file, out)
        try:
            await run_ffmpeg_simple(cmd, label="ffmpeg_concat")
        finally:
            concat_file.unlink(missing_ok=True)

    @staticmethod
    async def _rerender_by_reencode_segments_local(
        video_path: Path, out_path: Path, segmentos: list
    ):
        """Re-encoda cada segmento separadamente e concatena os arquivos resultantes.

        Usado como fallback quando um filter_complex com muitas trims trava.
        """
        import tempfile as _temp

        temp_dir = Path(_temp.mkdtemp(prefix=f"tmp_rerender_{out_path.stem}_"))
        parts = []
        try:
            for idx, (seg_i, seg_f) in enumerate(segmentos):
                part = temp_dir / f"part_{idx:03d}.mkv"
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-nostdin",
                    "-i",
                    str(video_path),
                    "-ss",
                    seg_to_hms(seg_i),
                    "-to",
                    seg_to_hms(seg_f),
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    str(part),
                ]
                await run_ffmpeg_simple(cmd, label=f"rerender_seg_{idx}")
                parts.append(str(part))

            concat_file = temp_dir / "concat_list.txt"
            # Backslash em expressão de f-string só é aceito a partir do
            # Python 3.12 (PEP 701); o CI roda 3.11 — manter o replace fora.
            caminhos = [str(Path(p).resolve()).replace("\\\\", "/") for p in parts]
            linhas = [f"file '{caminho}'" for caminho in caminhos]
            concat_file.write_text("\n".join(linhas), encoding="utf-8")

            cmd = [
                "ffmpeg",
                "-y",
                "-nostdin",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                str(concat_file),
                "-c",
                "copy",
                "-movflags",
                "+faststart",
                str(out_path),
            ]
            await run_ffmpeg_simple(cmd, label="rerender_concat")
        finally:
            import shutil as _shutil

            _shutil.rmtree(str(temp_dir), ignore_errors=True)

    @staticmethod
    async def processar_clip(corte_id: str, filtro: str = "nenhum"):
        """
        Processa um clip já cortado:
        1. Normaliza áudio e aplica filtro visual em uma ÚNICA passada (se possível)
        2. Concatena intro/outro (re-encodando se necessário, mas com preset leve)
        """
        operational_info("service", f"🚀 [1/4] Iniciando processar_clip para o corte: {corte_id}")
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                operational_error("service", f"❌ ABORTADO: Corte {corte_id} sem arquivo_clip_path")
                return
            await db.get(Projeto, corte.projeto_id)

        projeto_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        projeto_dir.mkdir(parents=True, exist_ok=True)

        # Como o usuário pode salvar manualmente do LosslessCut o arquivo `clip_raw.mkv` ou `.mp4`
        clip_mkv = projeto_dir / "clip_raw.mkv"
        clip_mp4 = projeto_dir / "clip_raw.mp4"

        if clip_mkv.exists():
            clip_path = clip_mkv
            operational_info("service", f"Usando vídeo ajustado final (MKV): {clip_path}")
        elif clip_mp4.exists():
            clip_path = clip_mp4
            operational_info("service", f"Usando vídeo ajustado final (MP4): {clip_path}")
        else:
            clip_path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)

        if not clip_path.exists():
            operational_error(
                "service", f"❌ ABORTADO: Arquivo de clip não encontrado: {clip_path}"
            )
            return

        # Passo 1: Normalização e Filtro
        operational_info("service", f"⚙️ [2/4] Iniciando Normalização + Filtro ('{filtro}')...")
        clip_normalizado = projeto_dir / "clip_normalized.mkv"
        try:
            await ExportService._normalizar_audio(clip_path, clip_normalizado, filtro=filtro)
        except Exception as e:
            operational_error("service", f"❌ ERRO em _normalizar_audio ({corte_id}): {e}")
            return

        if not clip_normalizado.exists():
            operational_error("service", "❌ FALHA: clip_normalized.mkv não foi criado!")
            return

        # Passo 2: Intro/Outro
        operational_info("service", "⚙️ [3/4] Iniciando Concatenação (Intro/Outro)...")
        clip_final = projeto_dir / "clip_final.mp4"
        await ExportService._adicionar_intro_outro(clip_normalizado, clip_final)

        if not clip_final.exists():
            operational_error("service", "❌ FALHA: clip_final.mp4 não foi criado!")
            return

        # Passo 3: Preparação final e copias
        operational_info("service", "📦 [4/4] Finalizando: Copiando para upload_ready...")
        upload_dir = projeto_dir / "upload_ready"
        upload_dir.mkdir(exist_ok=True)
        final_dest = upload_dir / "video.mp4"
        shutil.copy2(str(clip_final), str(final_dest))

        operational_info("service", "📄 Gerando metadados.txt...")
        await ExportService._gerar_metadados_txt(corte_id, upload_dir)

        # Copia a thumbnail se existir (busca no MetadadoCorte)
        from app.models import MetadadoCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

            if meta and meta.thumbnail_path:
                thumb_source = resolver_do_projeto(meta.thumbnail_path, corte.projeto_id)
                if thumb_source.exists():
                    thumb_dest = upload_dir / "thumbnail.jpg"
                    shutil.copy2(str(thumb_source), str(thumb_dest))
                    operational_info("service", "🖼️ Thumbnail copiada para upload_ready.")

        operational_info(
            "service",
            f"✨ [CONCLUÍDO] Corte {corte_id} processado com sucesso! Caminho: {final_dest}",
        )

    @staticmethod
    async def _normalizar_audio(
        input_path: Path,
        output_path: Path,
        filtro: str = "nenhum",
        preview_segundos: int | None = None,
    ):
        """Aplica filtro de cor (se houver) e normaliza áudio para padrão Youtube."""
        filtro_vf = get_filtro_vf(filtro)
        cmd = build_normalize_cmd(input_path, output_path, filtro_vf=filtro_vf)

        if preview_segundos:
            cmd = ["ffmpeg", "-y", "-nostdin", "-t", str(preview_segundos)] + cmd[3:]

        operational_info("ExportService", f"Normalizando vídeo/áudio: {output_path.name}...")
        result = await run_ffmpeg(cmd, label="ffmpeg_normalizar", timeout=28800)

        if result.returncode != 0:
            raise RuntimeError(f"Falha na normalização de áudio: {result.stderr_tail}")

        if not output_path.exists():
            raise RuntimeError("Output file was not created by ffmpeg normalization.")

    @staticmethod
    async def _adicionar_intro_outro(clip_path: Path, output_path: Path):
        """ffmpeg: concatena intro.mp4 + clip (+ outro.mp4 se existir)."""
        assets_dir = Path(settings.assets_dir) / "intro"
        intro = assets_dir / "intro.mp4"
        outro = assets_dir / "outro.mp4"

        partes = []
        if intro.exists():
            partes.append(str(intro))
        partes.append(str(clip_path))
        if outro.exists():
            partes.append(str(outro))

        if len(partes) == 1:
            # Sem intro/outro: copia clip diretamente
            import shutil

            shutil.copy2(str(clip_path), str(output_path))
            return

        # Com intro/outro: precisa re-encodar tudo compatível
        # Primeiro, normaliza cada parte para formato padrão (h264+aac)
        partes_normalized = []
        temp_dir = output_path.parent / ".temp_concat"
        temp_dir.mkdir(exist_ok=True)

        for idx, parte_path in enumerate(partes):
            normalized = temp_dir / f"part_{idx}.mkv"
            if not normalized.exists():
                cmd = [
                    "ffmpeg",
                    "-y",
                    "-nostdin",
                    "-i",
                    parte_path,
                    "-c:v",
                    "libx264",
                    "-preset",
                    "superfast",
                    "-crf",
                    "22",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-ar",
                    "48000",
                    "-max_muxing_queue_size",
                    "1024",
                    "-movflags",
                    "+faststart",
                    str(normalized),
                ]
                from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

                try:
                    await run_ffmpeg_simple(cmd, label=f"concat-normalize-{idx}")
                except Exception as e:
                    operational_error("concat-normalize", f"Erro ao normalizar part_{idx}: {e}")
                    raise RuntimeError(f"Falha ao normalizar parte {idx}") from e

            partes_normalized.append(str(normalized))

        # Depois, concatena usando concat demuxer com inputs já normalizados
        concat_file = temp_dir / "concat_list.txt"
        linhas = [f"file '{p}'" for p in partes_normalized]
        concat_file.write_text("\n".join(linhas), encoding="utf-8")

        cmd = [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

        try:
            await run_ffmpeg_simple(cmd, label="ffmpeg_concat")
            returncode = 0
        except Exception as e:
            operational_error("ffmpeg_concat", f"Falha na concatenação: {e}")
            returncode = -1

        # Limpa temporários
        import shutil as _shutil

        _shutil.rmtree(str(temp_dir), ignore_errors=True)

        if returncode != 0:
            raise RuntimeError("ffmpeg_concat falhou")

    @staticmethod
    async def _gerar_metadados_txt(corte_id: str, upload_dir: Path):
        """Gera arquivo de texto com metadados prontos para copiar no YouTube Studio."""
        from app.models import MetadadoCorte
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = result.scalar_one_or_none()

        if not meta:
            return

        tags = json.loads(meta.tags_youtube or "[]")
        conteudo = f"""=== TÍTULO ===
{meta.titulo_youtube}

=== DESCRIÇÃO ===
{meta.descricao_youtube}

=== TAGS ===
{", ".join(tags)}
"""
        (upload_dir / "metadados.txt").write_text(conteudo, encoding="utf-8")

    @staticmethod
    async def processar_multiversion(
        corte_id: str,
        filtros: list[str] | None = None,
        preview: bool = False,
        preview_segundos: int = 10,
    ):
        """
        Gera múltiplas versões do clip em paralelo, uma para cada filtro.
        - preview=False: versão completa em versoes/{filtro}/video.mp4
        - preview=True: clip de N segundos sem intro/outro em versoes/{filtro}/preview.mp4
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte or not corte.arquivo_clip_path:
                operational_error("MultiVersion", f"Clip bruto não encontrado para {corte_id}")
                return

        if filtros is None:
            filtros = list(FILTROS_CINEMA.keys())

        clip_path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
        if not clip_path.exists():
            operational_error("MultiVersion", f"Arquivo não encontrado: {clip_path}")
            return

        projeto_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        versoes_dir = projeto_dir / "versoes"
        versoes_dir.mkdir(parents=True, exist_ok=True)

        # Limpa pastas de filtros antigos que não existem mais no dicionário atual
        filtros_validos = set(FILTROS_CINEMA.keys())
        if versoes_dir.exists():
            import shutil as _shutil

            for pasta in versoes_dir.iterdir():
                if pasta.is_dir() and pasta.name not in filtros_validos:
                    _shutil.rmtree(str(pasta), ignore_errors=True)
                    operational_info("MultiVersion", f"Pasta obsoleta removida: {pasta.name}")

        async def _gerar_versao(filtro: str, sem: asyncio.Semaphore):
            async with sem:  # máximo 2 ffmpeg simultâneos — evita OOM kill
                info = FILTROS_CINEMA.get(filtro, {})
                versao_dir = versoes_dir / filtro
                versao_dir.mkdir(exist_ok=True)

                if preview:
                    # Preview rápido de N segundos sem intro/outro
                    destino = versao_dir / "preview.mp4"
                    try:
                        await ExportService._normalizar_audio(
                            clip_path, destino, filtro=filtro, preview_segundos=preview_segundos
                        )
                        operational_info(
                            "MultiVersion",
                            f"Preview '{filtro}' concluído ({preview_segundos}s): {destino}",
                        )
                    except Exception as e:
                        operational_error("MultiVersion", f"Erro no preview '{filtro}': {e}")
                else:
                    # Versão completa com intro/outro
                    normalizado = versao_dir / "clip_normalized.mkv"
                    final = versao_dir / "clip_final.mp4"
                    destino = versao_dir / "video.mp4"
                    try:
                        await ExportService._normalizar_audio(clip_path, normalizado, filtro=filtro)
                        await ExportService._adicionar_intro_outro(normalizado, final)
                        import shutil

                        shutil.copy2(str(final), str(destino))
                        operational_info("MultiVersion", f"Versão '{filtro}' concluída: {destino}")
                    except Exception as e:
                        operational_error("MultiVersion", f"Erro na versão '{filtro}': {e}")

                # Salva metadados da versão (usado em ambos os modos)
                meta_json = {
                    "filtro": filtro,
                    "nome": info.get("nome", filtro),
                    "descricao": info.get("descricao", ""),
                    "preview": preview,
                }
                (versao_dir / "meta.json").write_text(
                    json.dumps(meta_json, ensure_ascii=False), encoding="utf-8"
                )

        modo = "preview" if preview else "completo"
        sem = asyncio.Semaphore(4)
        operational_info(
            "MultiVersion", f"Gerando {len(filtros)} versões (modo={modo}, max 4 simultâneos)"
        )
        await asyncio.gather(*[_gerar_versao(f, sem) for f in filtros])
        operational_info("MultiVersion", f"Concluído para corte {corte_id}")

    @staticmethod
    async def aplicar_faststart(corte_id: str):
        """Aplica faststart num arquivo video.mp4 final de forma super rápida (sem re-encode)"""
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

        video_path = (
            projetos_dir() / corte.projeto_id / "cortes" / corte_id / "upload_ready" / "video.mp4"
        )
        if not video_path.exists():
            return {"status": "erro", "mensagem": "Video final não encontrado em upload_ready"}

        temp_path = video_path.with_name("video_temp.mp4")

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(temp_path),
        ]

        from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

        try:
            await run_ffmpeg_simple(cmd, label="faststart")
        except Exception as e:
            operational_error("faststart", f"Erro: {e}")
            if temp_path.exists():
                temp_path.unlink()
            return {"status": "erro", "mensagem": "Falha no FFmpeg ao aplicar faststart"}

        # Substitui o original
        temp_path.replace(video_path)
        return {"status": "ok", "mensagem": "Faststart aplicado com sucesso"}

    @staticmethod
    async def gerar_scripts_losslesscut_logic(projeto_id: str):
        """
        Gera o arquivo .bat ordenado e recria os .csv nomeando tudo de forma amigável.
        Extraído do router para ser reutilizado pelo pipeline automático.
        """
        import re

        from app.database import AsyncSessionLocal
        from sqlalchemy import select

        erros = []
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.arquivo_clip_path.is_not(None))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            for corte in cortes:
                try:
                    # Renomeia os clipes que ainda se chamam "clip_raw_base.mkv"
                    p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
                    if p.exists() and p.name == "clip_raw_base.mkv":
                        safe_title = re.sub(r"[^A-Za-z0-9_\- ]", "", corte.titulo_proposto)
                        safe_title = safe_title.replace(" ", "_")[:40]
                        novo_nome = f"{corte.numero:02d}_{safe_title}.mkv"
                        novo_path = p.with_name(novo_nome)
                        try:
                            p.rename(novo_path)
                            corte.arquivo_clip_path = para_relativo_ao_projeto(
                                str(novo_path), corte.projeto_id
                            )
                            # Precisamos commitar aqui para salvar o novo path no banco
                            await db.commit()
                            await db.refresh(corte)
                        except Exception as ex_ren:
                            erros.append(f"{corte.id} (Rename): {str(ex_ren)}")

                    await ExportService.gerar_csv_desvios_corte(corte.id)
                except Exception as e:
                    erros.append(f"{corte.id}: {str(e)}")

        # Cria o .bat com a ordem EXATA dos cortes usando os caminhos baseados em arquivo_clip_path
        bat_path = projetos_dir() / projeto_id / "A_Abrir_Todos_Losslesscut.bat"
        bat_path.parent.mkdir(parents=True, exist_ok=True)

        conteudo_bat = '@echo off\nchcp 65001 >nul\ncd /d "%~dp0"\necho Abrindo todos os cortes no LosslessCut sequencialmente...\n'
        base_dir = projetos_dir() / projeto_id

        # Recarrega a lista para pegar os paths atualizados se houve rename
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Corte)
                .where(Corte.projeto_id == projeto_id)
                .where(Corte.arquivo_clip_path.is_not(None))
                .order_by(Corte.numero)
            )
            cortes = result.scalars().all()

            for c in cortes:
                if c.arquivo_clip_path:
                    p = resolver_do_projeto(c.arquivo_clip_path, c.projeto_id)
                    try:
                        rel_path = p.relative_to(base_dir)
                        windows_path = str(rel_path).replace("/", "\\")
                        conteudo_bat += f'start "" "{windows_path}"\n'
                    except ValueError:
                        conteudo_bat += f'start "" "{p.resolve()}"\n'

        bat_path.write_text(conteudo_bat, encoding="utf-8")

        return {"message": f"Scripts recriados para {len(cortes)} cortes.", "erros": erros}
