"""Rotas do histórico de avaliações de thumbnail (D-066).

Router próprio para não tocar nos routers de domínio já existentes (metadados
está sob lock). Cada rota apenas delega para `AvaliacaoThumbnailService`.
"""

import logging

from app.services.avaliacao_thumbnail import AvaliacaoThumbnailService
from app.services.padroes_thumbnail import PadroesThumbnailService
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class RegistrarAvaliacaoRequest(BaseModel):
    # Veredito rápido obrigatório; critérios e comentário são opcionais.
    veredito: str
    nota_fidelidade: int | None = Field(default=None, ge=1, le=5)
    nota_clareza: int | None = Field(default=None, ge=1, le=5)
    nota_beleza: int | None = Field(default=None, ge=1, le=5)
    nota_impacto: int | None = Field(default=None, ge=1, le=5)
    nota_honestidade: int | None = Field(default=None, ge=1, le=5)
    comentario: str = ""


@router.post("/corte/{corte_id}")
async def registrar_avaliacao(corte_id: str, body: RegistrarAvaliacaoRequest):
    """Registra uma avaliação do par prompt+imagem atual do corte."""
    notas = {
        "fidelidade": body.nota_fidelidade,
        "clareza": body.nota_clareza,
        "beleza": body.nota_beleza,
        "impacto": body.nota_impacto,
        "honestidade": body.nota_honestidade,
    }
    try:
        avaliacao = await AvaliacaoThumbnailService.registrar(
            corte_id,
            veredito=body.veredito,
            notas=notas,
            comentario=body.comentario,
        )
        return {"message": "Avaliação registrada", "avaliacao": avaliacao}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao registrar avaliação de thumbnail")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/corte/{corte_id}")
async def listar_avaliacoes_corte(corte_id: str):
    """Histórico de avaliações de um corte + resumo agregado."""
    try:
        return await AvaliacaoThumbnailService.listar_por_corte(corte_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao listar avaliações de thumbnail do corte")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("")
async def listar_avaliacoes_recentes(limite: int = 100):
    """Histórico global recente — base para o futuro agente de padrões."""
    try:
        return await AvaliacaoThumbnailService.listar_recentes(limite)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao listar avaliações de thumbnail recentes")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/padroes")
async def analisar_padroes():
    """Analisa os melhores prompts avaliados e propõe ajuste na skill (D-070).

    Operação custosa (chama o agente Claude). Devolve os padrões compilados +
    a leitura semântica do agente, ou `status=dados_insuficientes`.
    """
    try:
        return await PadroesThumbnailService.analisar()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao analisar padrões de thumbnail")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
