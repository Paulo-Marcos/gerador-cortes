"""
API de gerenciamento de canais (épico Multi-canal — Opção X / D-153).

Expõe o registry de canais (`services/channels.py`) como REST: listar canais e
qual é o ativo, criar um canal novo a partir do template, selecionar o ativo
(grava o ponteiro; a troca só efetiva no próximo restart) e editar a identidade.

É a base do seletor de canal na UI (D-154). Router fino: só converte HTTP ↔
serviço e mapeia os erros de domínio para os status corretos.
"""

from __future__ import annotations

from app.domain.canal import theme_library
from app.services import channel_theme as theme_service
from app.services import channels as channels_service
from app.services.channels import (
    Canal,
    CanalJaExiste,
    CanalNaoEncontrado,
    IdCanalInvalido,
)
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()


# --------------------------------------------------------------------------- #
# Temas de render por canal (D-174)
# --------------------------------------------------------------------------- #
# A paleta de render (17 cores) é OUTRA coisa que a paleta de IDENTIDADE (3 cores,
# acima em PaletaModel): esta pinta as cenas Remotion; aquela é branding/UI.


class TemaModel(BaseModel):
    id: str
    nome: str
    fonte_preset: str
    paleta: dict[str, str]


class ListaTemasResponse(BaseModel):
    temas: list[TemaModel]


class TemaSelecionadoResponse(BaseModel):
    canal_id: str
    # Id do tema efetivo do canal (o default `atual` quando o canal nunca escolheu).
    tema_id: str
    # True quando o `tema_id` veio de uma escolha explícita; False = default herdado.
    selecionado: bool


class SelecionarTemaRequest(BaseModel):
    tema_id: str


def _tema_para_model(tema: theme_library.Tema) -> TemaModel:
    return TemaModel(
        id=tema.id,
        nome=tema.nome,
        fonte_preset=tema.fonte_preset,
        paleta=dict(tema.paleta),
    )


@router.get("/temas", response_model=ListaTemasResponse)
async def listar_temas():
    """Biblioteca versionada de temas (paleta completa + preset), para o seletor."""
    return ListaTemasResponse(temas=[_tema_para_model(t) for t in theme_library.listar_temas()])


@router.get("/{canal_id}/tema", response_model=TemaSelecionadoResponse)
async def obter_tema_do_canal(canal_id: str):
    selecionado_id = theme_service.tema_selecionado_id(channel_id=canal_id)
    tema = theme_library.tema_ou_default(selecionado_id)
    return TemaSelecionadoResponse(
        canal_id=canal_id, tema_id=tema.id, selecionado=selecionado_id is not None
    )


@router.put("/{canal_id}/tema", response_model=TemaSelecionadoResponse)
async def selecionar_tema_do_canal(canal_id: str, body: SelecionarTemaRequest):
    try:
        tema = theme_service.selecionar_tema(body.tema_id, channel_id=canal_id)
    except theme_service.TemaInvalido as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return TemaSelecionadoResponse(canal_id=canal_id, tema_id=tema.id, selecionado=True)


class PaletaModel(BaseModel):
    primaria: str = ""
    secundaria: str = ""
    acento: str = ""


class CanalResponse(BaseModel):
    id: str
    handle: str
    nome: str
    credito: str
    youtube_channel_id: str = ""
    paleta: PaletaModel
    ativo: bool


class ListaCanaisResponse(BaseModel):
    canais: list[CanalResponse]
    # Id do canal ativo (None se ainda não há ponteiro válido). Redundante com o
    # flag `ativo` de cada canal, mas explícito facilita a UI (D-154).
    ativo: str | None = None


class IdentidadeModel(BaseModel):
    """Campos editáveis da identidade de um canal. Todos opcionais (merge raso)."""

    handle: str | None = None
    nome: str | None = None
    credito: str | None = None
    youtube_channel_id: str | None = None
    paleta: PaletaModel | None = None


class CriarCanalRequest(IdentidadeModel):
    id: str = Field(..., description="Id (slug) do canal — vira o nome da pasta.")


class SelecionarCanalResponse(BaseModel):
    canal_id: str
    requer_restart: bool


def _para_response(canal: Canal) -> CanalResponse:
    return CanalResponse(
        id=canal.id,
        handle=canal.handle,
        nome=canal.nome,
        credito=canal.credito,
        youtube_channel_id=canal.youtube_channel_id,
        paleta=PaletaModel(
            primaria=canal.paleta.primaria,
            secundaria=canal.paleta.secundaria,
            acento=canal.paleta.acento,
        ),
        ativo=canal.ativo,
    )


@router.get("", response_model=ListaCanaisResponse)
async def listar_canais():
    canais = channels_service.listar_canais()
    ativo = next((c.id for c in canais if c.ativo), None)
    return ListaCanaisResponse(
        canais=[_para_response(c) for c in canais],
        ativo=ativo,
    )


@router.post("", response_model=CanalResponse, status_code=201)
async def criar_canal(body: CriarCanalRequest):
    identidade = body.model_dump(exclude={"id"}, exclude_none=True)
    try:
        canal = channels_service.criar_canal(body.id, identidade or None)
    except IdCanalInvalido as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except CanalJaExiste as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return _para_response(canal)


@router.post("/{canal_id}/select", response_model=SelecionarCanalResponse)
async def selecionar_canal(canal_id: str):
    try:
        resultado = channels_service.selecionar_canal(canal_id)
    except CanalNaoEncontrado as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return SelecionarCanalResponse(
        canal_id=resultado.canal_id,
        requer_restart=resultado.requer_restart,
    )


@router.patch("/{canal_id}", response_model=CanalResponse)
async def editar_canal(canal_id: str, body: IdentidadeModel):
    identidade = body.model_dump(exclude_none=True)
    try:
        canal = channels_service.editar_identidade(canal_id, identidade)
    except CanalNaoEncontrado as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    return _para_response(canal)
