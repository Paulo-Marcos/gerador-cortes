"""As consultas em lote que descrevem cada Fire da porta da fabrica (D-905).

`listar_fires_com_bruto` monta a lista inteira de uma vez, e cada sinal do
cartao — quantos shorts por status (D-458), se a mao humana ja passou (D-581),
em quais redes o corte ja esta inteiro (D-905) — e UMA consulta para todos os
cortes, nunca uma por Fire: a tela abre com dezenas deles, e o N+1 apareceria
como lentidao ja no primeiro uso real.
"""

from __future__ import annotations

from app.core.channel_paths import resolver_do_projeto
from app.domain.short.capa_do_fire import escolher_capa_do_fire
from app.domain.short.shorts_prontos import redes_do_corte
from app.models import MetadadoCorte, MetadadoShort, PublicacaoShort, Short, StatusShort
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession


async def completar(db: AsyncSession, fires: list[dict]) -> None:
    """Preenche em cada Fire os sinais que saem de consulta em lote."""
    if not fires:
        return
    ids = [f["corte_id"] for f in fires]
    contagens = await contar_shorts_por_corte(db, ids)
    edicoes = await edicao_por_corte(db, ids)
    publicados = await publicados_por_corte(db, ids)
    dos_prontos = await capas_dos_prontos_por_corte(db, ids)
    verticais = await capa_vertical_por_corte(db, ids)
    for fire in fires:
        corte_id = fire["corte_id"]
        fire["shorts"] = contagens.get(corte_id, contagem_vazia())
        fire["tem_edicao"] = edicoes.get(corte_id, False)
        # D-905: a rede acende quando TODOS os prontos do corte ja subiram.
        fire["redes"] = redes_do_corte(fire["shorts"]["renderizado"], publicados.get(corte_id, {}))
        fire["capa_path"] = _capa(
            fire["projeto_id"], dos_prontos.get(corte_id, []), verticais.get(corte_id, "")
        )


def _capa(projeto_id: str, dos_prontos: list[str], vertical: str) -> str:
    """A escolha do domínio, com o disco deste projeto respondendo "existe?"."""
    return escolher_capa_do_fire(
        dos_prontos,
        vertical,
        lambda caminho: resolver_do_projeto(caminho, projeto_id).is_file(),
    )


async def capas_dos_prontos_por_corte(
    db: AsyncSession, corte_ids: list[str]
) -> dict[str, list[str]]:
    """Por corte, as capas gravadas dos shorts PRONTOS, na ordem do numero (D-1170)."""
    linhas = (
        await db.execute(
            select(Short.corte_id, MetadadoShort.capa_path)
            .join(MetadadoShort, MetadadoShort.short_id == Short.id)
            .where(
                Short.corte_id.in_(corte_ids),
                Short.status == StatusShort.RENDERIZADO,
                MetadadoShort.capa_path != "",
            )
            .order_by(Short.corte_id, Short.numero)
        )
    ).all()
    capas: dict[str, list[str]] = {}
    for corte_id, caminho in linhas:
        capas.setdefault(corte_id, []).append(caminho)
    return capas


async def capa_vertical_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, str]:
    """Por corte, a capa 9:16 do proprio corte (D-522)."""
    linhas = (
        await db.execute(
            select(MetadadoCorte.corte_id, MetadadoCorte.thumbnail_tiktok_path).where(
                MetadadoCorte.corte_id.in_(corte_ids)
            )
        )
    ).all()
    return {corte_id: caminho or "" for corte_id, caminho in linhas}


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
