"""Router: avaliação automática do bruto (D-447).

Endpoints:
  GET  /tipos                     — vocabulário de apontamentos (rótulos da UI)
  GET  /corte/{corte_id}          — última avaliação (`null` = nunca avaliado)
  GET  /corte/{corte_id}/historico — a série completa daquele corte
  GET  /projeto/{projeto_id}      — a última avaliação de cada corte da live
  POST /corte/{corte_id}          — reavalia agora (o fluxo normal é automático)

O disparo padrão é o fim da geração do bruto; o POST existe para reavaliar sem
regerar o vídeo — útil quando a skill do canal muda e você quer a nota nova.

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto), no mesmo padrão de `avaliacao_cortes`.
"""

from __future__ import annotations

from app.domain.avaliacao_bruto import tipos_disponiveis
from app.provider_ia import ProviderIA
from app.services import avaliacao_bruto as avaliacao_store
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/tipos")
async def listar_tipos():
    return {"tipos": tipos_disponiveis()}


@router.get("/corte/{corte_id}")
async def obter(corte_id: str):
    return {"avaliacao": await avaliacao_store.ultima_avaliacao(corte_id)}


@router.get("/corte/{corte_id}/historico")
async def listar_historico(corte_id: str):
    return {"avaliacoes": await avaliacao_store.historico(corte_id)}


@router.get("/projeto/{projeto_id}")
async def listar_do_projeto(projeto_id: str):
    return {"avaliacoes": await avaliacao_store.avaliacoes_do_projeto(projeto_id)}


@router.post("/corte/{corte_id}")
async def avaliar_agora(corte_id: str, provider: ProviderIA = "claude"):
    """Reavalia o bruto atual do corte, de forma síncrona (o caller espera)."""
    from app.services.claude_ia import ClaudeIaService

    try:
        return {"avaliacao": await ClaudeIaService.avaliar_bruto_via_claude(corte_id, provider)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
