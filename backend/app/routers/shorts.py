"""Router: fábrica de shorts do corte Fire (D-455).

Endpoints:
  GET  /fires                     — os cortes Fire cujo bruto ainda esta em disco
  GET  /corte/{corte_id}          — os shorts do corte, do melhor palpite ao pior
  POST /corte/{corte_id}/sugerir  — propõe agora (o fluxo normal é automático)

O disparo padrão é o fim da geração do bruto de um corte marcado com Fire. O POST
existe para o caso que o automático não cobre: o corte virou Fire **depois** de o
bruto já estar pronto, ou o corpo da skill mudou em `/canais` e você quer o
palpite novo sem regerar o vídeo.

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto), no mesmo padrão de `avaliacao_bruto`.
"""

from __future__ import annotations

from app.services import shorts as shorts_store
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/fires")
async def listar_fires():
    """A porta da tela de Shorts: os Fires que ainda tem de onde recortar."""
    return {"fires": await shorts_store.listar_fires_com_bruto()}


@router.get("/corte/{corte_id}")
async def listar(corte_id: str):
    return {"shorts": await shorts_store.listar_shorts(corte_id)}


@router.post("/corte/{corte_id}/sugerir")
async def sugerir_agora(corte_id: str):
    """Propõe os shorts do bruto atual, de forma síncrona (o caller espera)."""
    from app.services.claude_ia import ClaudeIaService

    try:
        return await ClaudeIaService.sugerir_shorts_via_claude(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
