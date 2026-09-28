"""O que o lote de publicação LÊ do banco (D-564, D-799).

Saiu do `publicacao_lote` quando ele chegou ao teto de tamanho que o CI confere
(D-771): lá ficou o que o lote FAZ — raias, estados, vigília —, aqui o que ele
consulta para decidir. São leituras puras sobre `PublicacaoShort`, `Short` e
`Corte`, sem estado em memória.
"""

from __future__ import annotations

from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.publicacao.publicacao import Plataforma
from app.domain.publicacao.ritmo_publicacao import publicados_no_dia
from app.models import PublicacaoShort
from sqlalchemy import select

ALVO_SHORT = "short"
ALVO_CORTE = "corte"


async def ja_publicados(alvo_ids: list[str]) -> dict[str, set[str]]:
    """Por alvo, as plataformas onde ele JÁ foi publicado de verdade.

    Só conta `publicado_em` preenchido: um pacote manual montado não é uma
    publicação, e tratá-lo como tal esconderia do operador o que falta subir.
    """
    if not alvo_ids:
        return {}

    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(PublicacaoShort).where(
                    PublicacaoShort.alvo_id.in_(alvo_ids),
                    PublicacaoShort.publicado_em.is_not(None),
                )
            )
        ).scalars()

        mapa: dict[str, set[str]] = {}
        for linha in linhas:
            mapa.setdefault(linha.alvo_id, set()).add(linha.plataforma)
        return mapa


async def publicados_hoje(plataforma: Plataforma) -> int:
    """Quantos já saíram hoje nesta plataforma — o que a cota do YouTube gasta."""
    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(PublicacaoShort.publicado_em).where(
                    PublicacaoShort.plataforma == plataforma.value,
                    PublicacaoShort.publicado_em.is_not(None),
                )
            )
        ).scalars()
        return publicados_no_dia([m for m in linhas if m], datetime.utcnow())


async def rotulos_dos_alvos(alvos: list[tuple[str, str]]) -> dict[str, str]:
    """O título de cada alvo, para a tela falar de vídeos e não de uuids."""
    from app.models import Corte, Short

    ids_short = [a for t, a in alvos if t == ALVO_SHORT]
    ids_corte = [a for t, a in alvos if t == ALVO_CORTE]
    rotulos: dict[str, str] = {}

    async with AsyncSessionLocal() as db:
        if ids_short:
            for short in (await db.execute(select(Short).where(Short.id.in_(ids_short)))).scalars():
                rotulos[short.id] = short.titulo_sugerido or f"Short {short.numero}"
        if ids_corte:
            for corte in (await db.execute(select(Corte).where(Corte.id.in_(ids_corte)))).scalars():
                rotulos[corte.id] = corte.titulo_proposto or f"Corte {corte.numero}"
    return rotulos


async def historico_do_corte(corte_id: str) -> list[dict]:
    """O que já foi publicado dos shorts DESTE corte — e do próprio corte.

    A tela de seleção usa isto para nascer sabendo: o operador vê de cara o que
    falta, em vez de descobrir na hora em que o lote pula metade dos itens.
    """
    from app.models import Short

    async with AsyncSessionLocal() as db:
        ids = [
            s.id
            for s in (await db.execute(select(Short).where(Short.corte_id == corte_id))).scalars()
        ]
        ids.append(corte_id)

        linhas = (
            await db.execute(
                select(PublicacaoShort)
                .where(PublicacaoShort.alvo_id.in_(ids))
                .order_by(PublicacaoShort.criado_em.desc())
            )
        ).scalars()

        return [
            {
                "alvo_id": linha.alvo_id,
                "plataforma": linha.plataforma,
                "estado": linha.estado,
                "url": linha.url,
                "detalhe": linha.detalhe,
                "publicado_em": linha.publicado_em.isoformat() if linha.publicado_em else "",
            }
            for linha in linhas
        ]
