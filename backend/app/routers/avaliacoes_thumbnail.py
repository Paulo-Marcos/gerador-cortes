"""Rotas do histórico de avaliações de thumbnail (D-066).

Router próprio para não tocar nos routers de domínio já existentes (metadados
está sob lock). Cada rota apenas delega para `AvaliacaoThumbnailService`.
"""

import logging
from typing import Literal

from app.domain.compartilhado.provider_ia import ProviderIA
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from app.services.avaliacao_thumbnail import AvaliacaoThumbnailService
from app.services.padroes_thumbnail import PadroesThumbnailService
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter()


class AvaliacaoThumbnailResponse(RespostaApi):
    """Uma avaliação do par prompt+imagem (D-066). Os snapshots saem crus do
    banco — por isso admitem None."""

    id: str
    corte_id: str
    prompt_snapshot: str | None
    thumbnail_path_snapshot: str | None
    titulo_youtube_snapshot: str | None
    texto_capa_snapshot: str | None
    veredito: str
    nota_fidelidade: int | None
    nota_clareza: int | None
    nota_beleza: int | None
    nota_impacto: int | None
    nota_honestidade: int | None
    comentario: str | None
    criado_em: str | None


class ResumoAvaliacoesThumbnail(RespostaApi):
    total: int
    positivos: int
    por_veredito: dict[str, int]
    medias_criterios: dict[str, float | None]


class AvaliacoesThumbnailResponse(RespostaApi):
    avaliacoes: list[AvaliacaoThumbnailResponse]
    resumo: ResumoAvaliacoesThumbnail


class AvaliacaoRegistradaResponse(RespostaApi):
    message: str
    avaliacao: AvaliacaoThumbnailResponse


class OcorrenciaDoEixo(RespostaApi):
    valor: str
    contagem: int


class PadroesCompilados(RespostaApi):
    total_melhores: int
    com_tags: int
    eixos: dict[str, list[OcorrenciaDoEixo]]


class PadraoIdentificado(RespostaApi):
    eixo: str
    padrao: str
    evidencia: str
    forca: str


class AnalisePadroesAgente(RespostaApi):
    """A leitura do agente, já normalizada pelo domínio (`normalizar_analise`)."""

    resumo: str
    padroes: list[PadraoIdentificado]
    proposta_ajuste_skill: str


class PadroesThumbnailResponse(RespostaComCamposOpcionais):
    """`ok` traz `com_tags`; `dados_insuficientes` traz o `minimo` e nada a analisar."""

    status: Literal["ok", "dados_insuficientes"]
    total_avaliacoes: int
    total_melhores: int
    com_tags: int | None = None
    minimo: int | None = None
    padroes: PadroesCompilados | None
    analise: AnalisePadroesAgente | None


class RegistrarAvaliacaoRequest(BaseModel):
    # Veredito rápido obrigatório; critérios e comentário são opcionais.
    veredito: str
    nota_fidelidade: int | None = Field(default=None, ge=1, le=5)
    nota_clareza: int | None = Field(default=None, ge=1, le=5)
    nota_beleza: int | None = Field(default=None, ge=1, le=5)
    nota_impacto: int | None = Field(default=None, ge=1, le=5)
    nota_honestidade: int | None = Field(default=None, ge=1, le=5)
    comentario: str = ""


@router.post("/corte/{corte_id}", response_model=AvaliacaoRegistradaResponse)
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


@router.get("/corte/{corte_id}", response_model=AvaliacoesThumbnailResponse)
async def listar_avaliacoes_corte(corte_id: str):
    """Histórico de avaliações de um corte + resumo agregado."""
    try:
        return await AvaliacaoThumbnailService.listar_por_corte(corte_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao listar avaliações de thumbnail do corte")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("", response_model=AvaliacoesThumbnailResponse)
async def listar_avaliacoes_recentes(limite: int = 100):
    """Histórico global recente — base para o futuro agente de padrões."""
    try:
        return await AvaliacaoThumbnailService.listar_recentes(limite)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao listar avaliações de thumbnail recentes")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/padroes", response_model=PadroesThumbnailResponse, response_model_exclude_unset=True)
async def analisar_padroes(provider: ProviderIA = "claude"):
    """Analisa os melhores prompts avaliados e propõe ajuste na skill (D-070).

    Operação custosa (chama o agente Claude). Devolve os padrões compilados +
    a leitura semântica do agente, ou `status=dados_insuficientes`.
    """
    try:
        return await PadroesThumbnailService.analisar(provider=provider)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Erro ao analisar padrões de thumbnail")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
