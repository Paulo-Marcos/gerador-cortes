# D-655: aqui havia um `set_event_loop_policy` no IMPORT deste módulo, com o
# erro engolido. Política de event loop é decisão do processo, não de um serviço:
# no import, o efeito dependia de QUEM importou primeiro, e a falha era muda.
# O `main.py` já faz isso no lugar certo, antes de qualquer loop nascer.
import asyncio
import json
import logging
import os
import shutil

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.models import Corte, MetadadoCorte, StatusCorte
from app.services.cancelamento_jobs import TrabalhoEmVoo
from app.services.pipeline_render import renderizar_pipeline_otimizado
from app.services.render_progress import RenderProgressStore
from sqlalchemy import select

logger = logging.getLogger(__name__)

# D-440: gate global do pipeline. Sem ele, N cliques de render disparam N
# pipelines concorrentes disputando o worker serial — em PRD a razão
# render/clip foi de 1,16x (serial) para 4,68x (concorrente). O semáforo é
# lazy porque precisa nascer dentro do event loop do uvicorn.
# D-441: pool de 2 slots com back-pressure de RAM — o segundo render só
# entra com RENDER_MIN_RAM_LIVRE_MB de folga (a grade já flerta com OOM,
# D-322). Contador `_renders_ativos` diz se alguém já está rodando.
_render_gate: asyncio.Semaphore | None = None
_renders_ativos: int = 0


def _obter_render_gate() -> asyncio.Semaphore:
    global _render_gate
    if _render_gate is None:
        limite = max(1, int(os.getenv("RENDER_PIPELINE_CONCURRENCY", "2")))
        _render_gate = asyncio.Semaphore(limite)
    return _render_gate


def _ram_minima_para_segundo_slot_mb() -> float:
    return max(0.0, float(os.getenv("RENDER_MIN_RAM_LIVRE_MB", "8192")))


async def _aguardar_folga_de_ram(corte_id: str) -> None:
    """Segura o slot extra enquanto a RAM estiver apertada.

    Só se aplica quando já existe render ativo (o primeiro nunca espera).
    Leitura de RAM indisponível (None) não veta — vira comportamento D-440.
    """
    from app.infrastructure.memoria import ram_disponivel_mb

    limiar = _ram_minima_para_segundo_slot_mb()
    while _renders_ativos > 0:
        livre = ram_disponivel_mb()
        if livre is None or livre >= limiar:
            return
        RenderProgressStore.update(
            corte_id, 1, f"Aguardando RAM livre ({livre:.0f}MB < {limiar:.0f}MB)"
        )
        await asyncio.sleep(10)


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

        async def _rodar_com_gate():
            global _renders_ativos
            gate = _obter_render_gate()
            if gate.locked():
                RenderProgressStore.update(corte_id, 1, "Aguardando vez na fila de render")
            async with gate:
                await _aguardar_folga_de_ram(corte_id)
                _renders_ativos += 1
                try:
                    return await _rodar_pipeline()
                finally:
                    _renders_ativos -= 1

        async def _rodar_pipeline():
            return await renderizar_pipeline_otimizado(
                corte_id,
                filtro=filtro,
                continuar=continuar,
                start_from=start_from,
                parar_em=parar_em,
                progress_callback=lambda progress, stage: RenderProgressStore.update(
                    corte_id, progress, stage
                ),
            )

        loop = asyncio.get_event_loop()
        task = loop.create_task(_rodar_com_gate())

        def handle_result(t):
            try:
                t.result()
                RenderProgressStore.done(corte_id)
                logger.info("[RemotionRender] Tarefa %s concluída com sucesso.", corte_id)
            except asyncio.CancelledError:
                # D-426: o operador mandou parar. `CancelledError` é
                # BaseException, então o `except Exception` abaixo não a pegava
                # e o render ficava eternamente "running" na fila.
                RenderProgressStore.cancelled(corte_id)
                logger.info("[RemotionRender] Tarefa %s cancelada pelo operador.", corte_id)
            except Exception as e:
                RenderProgressStore.error(corte_id, str(e))
                logger.exception("[RemotionRender] ERRO FATAL na tarefa %s: %s", corte_id, e)

        task.add_done_callback(handle_result)
        # A fila global publica este render como `render:<corte>`; registrar com
        # o mesmo id é o que dá à UI um botão de cancelar que funciona (D-426).
        # O dono dos jobs do worker é o `corte_id`, definido pelo pipeline.
        TrabalhoEmVoo.registrar(f"render:{corte_id}", task, owner=corte_id)
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
                await asyncio.to_thread(
                    shutil.copy2, str(thumb_source), str(upload_ready_dir / "thumbnail.jpg")
                )
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
                            corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
                            upload_ready_dir = corte_dir / "upload_ready"
                            if (upload_ready_dir / "video.mp4").exists():
                                await RemotionRenderService.finalizar_corte_com_sucesso(
                                    db, corte, upload_ready_dir
                                )

                    res_file.unlink()
                    logger.info("[Sync] Arquivo %s processado e removido.", file_name)

                except Exception:
                    logger.exception("[Sync] Erro ao processar arquivo %s", res_file.name)
