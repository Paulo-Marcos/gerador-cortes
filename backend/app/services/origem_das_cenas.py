"""A origem das cenas de um corte: a conferência só lê e avisa (D-1018, RN-35); o recorte
leva as cenas junto e, se tirar a frase de alguma, desfaz a validação (D-1030, RN-36)."""

import json

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.ancora_da_cena import perdeu_frase, seguir_recorte
from app.domain.corte.corte_mapper import extrair_cenas_remotion
from app.domain.corte.origem_da_cena import conferir_cenas
from app.models import Corte


def aplicar_recorte_nas_cenas(
    corte: Corte, transcricao_nova: list, transcricao_da_live: list
) -> None:
    """Leva as cenas do corte para a transcrição nova (RN-36).

    Se o recorte tirou a frase de alguma cena, desfaz a marca de validadas: o operador
    validou aquela cena sobre aquela fala (D-1030).
    """
    cenas = seguir_recorte(
        corte.cenas_remotion, corte.transcricao_final, transcricao_nova, transcricao_da_live
    )
    if cenas is None:
        return
    if perdeu_frase(corte.cenas_remotion, cenas):
        corte.cenas_validadas = 0
        corte.cenas_validadas_em = None
    corte.cenas_remotion = cenas


async def conferir(corte_id: str) -> list[dict]:
    """Os avisos das cenas gravadas do corte, contra a transcrição final dele."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado("Corte nao encontrado")
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        return conferir_cenas(cenas, json.loads(corte.transcricao_final or "[]"))
