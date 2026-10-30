"""Router: alertas "conferir" do corte (D-998).

Router próprio, no padrão de `ordem_cortes`: `routers/cortes.py` está no teto
da catraca de tamanho (D-771).
"""

from app.routers.cortes_helpers import _corte_to_dict
from app.routers.cortes_schemas import CorteResponse
from app.services.alertas_conferir import marcar_alerta_conferido
from fastapi import APIRouter

router = APIRouter()


@router.post("/{corte_id}/{alerta_id}/conferido", response_model=CorteResponse)
async def marcar_conferido(corte_id: str, alerta_id: str):
    """O editor conferiu o fato: o alerta sai da timeline e o trecho segue no corte."""
    return _corte_to_dict(await marcar_alerta_conferido(corte_id, alerta_id))
