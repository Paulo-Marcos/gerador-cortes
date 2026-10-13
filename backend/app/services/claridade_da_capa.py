"""A claridade da capa do YouTube de um corte, contra a meta do canal (D-909).

Mede a capa PUBLICADA, com moldura: é ela que o espectador vê na grade, e foi
sobre ela que as referências foram medidas. A régua mora no domínio
(`domain/corte/claridade_da_capa`).
"""

from __future__ import annotations

import asyncio

from app.core.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.corte.claridade_da_capa import abaixo_da_meta, medir_claridade
from app.infrastructure.imagem.histograma import histograma_de_luminancia
from app.models import Corte, MetadadoCorte
from app.services.canal import capa_do_canal
from sqlalchemy import select


async def claridade_da_capa(corte_id: str) -> dict | None:
    """A medida da capa e a meta; None quando o corte ainda não tem capa em disco."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            return None
        meta_do_corte = (
            await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
        ).scalar_one_or_none()
        if not meta_do_corte or not meta_do_corte.thumbnail_path:
            return None
        caminho = resolver_do_projeto(meta_do_corte.thumbnail_path, corte.projeto_id)

    if not caminho.is_file():
        return None
    medida = medir_claridade(await asyncio.to_thread(histograma_de_luminancia, caminho))
    meta = capa_do_canal.meta_de_claridade()
    return {
        "luminancia": medida.luminancia,
        "escuros_pct": medida.escuros_pct,
        "luminancia_minima": meta.luminancia_minima,
        "escuros_maximo": meta.escuros_maximo,
        "abaixo_da_meta": abaixo_da_meta(medida, meta),
    }
