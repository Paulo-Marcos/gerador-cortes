"""Rotas de diarização de falantes (D-286).

Router próprio (não toca os routers de domínio sob lock). Dispara a diarização
sob demanda, expõe o mapa de falantes e permite rebatizá-los (nome + is_canal).
"""

import logging
from typing import Any

from app.database import get_db
from app.models import Corte, Projeto
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from app.services.diarizacao import DiarizacaoService
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


class FalanteInfo(RespostaApi):
    """Um falante da diarização: o nome batizado e se é o canal (D-286)."""

    nome: str
    is_canal: bool


class FalantesResponse(RespostaApi):
    """Mapa `{speaker_id: falante}`, ex.: `{"SPEAKER_00": {"nome": "Pedro", "is_canal": true}}`."""

    falantes: dict[str, FalanteInfo]


class DiarizacaoResponse(RespostaComCamposOpcionais):
    """`ok=False` traz só o `motivo` (degradação graciosa); `ok=True`, os falantes
    e qual deles é o canal."""

    ok: bool
    motivo: str | None = None
    falantes: dict[str, FalanteInfo] | None = None
    canal: str | None = None


@router.post(
    "/projeto/{projeto_id}/diarizar",
    response_model=DiarizacaoResponse,
    response_model_exclude_unset=True,
)
async def diarizar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Roda a diarização do projeto e anota os falantes na transcrição (SÍNCRONO).

    Degradação graciosa: sem token/lib ou em falha de inferência retorna
    `ok=False` com o motivo — a transcrição fica intacta, sem rótulo.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    try:
        return await DiarizacaoService.diarizar_projeto(projeto_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro na diarização")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post(
    "/corte/{corte_id}/diarizar",
    response_model=DiarizacaoResponse,
    response_model_exclude_unset=True,
)
async def diarizar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Diariza apenas a janela de um corte específico (D-360, SÍNCRONO).

    Útil quando só um corte precisa de rótulo de falante — evita rodar a
    diarização no vídeo inteiro. Mesma degradação graciosa do endpoint de projeto.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        return await DiarizacaoService.diarizar_corte(corte_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro na diarização do corte")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/projeto/{projeto_id}/falantes", response_model=FalantesResponse)
async def obter_falantes(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Devolve o mapa de falantes do projeto (vazio se ainda não diarizado)."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return {"falantes": await DiarizacaoService.obter_falantes(projeto_id)}


@router.put("/projeto/{projeto_id}/falantes", response_model=FalantesResponse)
async def atualizar_falantes(
    projeto_id: str,
    # Qualquer forma: o serviço normaliza (nome/is_canal) em vez de recusar (422).
    falantes: dict[str, Any] = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    """Rebatiza os falantes (nome + quem é o canal), sem reprocessar nada."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    try:
        atualizado = await DiarizacaoService.atualizar_falantes(projeto_id, falantes)
        return {"falantes": atualizado}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
