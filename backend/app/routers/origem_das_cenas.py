"""Router: de onde vem o que as cenas afirmam (D-1018) e as rodadas das cenas (D-1071).

Endpoints:
  GET  /{corte_id}/cenas-remotion/conferencia — os avisos de origem de cada cena
  GET  /{corte_id}/cenas-remotion/rodadas — a rodada atual, a anterior e o diff entre elas
  POST /{corte_id}/cenas-remotion/rodadas/desfazer — volta à anterior (de novo, refaz)

A conferência só avisa: nada aqui altera a cena nem bloqueia a validação. O desfazer segura
a marca das cenas, como a geração: não troca de rodada com uma geração em curso.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.routers.cortes_helpers import com_a_marca_das_cenas
from app.routers.resposta_api import RespostaApi, RespostaComCamposOpcionais
from app.services import origem_das_cenas as servico
from fastapi import APIRouter, Depends
from pydantic import BaseModel

router = APIRouter()


class AvisoDeOrigemResponse(RespostaComCamposOpcionais):
    tipo: str | None
    inicio: float
    codigo: str
    mensagem: str


class ConferenciaDasCenasResponse(RespostaComCamposOpcionais):
    avisos: list[AvisoDeOrigemResponse]


class RodadaDasCenasResponse(RespostaApi):
    # `None` = rodada gravada antes da D-1071, sem registro de quem a gerou.
    origem: str | None
    gerada_em: datetime | None
    validadas: bool
    validadas_em: datetime | None
    cenas: list[dict[str, Any]]


class CenaQueMudouResponse(RespostaApi):
    atual: dict[str, Any]
    anterior: dict[str, Any]
    campos: list[str]


class DiferencasDasRodadasResponse(RespostaApi):
    entraram: list[dict[str, Any]]
    sairam: list[dict[str, Any]]
    mudaram: list[CenaQueMudouResponse]


class RodadasDasCenasResponse(RespostaApi):
    versao: str
    atual: RodadaDasCenasResponse
    anterior: RodadaDasCenasResponse | None
    diferencas: DiferencasDasRodadasResponse


class DesfazerRodadaRequest(BaseModel):
    # A `versao` da comparação que a tela mostrou: diferente da de agora, o desfazer recusa.
    versao: str | None = None


@router.get("/{corte_id}/cenas-remotion/conferencia", response_model=ConferenciaDasCenasResponse)
async def conferir_origem_das_cenas(corte_id: str):
    """Os avisos de origem das cenas gravadas do corte, identificadas por tipo + início."""
    return {"avisos": await servico.conferir(corte_id)}


@router.get("/{corte_id}/cenas-remotion/rodadas", response_model=RodadasDasCenasResponse)
async def comparar_rodadas_das_cenas(corte_id: str):
    """A rodada atual das cenas, a anterior e o que entrou, saiu e mudou entre elas."""
    return await servico.comparar(corte_id)


@router.post("/{corte_id}/cenas-remotion/rodadas/desfazer", response_model=RodadasDasCenasResponse)
async def desfazer_rodada_das_cenas(
    corte_id: str,
    body: DesfazerRodadaRequest | None = None,
    _marca: None = Depends(com_a_marca_das_cenas),
):
    """Volta à rodada anterior e guarda a atual no lugar dela; devolve a comparação nova."""
    return await servico.desfazer_rodada(corte_id, body.versao if body else None)
