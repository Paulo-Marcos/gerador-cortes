"""Caso de uso do alerta "conferir" (D-998): o editor dispensa um alerta do corte.

Quem cria o alerta é a geração de trechos (`CorteService.gerar_trechos_via_claude`);
a regra mora em `domain/corte/alerta_conferir`.
"""

import json

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.alerta_conferir import alertas_gravados, marcar_conferido
from app.models import Corte
from sqlalchemy import select
from sqlalchemy.orm import selectinload


async def marcar_alerta_conferido(corte_id: str, alerta_id: str) -> Corte:
    """Marca o alerta como conferido e devolve o corte. Desvios e líquido não mudam."""
    async with AsyncSessionLocal() as db, db.begin():
        resultado = await db.execute(
            select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        )
        corte = resultado.scalar_one_or_none()
        if corte is None:
            raise NaoEncontrado("Corte não encontrado")
        alertas = marcar_conferido(alertas_gravados(corte.alertas_conferir), alerta_id)
        corte.alertas_conferir = json.dumps(alertas, ensure_ascii=False)
    return corte
