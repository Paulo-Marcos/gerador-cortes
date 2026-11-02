"""Router: o boletim técnico do corte e do short (D-1015).

Endpoints:
  GET  /corte/{corte_id}           — o boletim do vídeo final (ou "medindo")
  POST /corte/{corte_id}/remedir   — descarta o boletim e mede de novo
  GET  /short/{short_id}           — o mesmo, para o short renderizado
  POST /short/{short_id}/remedir

A consulta nunca espera a medição: ela começa em segundo plano e a resposta é
`medindo` até o resultado chegar. O boletim só avisa; nada aqui bloqueia a
publicação.
"""

from __future__ import annotations

from typing import Literal

from app.routers.resposta_api import RespostaComCamposOpcionais
from app.services import boletim_tecnico as servico
from fastapi import APIRouter

router = APIRouter()


class VolumeResponse(RespostaComCamposOpcionais):
    integrado_lufs: float
    pico_dbtp: float
    lra_lu: float
    avisos: list[str]


class ParadaResponse(RespostaComCamposOpcionais):
    inicio_seg: float
    duracao_seg: float
    origem: Literal["live", "render", "nao_verificada"]


class EmendaResponse(RespostaComCamposOpcionais):
    tempo_seg: float
    com_som_dos_dois_lados: bool
    degrau: float | None = None
    acima_do_p99: bool


class EmendasResponse(RespostaComCamposOpcionais):
    total: int
    com_som_dos_dois_lados: int
    acima_do_p99: int
    p99_da_fala: float
    itens: list[EmendaResponse]


class BoletimResponse(RespostaComCamposOpcionais):
    estado: Literal["pronto", "medindo", "falhou", "arquivo_ausente"]
    medido_em: str | None = None
    erro: str | None = None
    volume: VolumeResponse | None = None
    paradas: list[ParadaResponse] | None = None
    emendas: EmendasResponse | None = None
    emendas_aviso: str | None = None


@router.get("/corte/{corte_id}", response_model=BoletimResponse, response_model_exclude_unset=True)
async def boletim_do_corte(corte_id: str):
    return await servico.consultar("corte", corte_id)


@router.post(
    "/corte/{corte_id}/remedir", response_model=BoletimResponse, response_model_exclude_unset=True
)
async def remedir_corte(corte_id: str):
    return await servico.consultar("corte", corte_id, remedir=True)


@router.get("/short/{short_id}", response_model=BoletimResponse, response_model_exclude_unset=True)
async def boletim_do_short(short_id: str):
    return await servico.consultar("short", short_id)


@router.post(
    "/short/{short_id}/remedir", response_model=BoletimResponse, response_model_exclude_unset=True
)
async def remedir_short(short_id: str):
    return await servico.consultar("short", short_id, remedir=True)
