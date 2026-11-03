"""A conferência da origem das cenas de um corte (D-1018, RN-35): só leitura, só avisa."""

import json

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.corte_mapper import extrair_cenas_remotion
from app.domain.corte.origem_da_cena import conferir_cenas
from app.models import Corte


async def conferir(corte_id: str) -> list[dict]:
    """Os avisos das cenas gravadas do corte, contra a transcrição final dele."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte nao encontrado")
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        return conferir_cenas(cenas, json.loads(corte.transcricao_final or "[]"))
