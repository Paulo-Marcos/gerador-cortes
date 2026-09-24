"""O fim do render: o corte fica pronto para publicar (D-758).

Gera o metadados.txt na pasta de upload, copia a thumbnail quando ela existe e
marca o corte como processado, com a pós-produção fechada. Morava no
remotion_render, que dispara o pipeline de render — e o pipeline, ao terminar,
voltava ao remotion_render para finalizar: os dois se importavam. Aqui quem
chama é o pipeline, o próprio remotion_render (tarefas órfãs) e o router.
"""

from __future__ import annotations

import asyncio
import logging
import shutil

from app.channel_paths import resolver_do_projeto
from app.models import MetadadoCorte, StatusCorte
from app.services.ciclo_de_vida import marcar_corte
from app.services.export import ExportService
from sqlalchemy import select

logger = logging.getLogger(__name__)


async def finalizar_corte_com_sucesso(db, corte, upload_ready_dir):
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

    marcar_corte(corte, StatusCorte.PROCESSADO, origem="render final")
    corte.is_pos_producao = 1
    await db.commit()
    logger.info(
        "[RemotionRender] Corte %s marcado como PROCESSADO e Pós-Produção Finalizada.",
        corte.id,
    )
