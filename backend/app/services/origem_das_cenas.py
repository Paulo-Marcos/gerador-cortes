"""A origem das cenas de um corte: a conferência só lê e avisa (D-1018, RN-35); o recorte
leva as cenas junto e, se tirar a frase de alguma, desfaz a validação (D-1030, RN-36)."""

import json
from typing import cast

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.ancora_da_cena import levar_cenas_geradas, perdeu_frase, seguir_recorte
from app.domain.corte.corte_mapper import extrair_cenas_remotion
from app.domain.corte.origem_da_cena import conferir_cenas
from app.models import Corte
from sqlalchemy import CursorResult, update
from sqlalchemy.ext.asyncio import AsyncSession


async def _gravar_se(db: AsyncSession, corte_id: str, condicao, valores: dict) -> bool:
    """Grava só se a condição ainda vale; o `False` manda quem chamou reler e refazer."""
    # O cast é do pyright: a execução de um UPDATE sempre devolve um CursorResult.
    gravou = cast(
        CursorResult,
        await db.execute(update(Corte).where(Corte.id == corte_id, condicao).values(**valores)),
    )
    await db.commit()
    return bool(gravou.rowcount)


async def gravar_recorte(
    db: AsyncSession, corte: Corte, transcricao_nova: list, transcricao_da_live: list, colunas: dict
) -> None:
    """Grava a transcrição nova com as cenas levadas para ela (RN-36).

    Se o recorte tirou a frase de alguma cena, desfaz a marca de validadas: o operador
    validou aquela cena sobre aquela fala (D-1030). O `where` grava só se as cenas seguem as
    lidas: se uma geração ou edição gravou no meio, relê e leva as dela (D-1049).
    """
    while True:
        await db.refresh(corte)
        lidas = corte.cenas_remotion
        valores = dict(colunas)
        cenas = seguir_recorte(
            lidas, corte.transcricao_final, transcricao_nova, transcricao_da_live
        )
        if cenas is not None:
            valores["cenas_remotion"] = cenas
            if perdeu_frase(lidas, cenas):
                valores |= {"cenas_validadas": 0, "cenas_validadas_em": None}
        if await _gravar_se(db, corte.id, Corte.cenas_remotion == lidas, valores):
            return


async def gravar_cenas_geradas(
    db: AsyncSession, corte_id: str, resultado: dict, transcricao_lida: str | None
) -> dict:
    """Grava as cenas que a IA gerou sobre `transcricao_lida`, levadas para a de agora.

    RN-36, D-1049: quem edita não espera a IA, e a cena segue a frase como as gravadas. O
    `where` grava só se a transcrição não mudou desde a leitura logo acima; se mudou,
    leva de novo a partir do que a IA leu. Cena sem a frase desfaz a marca de validadas.
    """
    while True:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte nao encontrado")
        await db.refresh(corte)
        atual = corte.transcricao_final
        cenas = levar_cenas_geradas(resultado, transcricao_lida, atual)
        gravadas = json.dumps(cenas, ensure_ascii=False)
        valores: dict = {"cenas_remotion": gravadas}
        if perdeu_frase(None, gravadas):
            valores |= {"cenas_validadas": 0, "cenas_validadas_em": None}
        if await _gravar_se(db, corte_id, Corte.transcricao_final == atual, valores):
            return cenas


async def conferir(corte_id: str) -> list[dict]:
    """Os avisos das cenas gravadas do corte, contra a transcrição final dele."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte nao encontrado")
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        return conferir_cenas(cenas, json.loads(corte.transcricao_final or "[]"))
