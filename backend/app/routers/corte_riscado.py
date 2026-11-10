"""Router: riscar o corte (D-1088).

Router próprio, como `riscados` e `origem_das_cenas`: `routers/cortes.py` está no
teto da catraca de tamanho (D-771).
"""

from dataclasses import asdict

from app.routers.resposta_api import RespostaApi
from app.services import riscar_corte
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class RiscarCorteRequest(BaseModel):
    # Opcional: R risca sem perguntar, e o motivo chega depois, se vier (D-1006).
    motivo: str | None = None


class CorteTrazidoDeVoltaResponse(RespostaApi):
    corte_id: str
    status: str
    gerando_bruto: bool


class CorteRiscadoResponse(RespostaApi):
    corte_id: str
    status_anterior: str
    liberado_mb: float
    retido_mb: float
    nao_removidos: list[str]


@router.post("/{corte_id}/riscar", response_model=CorteRiscadoResponse)
async def riscar(corte_id: str, body: RiscarCorteRequest | None = None):
    """Risca o corte: fica no banco como rejeitado, com a mídia solta como no Limpar."""
    motivo = body.motivo if body else None
    return asdict(await riscar_corte.riscar(corte_id, motivo))


@router.post("/{corte_id}/trazer-de-volta", response_model=CorteTrazidoDeVoltaResponse)
async def trazer_de_volta(corte_id: str):
    """Traz o corte riscado de volta e gera o bruto de novo. É a volta do Desfazer do
    aviso do editor e da seção Riscados (D-1092): as duas telas chamam esta rota."""
    return asdict(await riscar_corte.trazer_de_volta(corte_id))
