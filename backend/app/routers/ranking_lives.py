"""Router: Ranking de Lives Candidatas (F-052).

Endpoints:
  GET  /                        — top N candidatas PENDENTES (usa cache 24h)
  POST /refresh                 — força recoleta + recalcula a pontuação
  POST /{video_id}/rejeitar     — descarta candidata da fila
  POST /{video_id}/enfileirar   — cria Projeto e dispara ingestão
"""

from __future__ import annotations

import logging

from app.services.ranking_lives import (
    RankingIndisponivel,
    definir_voto_qualidade,
    enfileirar_candidata,
    gerar_ranking,
    obter_voto_qualidade,
    rejeitar_candidata,
)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class VotoQualidadeRequest(BaseModel):
    voto: int


@router.get("")
async def listar_ranking(forcar_refresh: bool = False):
    """Top candidatas pendentes. Quando `forcar_refresh=true`, ignora o cache de 24h."""
    try:
        return await gerar_ranking(forcar_refresh=forcar_refresh)
    except RankingIndisponivel as exc:
        status = 503 if exc.quota_excedida else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/refresh")
async def refresh_ranking():
    """Atalho explícito para o botão 'Atualizar ranking' do frontend."""
    try:
        return await gerar_ranking(forcar_refresh=True)
    except RankingIndisponivel as exc:
        status = 503 if exc.quota_excedida else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/{video_id}/rejeitar")
async def rejeitar(video_id: str):
    try:
        return await rejeitar_candidata(video_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{video_id}/enfileirar")
async def enfileirar(video_id: str):
    """Cria o Projeto da candidata e dispara a ingestão, copiando a pontuação."""
    return await enfileirar_candidata(video_id)


# --------------------------------------------------------------------------- #
# Voto de qualidade da live (D-372) — endpoint irmão, não em routers/projetos.py
# (travado por f024-pos-layout-youtube, feature não relacionada a este voto).
# --------------------------------------------------------------------------- #


@router.get("/projetos/{projeto_id}/voto-qualidade")
async def obter_voto(projeto_id: str):
    try:
        return await obter_voto_qualidade(projeto_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/projetos/{projeto_id}/voto-qualidade")
async def salvar_voto(projeto_id: str, body: VotoQualidadeRequest):
    try:
        return await definir_voto_qualidade(projeto_id, body.voto)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
