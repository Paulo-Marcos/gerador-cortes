import asyncio
import sys

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

import json
import logging
import shutil

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.models import Corte, MetadadoCorte, StatusCorte
from app.services.pipeline_render import renderizar_pipeline_otimizado
from app.services.render_progress import RenderProgressStore
from sqlalchemy import select

logger = logging.getLogger(__name__)


class RemotionRenderService:
    @staticmethod
    def iniciar_render_background(
        corte_id: str,
        filtro: str | None = None,
        continuar: bool = True,
        start_from: str = "auto",
        parar_em: str | None = None,
    ):
        """Dispara o pipeline oficial (composição por camadas) em background.

        Fluxo: Grade FFmpeg QSV -> Overlays Remotion em chunks -> Composição FFmpeg -> Encode final.

        Quando `filtro=None`, resolve para `AppSettings.filtro_global_padrao`
        (hoje `bypass_dourado_aberto`). Antes o default era o literal
        "cinematic_iii", que rodava o filtro mais pesado mesmo quando o
        projeto pediu outro. F-030.
        """
        if RenderProgressStore.is_running(corte_id):
            logger.warning("[RemotionRender] Render final já em execução para %s.", corte_id)
            return None

        if filtro is None:
            from app.services.app_settings import AppSettingsService

            filtro = AppSettingsService.get().filtro_global_padrao

        RenderProgressStore.start(corte_id)
        loop = asyncio.get_event_loop()
        task = loop.create_task(
            renderizar_pipeline_otimizado(
                corte_id,
                filtro=filtro,
                continuar=continuar,
                start_from=start_from,
                parar_em=parar_em,
                progress_callback=lambda progress, stage: RenderProgressStore.update(
                    corte_id, progress, stage
                ),
            )
        )

        def handle_result(t):
            try:
                t.result()
                RenderProgressStore.done(corte_id)
                logger.info("[RemotionRender] Tarefa %s concluída com sucesso.", corte_id)
            except Exception as e:
                RenderProgressStore.error(corte_id, str(e))
                logger.exception("[RemotionRender] ERRO FATAL na tarefa %s: %s", corte_id, e)

        task.add_done_callback(handle_result)
        return task

    @staticmethod
    async def finalizar_corte_com_sucesso(db, corte, upload_ready_dir):
        # inline import to avoid circular dependency (export imports remotion_render indirectly)
        from app.services.export import ExportService

        logger.info("[RemotionRender] Finalizando: Gerando metadados e copiando thumbnail...")
        await ExportService._gerar_metadados_txt(corte.id, upload_ready_dir)

        result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id))
        meta = result.scalar_one_or_none()
        if meta and meta.thumbnail_path:
            thumb_source = resolver_do_projeto(meta.thumbnail_path, corte.projeto_id)
            if thumb_source.exists():
                shutil.copy2(str(thumb_source), str(upload_ready_dir / "thumbnail.jpg"))
                logger.info("[RemotionRender] Thumbnail copiada com sucesso.")

        corte.status = StatusCorte.PROCESSADO
        corte.is_pos_producao = 1
        await db.commit()
        logger.info(
            "[RemotionRender] Corte %s marcado como PROCESSADO e Pós-Produção Finalizada.",
            corte.id,
        )

    @staticmethod
    async def sincronizar_tarefas_concluidas():
        """Varre a fila buscando `res_*.json` órfãos do worker e finaliza cortes prontos."""
        fila_dir = projetos_dir() / "fila_remotion"
        if not fila_dir.exists():
            return

        logger.info("[Sync] Iniciando sincronização de tarefas órfãs em %s...", fila_dir)

        files = list(fila_dir.glob("res_*.json"))
        if not files:
            logger.info("[Sync] Nenhuma tarefa órfã encontrada.")
            return

        async with AsyncSessionLocal() as db:
            for res_file in files:
                try:
                    with open(res_file, encoding="utf-8") as f:
                        resultado = json.load(f)

                    file_name = res_file.name
                    corte_id = file_name.replace("res_", "").replace(".json", "")
                    # Strip sufixos de subjobs do pipeline novo (chunk_*, ffmpeg_*, encode_*).
                    for sufixo in ("_ffmpeg", "_encode"):
                        if corte_id.endswith(sufixo):
                            corte_id = corte_id[: -len(sufixo)]

                    if resultado.get("status") == "sucesso":
                        corte = await db.get(Corte, corte_id)
                        if corte:
                            corte_dir = (
                                projetos_dir() / corte.projeto_id / "cortes" / corte_id
                            )
                            upload_ready_dir = corte_dir / "upload_ready"
                            if (upload_ready_dir / "video.mp4").exists():
                                await RemotionRenderService.finalizar_corte_com_sucesso(
                                    db, corte, upload_ready_dir
                                )

                    res_file.unlink()
                    logger.info("[Sync] Arquivo %s processado e removido.", file_name)

                except Exception:
                    logger.exception("[Sync] Erro ao processar arquivo %s", res_file.name)
