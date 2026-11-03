"""Router: de onde vem o que as cenas afirmam (D-1018).

Endpoint:
  GET /{corte_id}/cenas-remotion/conferencia — os avisos de origem de cada cena

A conferência só avisa: nada aqui altera a cena nem bloqueia a validação.
"""

from __future__ import annotations

from app.routers.resposta_api import RespostaComCamposOpcionais
from app.services import origem_das_cenas as servico
from fastapi import APIRouter

router = APIRouter()


class AvisoDeOrigemResponse(RespostaComCamposOpcionais):
    tipo: str | None
    inicio: float
    codigo: str
    mensagem: str


class ConferenciaDasCenasResponse(RespostaComCamposOpcionais):
    avisos: list[AvisoDeOrigemResponse]


@router.get("/{corte_id}/cenas-remotion/conferencia", response_model=ConferenciaDasCenasResponse)
async def conferir_origem_das_cenas(corte_id: str):
    """Os avisos de origem das cenas gravadas do corte, identificadas por tipo + início."""
    return {"avisos": await servico.conferir(corte_id)}
