"""As ações do operador sobre os trechos riscados: restaurar e desfazer (RN-36, D-1017)."""

from __future__ import annotations

import json

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte import riscados as dominio
from app.models import Corte
from app.services.corte import CorteService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


async def _corte_para_resposta(db: AsyncSession, corte_id: str) -> Corte:
    resultado = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    corte = resultado.scalar_one_or_none()
    if corte is None:
        raise NaoEncontrado("Corte não encontrado")
    return corte


async def _depois_de_mudar_os_desvios(corte_id: str) -> Corte:
    """A transcrição final segue os desvios: é dela que leem cenas, avaliação e capa."""
    await CorteService.sincronizar_transcricao_corte(corte_id)
    async with AsyncSessionLocal() as db:
        return await _corte_para_resposta(db, corte_id)


async def restaurar_desvio(corte_id: str, indice: int) -> Corte:
    """Devolve ao corte um trecho riscado e devolve o corte. RN-36."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await _corte_para_resposta(db, corte_id)
        desvios, riscados = dominio.restaurar(
            json.loads(corte.desvios or "[]"),
            dominio.riscados_gravados(corte.desvios_riscados),
            indice,
        )
        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    return await _depois_de_mudar_os_desvios(corte_id)


async def desfazer_rodada(corte_id: str) -> Corte:
    """Risca a última rodada da IA e devolve o corte. RN-36."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await _corte_para_resposta(db, corte_id)
        desvios, riscados, _rodada = dominio.desfazer_rodada(
            json.loads(corte.desvios or "[]"),
            dominio.riscados_gravados(corte.desvios_riscados),
        )
        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    return await _depois_de_mudar_os_desvios(corte_id)
