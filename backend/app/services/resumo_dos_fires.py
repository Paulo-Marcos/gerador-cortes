"""As consultas em lote que descrevem cada Fire da porta da fabrica (D-905).

`listar_fires_com_bruto` monta a lista inteira de uma vez, e cada sinal do
cartao — quantos shorts por status (D-458), se a mao humana ja passou (D-581),
em quais redes o corte ja esta inteiro (D-905) — e UMA consulta para todos os
cortes, nunca uma por Fire: a tela abre com dezenas deles, e o N+1 apareceria
como lentidao ja no primeiro uso real.
"""

from __future__ import annotations

from app.models import PublicacaoShort, Short, StatusShort
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession


def contagem_vazia() -> dict[str, int]:
    """O corte sem candidato: todas as faixas em zero.

    DERIVADA do enum: um status novo em `StatusShort` passa a aparecer na tela
    sozinho, sem editar lista nenhuma.
    """
    return {"total": 0, **{s.value: 0 for s in StatusShort}}


async def edicao_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, bool]:
    """Em quais cortes a MAO HUMANA ja passou — o filtro "onde eu parei" (D-581).

    A pergunta que o operador faz ao abrir a tela nao e "quantos candidatos a IA
    propos", e sim "em qual destes eu estava trabalhando". Sao coisas diferentes:
    um corte com dez sugestoes e nenhuma decisao esta intocado, e um corte com
    uma sugestao e um gancho escrito esta no meio do caminho.

    Por isso a conta olha para os sinais que SO existem se alguem agiu:

      - o candidato foi julgado (qualquer status que nao seja `sugerido`);
      - o trecho foi marcado a mao (`origem = manual`);
      - o gancho da abertura foi escrito;
      - o palco deste trecho foi mexido — arranjo, recorte, ajuste, textura,
        preset aplicado ou cor/fonte da legenda.

    Nenhum deles nasce preenchido pela geracao: `registrar_sugestoes` cria o
    candidato com status `sugerido`, origem `ia` e os campos de palco vazios.

    Uma consulta so, pela mesma razao do `contar_shorts_por_corte`: a tela abre
    com a lista inteira, e uma query por Fire viraria lentidao no primeiro uso.
    """
    tocado = or_(
        Short.status != StatusShort.SUGERIDO,
        Short.origem == "manual",
        func.coalesce(Short.gancho_tela, "") != "",
        func.coalesce(Short.arranjo_palco, "") != "",
        func.coalesce(Short.palco_short_preset, "") != "",
        func.coalesce(Short.fundo_editorial, "") != "",
        func.coalesce(Short.legenda_cor, "") != "",
        func.coalesce(Short.recortes_palco, "{}") != "{}",
        func.coalesce(Short.ajustes_palco, "{}") != "{}",
    )
    linhas = (
        await db.execute(
            select(Short.corte_id, func.max(case((tocado, 1), else_=0)))
            .where(Short.corte_id.in_(corte_ids))
            .group_by(Short.corte_id)
        )
    ).all()
    return {corte_id: bool(marca) for corte_id, marca in linhas}


async def contar_shorts_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, dict]:
    """Quantos shorts cada corte tem, por status — numa consulta so.

    Consultar dentro do laco daria uma query por Fire; a tela abre com a lista
    inteira, entao o N+1 apareceria como lentidao ja no primeiro uso real.
    """
    linhas = (
        await db.execute(
            select(Short.corte_id, Short.status, func.count())
            .where(Short.corte_id.in_(corte_ids))
            .group_by(Short.corte_id, Short.status)
        )
    ).all()

    contagens: dict[str, dict] = {}
    for corte_id, status, quantos in linhas:
        contagem = contagens.setdefault(corte_id, contagem_vazia())
        contagem["total"] += quantos
        if status in contagem:
            contagem[status] += quantos
    return contagens


async def publicados_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, dict[str, int]]:
    """Por corte e rede, quantos shorts PRONTOS ja estao no ar (D-905).

    Conta o short, nao a linha: uma republicacao deixa duas linhas em
    `publicacoes_shorts` para o mesmo video, e o cartao pergunta "quantos
    videos subiram", nunca "quantas vezes". So vale a publicacao CONFIRMADA
    (`publicado_em`), pela mesma razao da central de prontos — a que espera o
    clique do operador ainda nao esta em lugar nenhum.
    """
    linhas = (
        await db.execute(
            select(
                Short.corte_id,
                PublicacaoShort.plataforma,
                func.count(func.distinct(PublicacaoShort.alvo_id)),
            )
            .join(PublicacaoShort, PublicacaoShort.alvo_id == Short.id)
            .where(
                Short.corte_id.in_(corte_ids),
                Short.status == StatusShort.RENDERIZADO,
                PublicacaoShort.publicado_em.is_not(None),
            )
            .group_by(Short.corte_id, PublicacaoShort.plataforma)
        )
    ).all()

    publicados: dict[str, dict[str, int]] = {}
    for corte_id, plataforma, quantos in linhas:
        publicados.setdefault(corte_id, {})[plataforma] = int(quantos)
    return publicados
