"""Router: ordem dos cortes de um projeto (D-448).

Endpoints:
  POST /projeto/{projeto_id}/normalizar  — solta todos os pins e volta ao tempo
  PUT  /corte/{corte_id}/posicao         — fixa (ou solta) UM corte numa posição

A ordem PADRÃO é cronológica e não precisa de endpoint: ela é recalculada pelo
`CorteService` a cada operação que cria ou move corte. O que mora aqui é só o
desvio explícito dessa ordem — e o desfazer dele.

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto), no mesmo padrão de `avaliacao_cortes`.
"""

from __future__ import annotations

from app.database import get_db
from app.routers.cortes_helpers import _corte_to_dict
from app.routers.cortes_schemas import CorteResponse
from app.services.corte import CorteService
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


class FixarPosicaoRequest(BaseModel):
    """`posicao` 1-based; `None` solta o corte e o devolve à ordem do tempo."""

    posicao: int | None = None


@router.post("/projeto/{projeto_id}/normalizar", response_model=list[CorteResponse])
async def normalizar_ordem(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Devolve a lista inteira à ordem cronológica, soltando todos os pins."""
    try:
        cortes = await CorteService.normalizar_ordem(db, projeto_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return [_corte_to_dict(c) for c in cortes]


@router.put("/corte/{corte_id}/posicao", response_model=list[CorteResponse])
async def fixar_posicao(
    corte_id: str, body: FixarPosicaoRequest, db: AsyncSession = Depends(get_db)
):
    """Fixa o corte numa posição da lista, ou o solta quando `posicao` é nulo."""
    try:
        cortes = await CorteService.fixar_posicao(db, corte_id, body.posicao)
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return [_corte_to_dict(c) for c in cortes]
