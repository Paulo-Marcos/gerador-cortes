"""Rotas do provider Claude (geração alternativa ao n8n/Gemini).

Mantidas num router próprio para não tocar nos routers de domínio existentes
(projetos/cortes/metadados), que estão sob lock. Cada rota apenas delega para
`ClaudeIaService` e roda em background quando a operação é longa.
"""

import logging

from app.database import get_db
from app.models import Corte, Projeto
from app.provider_ia import provider_do_modelo
from app.services import llm_calls_store
from app.services.claude_ia import ClaudeIaService, ProviderIA
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/projeto/{projeto_id}/analisar")
async def analisar_via_claude(
    projeto_id: str,
    usar_diarizacao: bool = True,
    provider: ProviderIA = "claude",
    db: AsyncSession = Depends(get_db),
):
    """Analisa a transcrição via Claude (SÍNCRONO).

    Gera os cortes primeiro e só então substitui os existentes (uma falha não
    apaga os cortes atuais), e encadeia o refazer-transcrição. Síncrono para dar
    feedback direto no front (spinner enquanto roda; erro visível). Em lives
    longas pode levar alguns minutos.

    D-286: `usar_diarizacao` (default True) injeta o rótulo de falante quando o
    projeto já foi diarizado; passe False para analisar ignorando os falantes.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(
            status_code=400,
            detail=(
                "Este projeto não tem transcrição gravada. Use 'Refazer transcrição' "
                "para baixar as legendas do YouTube e então rode a análise."
            ),
        )
    try:
        resultado = await ClaudeIaService.analisar_via_claude(
            projeto_id, usar_diarizacao=usar_diarizacao, provider=provider
        )
        return {
            "message": "Análise via IA concluída",
            "projeto_id": projeto_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro na análise via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-trechos")
async def gerar_trechos_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Regenera os trechos a remover (desvios) de um corte via Claude e
    ressincroniza a transcrição final.

    Síncrono (processa um único corte). Útil quando o usuário quer refazer só
    os cortes de remoção de um corte, sem reanalisar a live inteira.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_trechos_via_claude(corte_id, provider=provider)
        return {
            "message": "Trechos regerados via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar trechos via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-cenas")
async def gerar_cenas_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Gera as cenas Remotion do corte via Claude (skill cenas-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_cenas_via_claude(corte_id, provider=provider)
        return {
            "message": "Cenas geradas via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar cenas via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-metadados")
async def gerar_metadados_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Gera os metadados do corte via Claude (skill metadados-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_metadados_via_claude(corte_id, provider=provider)
        return {
            "message": "Metadados gerados via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar metadados via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar-prompt-thumbnail")
async def gerar_prompt_thumbnail_via_claude(
    corte_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Gera o prompt de imagem da thumbnail via Claude (skill thumbnail-prompt-expert)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    try:
        resultado = await ClaudeIaService.gerar_prompt_thumbnail_via_claude(
            corte_id, provider=provider
        )
        return {
            "message": "Prompt de thumbnail gerado via IA",
            "corte_id": corte_id,
            "provider": provider,
            **resultado,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao gerar prompt de thumbnail via Claude/Gemini")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# --------------------------------------------------------------------------- #
# Telemetria das chamadas de IA (D-353)
# --------------------------------------------------------------------------- #
# Montada NESTE router (`/api/claude`, provider Claude) para não exigir registro
# de um router novo em main.py (travado) — e é o lugar semântico: telemetria das
# chamadas do Claude vive ao lado das rotas que as disparam. Somente leitura; a
# gravação acontece de forma não-fatal dentro do próprio client (claude_cli_client).


class LlmCallResponse(BaseModel):
    """Uma chamada de IA registrada, para a Área de Análises."""

    id: str
    ts: str
    etapa: str | None = None
    model: str | None = None
    projeto_id: str | None = None
    corte_id: str | None = None
    short_id: str | None = None
    prompt: str | None = None
    resposta: str | None = None
    tokens_in: int | None = None
    tokens_out: int | None = None
    custo_usd: float | None = None
    duracao_ms_servidor: float | None = None
    latencia_ms_wall: float | None = None
    sucesso: bool
    erro_tipo: str | None = None


class ListaLlmCallsResponse(BaseModel):
    chamadas: list[LlmCallResponse]


class UltimaGeracaoResponse(BaseModel):
    """Quem fez a última geração de uma etapa, para o selo na tela."""

    provider: str | None = None
    model: str | None = None
    ts: str | None = None


@router.get("/telemetria/ultima-geracao", response_model=UltimaGeracaoResponse)
async def ultima_geracao(
    etapa: str,
    corte_id: str | None = None,
    short_id: str | None = None,
):
    """A última chamada bem-sucedida desta etapa — de onde sai o selo Claude/Gemini.

    Sai da telemetria, e não de uma coluna por entidade: o nome do modelo já é
    gravado a cada chamada. Best-effort por natureza — telemetria é acessória e
    pode faltar; sem registro, a tela simplesmente não mostra selo.
    """
    ultima = llm_calls_store.ultima_geracao_bem_sucedida(
        etapa=etapa, corte_id=corte_id, short_id=short_id
    )
    if ultima is None:
        return UltimaGeracaoResponse()
    return UltimaGeracaoResponse(
        provider=provider_do_modelo(ultima["model"]),
        model=ultima["model"],
        ts=ultima["ts"],
    )


@router.get("/telemetria/llm-calls", response_model=ListaLlmCallsResponse)
async def listar_llm_calls(
    projeto_id: str | None = None,
    corte_id: str | None = None,
    short_id: str | None = None,
    etapa: str | None = None,
    limite: int = 100,
):
    """Lista as chamadas de IA registradas (mais recentes primeiro), com filtros
    opcionais por projeto/corte/etapa. Alimenta a aba "Chamadas de IA" em Análises.
    """
    registros = llm_calls_store.listar_llm_calls(
        projeto_id=projeto_id,
        corte_id=corte_id,
        short_id=short_id,
        etapa=etapa,
        limite=max(1, min(limite, 500)),
    )
    return ListaLlmCallsResponse(
        chamadas=[LlmCallResponse(**{**r, "sucesso": bool(r["sucesso"])}) for r in registros]
    )
