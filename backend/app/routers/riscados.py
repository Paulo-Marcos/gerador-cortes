"""Router: trechos riscados do corte (RN-36, D-1017).

Router próprio, no padrão de `alertas_conferir`: `routers/cortes.py` está no teto
da catraca de tamanho (D-771). Riscar é a rota `remover-desvio`, que já existia.
"""

from app.routers.cortes_helpers import _corte_to_dict
from app.routers.cortes_schemas import CorteResponse
from app.services import riscados
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class RestaurarDesvioRequest(BaseModel):
    riscado_index: int


@router.post("/{corte_id}/restaurar-desvio", response_model=CorteResponse)
async def restaurar_desvio(corte_id: str, body: RestaurarDesvioRequest):
    """Devolve ao corte um trecho riscado, inclusive o que o app recusou."""
    return _corte_to_dict(await riscados.restaurar_desvio(corte_id, body.riscado_index))


@router.post("/{corte_id}/desfazer-rodada", response_model=CorteResponse)
async def desfazer_rodada(corte_id: str):
    """Risca a última rodada da IA. Marca feita ou ajustada à mão fica no corte."""
    return _corte_to_dict(await riscados.desfazer_rodada(corte_id))
