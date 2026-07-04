"""Router: Ranking de Lives Candidatas (F-052).

Endpoints:
  GET  /                        — top N candidatas PENDENTES (usa cache 24h)
  POST /refresh                 — força recoleta + recalcula a pontuação
  POST /{video_id}/rejeitar     — descarta candidata da fila
  POST /{video_id}/enfileirar   — cria Projeto e dispara ingestão
"""

from __future__ import annotations

import logging
import uuid

from app.database import AsyncSessionLocal
from app.infrastructure.youtube_data_api import YoutubeDataApiError
from app.models import LiveCandidata, Projeto, StatusLiveCandidata, StatusProjeto
from app.services.ingestao import IngestaoService
from app.services.ranking_lives import (
    gerar_ranking,
    marcar_promovida,
    rejeitar_candidata,
)
from app.services.tasks import fire_and_forget
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def listar_ranking(forcar_refresh: bool = False):
    """Top candidatas pendentes. Quando `forcar_refresh=true`, ignora o cache de 24h."""
    try:
        return await gerar_ranking(forcar_refresh=forcar_refresh)
    except YoutubeDataApiError as exc:
        status = 503 if exc.quota_excedida else 502
        raise HTTPException(status_code=status, detail=str(exc)) from exc


@router.post("/refresh")
async def refresh_ranking():
    """Atalho explícito para o botão 'Atualizar ranking' do frontend."""
    try:
        return await gerar_ranking(forcar_refresh=True)
    except YoutubeDataApiError as exc:
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
    """Cria Projeto reaproveitando IngestaoService, copiando a pontuação."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LiveCandidata).where(LiveCandidata.video_id == video_id).limit(1)
        )
        candidata = result.scalar_one_or_none()
        if not candidata:
            raise HTTPException(status_code=404, detail=f"Candidata {video_id!r} não encontrada")
        if candidata.status == StatusLiveCandidata.PROMOVIDA and candidata.projeto_id:
            return {
                "projeto_id": candidata.projeto_id,
                "video_id": video_id,
                "ja_existia": True,
            }

        yt_url = f"https://www.youtube.com/watch?v={video_id}"
        existente = await db.execute(select(Projeto).where(Projeto.youtube_url == yt_url).limit(1))
        projeto_existente = existente.scalar_one_or_none()
        if projeto_existente:
            candidata.status = StatusLiveCandidata.PROMOVIDA
            candidata.projeto_id = projeto_existente.id
            await db.commit()
            return {
                "projeto_id": projeto_existente.id,
                "video_id": video_id,
                "ja_existia": True,
            }

        projeto = Projeto(
            id=str(uuid.uuid4()),
            youtube_url=yt_url,
            titulo_live=candidata.titulo or "",
            canal_origem=candidata.canal_origem or "",
            data_live=_data_live_compactada(candidata),
            status=StatusProjeto.PENDENTE,
            pontuacao_ranking=candidata.pontuacao_total,
        )
        db.add(projeto)
        await db.commit()
        await db.refresh(projeto)

        candidata.status = StatusLiveCandidata.PROMOVIDA
        candidata.projeto_id = projeto.id
        await db.commit()

    fire_and_forget(
        IngestaoService.processar_projeto(projeto.id, yt_url),
        name=f"ingestao-{projeto.id[:8]}",
    )
    await marcar_promovida(video_id, projeto.id)

    return {
        "projeto_id": projeto.id,
        "video_id": video_id,
        "pontuacao_ranking": projeto.pontuacao_ranking,
        "ja_existia": False,
    }


def _data_live_compactada(candidata: LiveCandidata) -> str:
    """Espelha o formato YYYYMMDDHHMMSS usado pelos demais fluxos de Projeto."""
    if not candidata.data_publicacao:
        return ""
    return candidata.data_publicacao.strftime("%Y%m%d%H%M%S")
