"""Router: Ranking de Lives Candidatas (F-052).

Endpoints:
  GET  /                        — top N candidatas PENDENTES (usa cache 24h)
  POST /refresh                 — força recoleta + recalcula a pontuação
  POST /{video_id}/rejeitar     — descarta candidata da fila
  POST /{video_id}/enfileirar   — cria Projeto e dispara ingestão
"""

from __future__ import annotations

import logging
from typing import Literal

from app.models import StatusLiveCandidata
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
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


_STATUS_CANDIDATA = tuple(s.value for s in StatusLiveCandidata)


class EmbasamentoCriterio(RespostaApi):
    """Quanto um critério contribuiu para a pontuação (D-356), com o rótulo da tela."""

    criterio: str
    rotulo: str
    valor_bruto: float
    valor_normalizado: float
    peso: float
    contribuicao: float


class LiveCandidataResponse(RespostaApi):
    id: str
    video_id: str
    titulo: str
    canal_origem: str
    youtube_url: str
    thumbnail_url: str
    duracao_iso: str
    data_publicacao: str
    views: int
    likes: int
    comentarios: int
    sentimento_score: float
    sentimento_destaques: list[str]
    pontuacao_total: float
    # Mapa plano criterio → contribuição (o que a tela antiga consumia).
    componentes_pontuacao: dict[str, float]
    embasamento: list[EmbasamentoCriterio]
    status: Literal[_STATUS_CANDIDATA]
    fetched_at: str


class RankingLivesResponse(RespostaComCamposOpcionais):
    """O TOP de candidatas. `janela_meses` só vem numa geração nova — a resposta
    do cache de 24h não o traz, e a chave não vem."""

    lives: list[LiveCandidataResponse]
    atualizado_em: str
    janela_meses: int | None = None


class CandidataRejeitadaResponse(RespostaApi):
    video_id: str
    status: str


class CandidataEnfileiradaResponse(RespostaComCamposOpcionais):
    """`ja_existia` = a live já tinha projeto; aí não há pontuação a devolver."""

    projeto_id: str
    video_id: str
    ja_existia: bool
    pontuacao_ranking: float | None = None


class VotoQualidadeResponse(RespostaApi):
    """O voto de qualidade da live (D-372) ao lado da pontuação que o ranking deu."""

    projeto_id: str
    voto_qualidade_live: int | None
    pontuacao_ranking: float


class VotoQualidadeRequest(BaseModel):
    voto: int


@router.get("", response_model=RankingLivesResponse, response_model_exclude_unset=True)
async def listar_ranking(forcar_refresh: bool = False):
    """Top candidatas pendentes. Quando `forcar_refresh=true`, ignora o cache de 24h."""
    try:
        return await gerar_ranking(forcar_refresh=forcar_refresh)
    except RankingIndisponivel as exc:
        status = 503 if exc.quota_excedida else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/refresh", response_model=RankingLivesResponse, response_model_exclude_unset=True)
async def refresh_ranking():
    """Atalho explícito para o botão 'Atualizar ranking' do frontend."""
    try:
        return await gerar_ranking(forcar_refresh=True)
    except RankingIndisponivel as exc:
        status = 503 if exc.quota_excedida else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/{video_id}/rejeitar", response_model=CandidataRejeitadaResponse)
async def rejeitar(video_id: str):
    try:
        return await rejeitar_candidata(video_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/{video_id}/enfileirar",
    response_model=CandidataEnfileiradaResponse,
    response_model_exclude_unset=True,
)
async def enfileirar(video_id: str):
    """Cria o Projeto da candidata e dispara a ingestão, copiando a pontuação."""
    return await enfileirar_candidata(video_id)


# --------------------------------------------------------------------------- #
# Voto de qualidade da live (D-372) — endpoint irmão, não em routers/projetos.py
# (travado por f024-pos-layout-youtube, feature não relacionada a este voto).
# --------------------------------------------------------------------------- #


@router.get("/projetos/{projeto_id}/voto-qualidade", response_model=VotoQualidadeResponse)
async def obter_voto(projeto_id: str):
    try:
        return await obter_voto_qualidade(projeto_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/projetos/{projeto_id}/voto-qualidade", response_model=VotoQualidadeResponse)
async def salvar_voto(projeto_id: str, body: VotoQualidadeRequest):
    try:
        return await definir_voto_qualidade(projeto_id, body.voto)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
