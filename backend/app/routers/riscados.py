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


class VoltarABordaDaIaRequest(BaseModel):
    desvio_index: int


@router.post("/{corte_id}/desfazer-rodada", response_model=CorteResponse)
async def desfazer_rodada(corte_id: str):
    """Risca a última rodada da IA. Marca feita ou ajustada à mão fica no corte."""
    return _corte_to_dict(await riscados.desfazer_rodada(corte_id))


@router.post("/{corte_id}/voltar-a-borda-da-ia", response_model=CorteResponse)
async def voltar_a_borda_da_ia(corte_id: str, body: VoltarABordaDaIaRequest):
    """Devolve ao trecho ajustado à mão a borda que a IA deu: ele volta para a rodada."""
    return _corte_to_dict(await riscados.voltar_a_borda_da_ia(corte_id, body.desvio_index))


@router.post("/{corte_id}/manter-silencios", response_model=CorteResponse)
async def manter_silencios(corte_id: str):
    """Manter todos (P9, D-1093): risca todo silêncio do app. O bruto seguinte não o traz."""
    return _corte_to_dict(await riscados.manter_silencios(corte_id))


@router.post("/{corte_id}/tirar-silencios", response_model=CorteResponse)
async def tirar_silencios(corte_id: str):
    """Tirar todos (P9, D-1093): devolve ao corte todo silêncio riscado."""
    return _corte_to_dict(await riscados.tirar_silencios(corte_id))
