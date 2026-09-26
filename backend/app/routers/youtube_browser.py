"""
Router: YouTube Channel Browser
Busca as lives mais recentes de um canal e permite enfileirar downloads em lote.
"""

import asyncio
import logging

from app.database import get_db
from app.services import lives_do_canal, youtube_auth
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────


class YoutubeAuthStatusResponse(BaseModel):
    """Estado do login do YouTube do canal ativo (D-169; tipado na D-721)."""

    conectado: bool
    canal_titulo: str
    cliente_configurado: bool
    client_secrets_destino: str
    fluxo_em_andamento: bool
    erro: str | None


class YoutubeAuthAcaoResponse(BaseModel):
    status: str
    mensagem: str


class EnfileirarRequest(BaseModel):
    video_ids: list[str]
    canal_origem: str = ""


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/lives")
async def listar_lives_canal(
    after_date: str = "",  # YYYYMMDD — filtra lives após esta data
    max_results: int = 25,
    db: AsyncSession = Depends(get_db),
):
    """
    Busca lives publicadas no canal configurado (youtube_channel_id) após after_date.
    Se after_date estiver vazio, usa a data da live mais recente já cadastrada no banco.
    Retorna lista de {video_id, titulo, data_publicacao, thumbnail_url, duracao_iso}.
    """
    return await lives_do_canal.listar_lives(db, after_date=after_date, max_results=max_results)


# ─── Autenticação OAuth por canal (D-169) ─────────────────────────────────────


@router.get("/auth/status", response_model=YoutubeAuthStatusResponse)
async def youtube_auth_status():
    """Estado da conexão do YouTube (login OAuth) para o canal ativo.

    D-646: lê o token do disco e pode falar com o Google — nada disso pode
    rodar no event loop, ainda mais num endpoint que a tela consulta de 2 em 2
    segundos enquanto o login acontece.
    """
    return await asyncio.to_thread(youtube_auth.status)


@router.post("/auth/conectar", response_model=YoutubeAuthAcaoResponse)
async def youtube_auth_conectar():
    """Dispara o login OAuth do canal ativo (abre o navegador; grava o token)."""
    resultado = youtube_auth.iniciar_conexao()
    if resultado.get("status") == "erro":
        raise HTTPException(status_code=400, detail=resultado.get("mensagem"))
    return resultado


@router.post("/auth/desconectar", response_model=YoutubeAuthAcaoResponse)
async def youtube_auth_desconectar():
    """Remove o token do canal ativo (desconecta a conta do YouTube)."""
    resultado = await asyncio.to_thread(youtube_auth.desconectar)
    if resultado.get("status") == "erro":
        raise HTTPException(status_code=500, detail=resultado.get("mensagem"))
    return resultado


@router.post("/enfileirar")
async def enfileirar_downloads(body: EnfileirarRequest):
    """
    Cria um Projeto para cada video_id informado e dispara o pipeline completo
    (download -> transcrição -> análise -> desvios -> cortes brutos).
    """
    return await lives_do_canal.enfileirar(body.video_ids, body.canal_origem)
