"""D-995: a telemetria proposta×final dos shorts de um projeto.

Lê os `ShortSnapshot` do projeto e os shorts que ainda existem, e delega o diff
ao domínio puro (`app.domain.short.telemetria_shorts`). Entra no payload da
telemetria do projeto, ao lado dos cortes (`services/telemetria_cortes.py`).
"""

from app.domain.short import segmentos_short
from app.domain.short.telemetria_shorts import diff_proposta_vs_final, resumir
from app.infrastructure.snapshot_do_short import ShortSnapshot
from app.models import Short
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def do_projeto(db: AsyncSession, projeto_id: str) -> dict:
    """O resumo e uma linha por short que a IA propôs no projeto, apagados inclusive."""
    snapshots = (
        (
            await db.execute(
                select(ShortSnapshot)
                .where(ShortSnapshot.projeto_id == projeto_id)
                .order_by(ShortSnapshot.criado_em, ShortSnapshot.numero)
            )
        )
        .scalars()
        .all()
    )
    finais = await _shorts_por_id(db, [s.short_id for s in snapshots])
    linhas = [
        diff_proposta_vs_final(_proposta(s), _final(finais.get(s.short_id))) for s in snapshots
    ]
    return {"resumo": resumir(linhas), "shorts": linhas}


async def _shorts_por_id(db: AsyncSession, ids: list[str]) -> dict[str, Short]:
    if not ids:
        return {}
    result = await db.execute(select(Short).where(Short.id.in_(ids)))
    return {short.id: short for short in result.scalars().all()}


def _proposta(snapshot: ShortSnapshot) -> dict:
    return {
        "short_id": snapshot.short_id,
        "numero": snapshot.numero or 0,
        "provedor": snapshot.provedor or "",
        "modelo": snapshot.modelo or "",
        "score": snapshot.score or 0.0,
        "titulo": snapshot.titulo_sugerido or "",
        "gancho": snapshot.gancho or "",
        "inicio_seg": snapshot.inicio_seg or 0.0,
        "fim_seg": snapshot.fim_seg or 0.0,
    }


def _final(short: Short | None) -> dict | None:
    if short is None:
        return None
    inicio = short.inicio_seg or 0.0
    fim = short.fim_seg or 0.0
    # Com colagem (D-604), `fim - inicio` mente: a duração é a soma das fatias.
    duracao = segmentos_short.duracao_liquida(
        segmentos_short.de_json(short.segmentos), inicio_seg=inicio, fim_seg=fim
    )
    return {
        "status": short.status or "",
        "inicio_seg": inicio,
        "fim_seg": fim,
        "duracao_seg": duracao,
        "gancho": short.gancho or "",
    }
