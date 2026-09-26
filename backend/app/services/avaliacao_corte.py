"""D-419: leitura e escrita da avaliação de qualidade de um corte.

Delega vocabulário e validação ao domain puro (`app.domain.corte.avaliacao_corte`) e
guarda o resultado nas colunas `voto_qualidade*` de `Corte`. Uma linha por
corte, sobrescrita a cada reavaliação: o interesse é a opinião ATUAL do editor
sobre aquele corte, não o histórico de como ela mudou.
"""

from __future__ import annotations

from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.corte.avaliacao_corte import (
    MOTIVOS_AVALIACAO,
    motivos_persistidos,
    normalizar_comentario,
    serializar_motivos,
    validar_voto,
)
from app.models import Corte
from sqlalchemy.ext.asyncio import AsyncSession


def motivos_disponiveis() -> list[dict[str, str]]:
    """Vocabulário para a UI montar os chips — fonte única, o front não duplica."""
    return [dict(motivo) for motivo in MOTIVOS_AVALIACAO]


async def obter_avaliacao(corte_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        return _serializar(await _carregar_corte(db, corte_id))


async def definir_avaliacao(
    corte_id: str,
    voto: int,
    motivos: list[str] | None = None,
    comentario: str | None = None,
) -> dict:
    voto_valido = validar_voto(voto)
    async with AsyncSessionLocal() as db:
        corte = await _carregar_corte(db, corte_id)
        corte.voto_qualidade = voto_valido
        corte.voto_qualidade_motivos = serializar_motivos(motivos)
        corte.voto_qualidade_comentario = normalizar_comentario(comentario)
        corte.voto_qualidade_em = datetime.utcnow()
        await db.commit()
        return _serializar(corte)


async def _carregar_corte(db: AsyncSession, corte_id: str) -> Corte:
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise LookupError(f"Corte {corte_id!r} não encontrado")
    return corte


def _serializar(corte: Corte) -> dict:
    return {
        "corte_id": corte.id,
        "voto": corte.voto_qualidade,
        "motivos": motivos_persistidos(corte.voto_qualidade_motivos),
        "comentario": corte.voto_qualidade_comentario or "",
        "avaliado_em": corte.voto_qualidade_em.isoformat() if corte.voto_qualidade_em else None,
    }
