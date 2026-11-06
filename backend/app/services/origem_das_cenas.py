"""A origem das cenas de um corte: a conferência só lê e avisa (D-1018, RN-35); o recorte
leva as cenas junto e, se tirar a frase de alguma, desfaz a validação (D-1030, RN-36); a
geração guarda a rodada que substituiu, para desfazer e comparar (D-1071, RN-37)."""

import json
from datetime import datetime
from typing import cast

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.corte.ancora_da_cena import levar_cenas_geradas, perdeu_frase, seguir_recorte
from app.domain.corte.corte_mapper import extrair_cenas_remotion
from app.domain.corte.origem_da_cena import conferir_cenas
from app.domain.corte.rodada_das_cenas import (
    OrigemDasCenas,
    RodadaDasCenas,
    anterior_depois_de_gerar,
    comparar_rodadas,
    versao_das_rodadas,
)
from app.models import Corte
from sqlalchemy import CursorResult, and_, update
from sqlalchemy.ext.asyncio import AsyncSession

SEM_RODADA_ANTERIOR = "Não há rodada anterior das cenas para voltar."
CENAS_MUDARAM_AO_DESFAZER = (
    "As cenas mudaram desde a comparação e a rodada não foi desfeita. Confira de novo."
)
_COLUNAS_DA_ATUAL = ("cenas_remotion", "cenas_validadas", "cenas_validadas_em")
_COLUNAS_DA_ANTERIOR = (
    "cenas_anteriores",
    "cenas_anteriores_validadas",
    "cenas_anteriores_validadas_em",
)


async def _gravar_se(db: AsyncSession, corte_id: str, condicao, valores: dict) -> bool:
    """Grava só se a condição ainda vale; o `False` manda quem chamou reler e refazer."""
    # O cast é do pyright: a execução de um UPDATE sempre devolve um CursorResult.
    gravou = cast(
        CursorResult,
        await db.execute(update(Corte).where(Corte.id == corte_id, condicao).values(**valores)),
    )
    await db.commit()
    return bool(gravou.rowcount)


def _rodadas_seguem_as_lidas(corte: Corte):
    """As duas rodadas e a marca de validadas seguem como estavam na leitura do `corte`."""
    return and_(
        Corte.cenas_remotion == corte.cenas_remotion,
        Corte.cenas_validadas == corte.cenas_validadas,
        Corte.cenas_anteriores == corte.cenas_anteriores,
    )


def _rodada_atual(corte: Corte) -> RodadaDasCenas:
    return RodadaDasCenas(
        cenas=corte.cenas_remotion,
        origem=corte.cenas_origem,
        gerada_em=corte.cenas_geradas_em,
        validadas=bool(corte.cenas_validadas),
        validadas_em=corte.cenas_validadas_em,
    )


def _rodada_anterior(corte: Corte) -> RodadaDasCenas | None:
    if corte.cenas_anteriores is None:
        return None
    return RodadaDasCenas(
        cenas=corte.cenas_anteriores,
        origem=corte.cenas_anteriores_origem,
        gerada_em=corte.cenas_anteriores_geradas_em,
        validadas=bool(corte.cenas_anteriores_validadas),
        validadas_em=corte.cenas_anteriores_validadas_em,
    )


def _colunas_da_atual(rodada: RodadaDasCenas) -> dict:
    return {
        "cenas_remotion": rodada.cenas or "[]",
        "cenas_origem": rodada.origem,
        "cenas_geradas_em": rodada.gerada_em,
        "cenas_validadas": int(rodada.validadas),
        "cenas_validadas_em": rodada.validadas_em,
    }


def _colunas_da_anterior(rodada: RodadaDasCenas | None) -> dict:
    return {
        "cenas_anteriores": rodada.cenas if rodada else None,
        "cenas_anteriores_origem": rodada.origem if rodada else None,
        "cenas_anteriores_geradas_em": rodada.gerada_em if rodada else None,
        "cenas_anteriores_validadas": int(rodada.validadas) if rodada else 0,
        "cenas_anteriores_validadas_em": rodada.validadas_em if rodada else None,
    }


def _levar_no_recorte(
    cenas: str | None, antiga: str | None, nova: list, da_live: list, colunas: tuple
) -> dict:
    """As colunas de uma rodada depois do recorte: as cenas levadas e, se alguma perdeu a
    frase, a marca de validadas desfeita (RN-36). `colunas`: cenas, validadas, validadas_em."""
    levadas = seguir_recorte(cenas, antiga, nova, da_live)
    if levadas is None:
        return {}
    coluna_das_cenas, coluna_validadas, coluna_validadas_em = colunas
    valores: dict = {coluna_das_cenas: levadas}
    if perdeu_frase(cenas, levadas):
        valores |= {coluna_validadas: 0, coluna_validadas_em: None}
    return valores


async def gravar_recorte(
    db: AsyncSession, corte: Corte, transcricao_nova: list, transcricao_da_live: list, colunas: dict
) -> None:
    """Grava a transcrição nova com as cenas levadas para ela (RN-36).

    Se o recorte tirou a frase de alguma cena, desfaz a marca de validadas: o operador
    validou aquela cena sobre aquela fala (D-1030). O `where` grava só se as cenas seguem as
    lidas: se uma geração ou edição gravou no meio, relê e leva as dela (D-1049).

    A rodada anterior vai junto (D-1071): desfazer depois do recorte traz as cenas na fala
    de agora, e não onde elas estavam antes de o trecho sair.
    """
    while True:
        await db.refresh(corte)
        antiga = corte.transcricao_final
        valores = (
            dict(colunas)
            | _levar_no_recorte(
                corte.cenas_remotion,
                antiga,
                transcricao_nova,
                transcricao_da_live,
                _COLUNAS_DA_ATUAL,
            )
            | _levar_no_recorte(
                corte.cenas_anteriores,
                antiga,
                transcricao_nova,
                transcricao_da_live,
                _COLUNAS_DA_ANTERIOR,
            )
        )
        if await _gravar_se(db, corte.id, _rodadas_seguem_as_lidas(corte), valores):
            return


