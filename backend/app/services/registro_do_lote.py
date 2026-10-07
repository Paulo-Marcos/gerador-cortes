"""O que o lote de publicação LÊ do banco (D-564, D-799), e o "publiquei" que grava.

Saiu do `publicacao_lote` quando ele chegou ao teto de tamanho que o CI confere
(D-771): lá ficou o que o lote FAZ — raias, estados, vigília —, aqui o que ele
consulta para decidir. São leituras sobre `PublicacaoShort`, `Short` e `Corte`,
mais a gravação da confirmação à mão (D-894), sem estado em memória.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.publicacao.publicacao import Plataforma
from app.domain.publicacao.ritmo_publicacao import EstadoItem, publicados_no_dia
from app.models import PublicacaoShort
from sqlalchemy import select

ALVO_SHORT = "short"
ALVO_CORTE = "corte"
CONFIRMADO_A_MAO = "voce marcou como publicado"


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


async def gravar_confirmacao(
    alvo_id: str, plataforma: Plataforma, alvo_tipo: str, url: str
) -> str | None:
    """Grava o "publiquei" de `publicacao_lote.confirmar` e devolve o tipo do alvo.

    `None` quando ele já estava publicado: não há o que marcar de novo.
    """
    async with AsyncSessionLocal() as db:
        registro = (
            (
                await db.execute(
                    select(PublicacaoShort)
                    .where(
                        PublicacaoShort.alvo_id == alvo_id,
                        PublicacaoShort.plataforma == plataforma.value,
                    )
                    .order_by(
                        PublicacaoShort.publicado_em.is_(None).desc(),
                        PublicacaoShort.criado_em.desc(),
                    )
                )
            )
            .scalars()
            .first()
        )
        if registro is not None and registro.publicado_em is not None:
            if url and not registro.url:
                registro.url = url
                await db.commit()
            return None
        if registro is None:
            registro = PublicacaoShort(
                id=str(uuid.uuid4()),
                alvo_tipo=alvo_tipo,
                alvo_id=alvo_id,
                plataforma=plataforma.value,
            )
            db.add(registro)
        registro.estado = EstadoItem.PUBLICADO.value
        registro.detalhe = CONFIRMADO_A_MAO
        if url:
            registro.url = url
        registro.publicado_em = datetime.utcnow()
        await db.commit()
    # O tipo gravado no lote manda: o "publiquei" do painel chega sem ele.
    return registro.alvo_tipo or alvo_tipo
