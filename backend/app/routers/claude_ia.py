"""Rotas do provider Claude (geração alternativa ao n8n/Gemini).

Mantidas num router próprio para não tocar nos routers de domínio existentes
(projetos/cortes/metadados), que estão sob lock. Cada rota apenas delega para
`ClaudeIaService` e roda em background quando a operação é longa.
"""

import logging

from app.database import get_db
from app.models import Corte, Projeto
from app.services.claude_ia import ClaudeIaService
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/projeto/{projeto_id}/analisar")
async def analisar_via_claude(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Analisa a transcrição via Claude (SÍNCRONO).

    Gera os cortes primeiro e só então substitui os existentes (uma falha não
    apaga os cortes atuais), e encadeia o refazer-transcrição. Síncrono para dar
    feedback direto no front (spinner enquanto roda; erro visível). Em lives
    longas pode levar alguns minutos.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")
    try:
        resultado = await ClaudeIaService.analisar_via_claude(projeto_id)
        return {
            "message": "Análise via Claude concluída",
            "projeto_id": projeto_id,
            "provider": "claude",
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro na análise via Claude")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-trechos")
async def gerar_trechos_via_claude(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Regenera os trechos a remover (desvios) de um corte via Claude e
    ressincroniza a transcrição final.

    Síncrono (processa um único corte). Útil quando o usuário quer refazer só
    os cortes de remoção de um corte, sem reanalisar a live inteira.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_trechos_via_claude(corte_id)
        return {"message": "Trechos regerados via Claude", "corte_id": corte_id, **resultado}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar trechos via Claude")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-cenas")
async def gerar_cenas_via_claude(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera as cenas Remotion do corte via Claude (skill cenas-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_cenas_via_claude(corte_id)
        return {"message": "Cenas geradas via Claude", "corte_id": corte_id, **resultado}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar cenas via Claude")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-metadados")
async def gerar_metadados_via_claude(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera os metadados do corte via Claude (skill metadados-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_metadados_via_claude(corte_id)
        return {"message": "Metadados gerados via Claude", "corte_id": corte_id, **resultado}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar metadados via Claude")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-prompt-thumbnail")
async def gerar_prompt_thumbnail_via_claude(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera o prompt de imagem da thumbnail via Claude (skill thumbnail-prompt-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_prompt_thumbnail_via_claude(corte_id)
        return {
            "message": "Prompt de thumbnail gerado via Claude",
            "corte_id": corte_id,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar prompt de thumbnail via Claude")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
