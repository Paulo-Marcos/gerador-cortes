"""Router: avaliação de qualidade por corte (D-419).

Endpoints:
  GET /motivos            — vocabulário fechado de ressalvas (chips da UI)
  GET /corte/{corte_id}   — avaliação atual (voto NULL = nunca avaliado)
  PUT /corte/{corte_id}   — grava/atualiza a avaliação

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto) para que a avaliação nasça isolada do CRUD do corte.
"""

from __future__ import annotations

from app.services.avaliacao_corte import (
    definir_avaliacao,
    motivos_disponiveis,
    obter_avaliacao,
)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class AvaliacaoCorteRequest(BaseModel):
    voto: int
    motivos: list[str] = []
    comentario: str = ""


@router.get("/motivos")
async def listar_motivos():
    return {"motivos": motivos_disponiveis()}


@router.get("/corte/{corte_id}")
async def obter(corte_id: str):
    try:
        return await obter_avaliacao(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/corte/{corte_id}")
async def salvar(corte_id: str, body: AvaliacaoCorteRequest):
    try:
        return await definir_avaliacao(corte_id, body.voto, body.motivos, body.comentario)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