async def gravar_cenas_geradas(
    db: AsyncSession,
    corte_id: str,
    resultado: dict,
    transcricao_lida: str | None,
    origem: OrigemDasCenas,
) -> dict:
    """Grava as cenas que a IA gerou sobre `transcricao_lida`, levadas para a de agora.

    RN-36, D-1049: quem edita não espera a IA, e a cena segue a frase como as gravadas. O
    `where` grava só se a transcrição não mudou desde a leitura logo acima; se mudou,
    leva de novo a partir do que a IA leu.

    D-1046: cenas novas saem sem a marca de validadas, porque ninguém as conferiu. Só o
    recorte, que leva as mesmas cenas, guarda a marca quando a frase continua lá.

    D-1071, RN-37: a rodada que sai fica guardada como a anterior, com quem a gerou, quando
    e se estava validada. O `where` também confere as rodadas lidas: uma edição gravada no
    meio entra na anterior, em vez de a anterior guardar o que não existe mais.
    """
    while True:
        corte = await _corte(db, corte_id)
        atual = corte.transcricao_final
        cenas = levar_cenas_geradas(resultado, transcricao_lida, atual)
        nova = RodadaDasCenas(
            cenas=json.dumps(cenas, ensure_ascii=False),
            origem=origem,
            gerada_em=datetime.utcnow(),
            validadas=False,
            validadas_em=None,
        )
        anterior = anterior_depois_de_gerar(_rodada_atual(corte), _rodada_anterior(corte))
        valores = _colunas_da_atual(nova) | _colunas_da_anterior(anterior)
        condicao = and_(Corte.transcricao_final == atual, _rodadas_seguem_as_lidas(corte))
        if await _gravar_se(db, corte_id, condicao, valores):
            return cenas


async def gravar_retratos(
    db: AsyncSession, corte_id: str, lidas: str | None, cenas_com_retratos: str
) -> None:
    """Grava os retratos só se as cenas seguem as lidas antes da busca (D-1065).

    A busca fica até dezenas de segundos na rede: uma geração, uma edição ou uma sincronia
    pode ter gravado nesse intervalo. Recusa em vez de reaplicar: os retratos achados ficam no
    banco do canal, e buscar de novo é rápido e parte do que o operador tem agora na tela.
    """
    valores = {"cenas_remotion": cenas_com_retratos}
    if await _gravar_se(db, corte_id, Corte.cenas_remotion == lidas, valores):
        return
    await _corte(db, corte_id)
    raise PedidoInvalido(
        "As cenas mudaram durante a busca e os retratos não foram gravados. Busque de novo."
    )


async def _corte(db: AsyncSession, corte_id: str) -> Corte:
    """O corte como está no banco agora, não o que a sessão leu antes."""
    corte = await db.get(Corte, corte_id, populate_existing=True)
    if not corte:
        raise NaoEncontrado("Corte nao encontrado")
    return corte


def _descrever(rodada: RodadaDasCenas) -> dict:
    return {
        "origem": rodada.origem,
        "gerada_em": rodada.gerada_em,
        "validadas": rodada.validadas,
        "validadas_em": rodada.validadas_em,
        "cenas": rodada.lista(),
    }


async def comparar(corte_id: str) -> dict:
    """A rodada atual, a anterior e o diff entre elas, com a versão que o desfazer confere."""
    async with AsyncSessionLocal() as db:
        corte = await _corte(db, corte_id)
        atual, anterior = _rodada_atual(corte), _rodada_anterior(corte)
    return {
        "versao": versao_das_rodadas(atual.cenas, anterior.cenas if anterior else None),
        "atual": _descrever(atual),
        "anterior": _descrever(anterior) if anterior else None,
        "diferencas": comparar_rodadas(atual.lista(), anterior.lista() if anterior else []),
    }


async def desfazer_rodada(corte_id: str, versao: str | None = None) -> dict:
    """Volta à rodada anterior e guarda a atual no lugar dela: desfazer de novo refaz (RN-37).

    Recusa, sem gravar, se as cenas mudaram desde a `versao` que a tela comparou ou entre a
    leitura e a gravação logo abaixo: a troca vale só sobre as rodadas que o operador viu.
    """
    async with AsyncSessionLocal() as db:
        corte = await _corte(db, corte_id)
        atual, anterior = _rodada_atual(corte), _rodada_anterior(corte)
        if anterior is None:
            raise PedidoInvalido(SEM_RODADA_ANTERIOR)
        if versao is not None and versao != versao_das_rodadas(atual.cenas, anterior.cenas):
            raise PedidoInvalido(CENAS_MUDARAM_AO_DESFAZER)
        valores = _colunas_da_atual(anterior) | _colunas_da_anterior(atual)
        if not await _gravar_se(db, corte_id, _rodadas_seguem_as_lidas(corte), valores):
            await _corte(db, corte_id)
            raise PedidoInvalido(CENAS_MUDARAM_AO_DESFAZER)
    return await comparar(corte_id)


async def conferir(corte_id: str) -> list[dict]:
    """Os avisos das cenas gravadas do corte, contra a transcrição final dele."""
    async with AsyncSessionLocal() as db:
        corte = await _corte(db, corte_id)
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        return conferir_cenas(cenas, json.loads(corte.transcricao_final or "[]"))
