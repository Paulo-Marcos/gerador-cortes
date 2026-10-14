"""
API de gerenciamento de canais (épico Multi-canal — Opção X / D-153).

Expõe o registry de canais (`services/channels.py`) como REST: listar canais e
qual é o ativo, criar um canal novo a partir do template, selecionar o ativo
(grava o ponteiro; a troca só efetiva no próximo restart) e editar a identidade.

É a base do seletor de canal na UI (D-154). Router fino: só converte HTTP ↔
serviço e mapeia os erros de domínio para os status corretos.
"""

from __future__ import annotations

from typing import Any, Literal

from app.domain.canal import palco_componentes as palco_dominio
from app.domain.canal import theme_library
from app.domain.canal.cards_do_canal import TIPOS_DE_CENA
from app.domain.canal.identidade import Canal, IdCanalInvalido
from app.routers.channels_palco_schemas import (
    CabecalhoResponse,
    CardsResponse,
    PalcoComponentesRequest,
    PalcoComponentesResponse,
    PalcoDoEscopoRequest,
    PalcoDoEscopoResponse,
    PlacaResponse,
    PosicaoModel,
    TipoDeCenaModel,
)
from app.services import channel_theme as theme_service
from app.services import channels as channels_service
from app.services import navegador_do_robo, palco_componentes, palco_por_escopo, studio_youtube
from app.services.channels import CanalJaExiste, CanalNaoEncontrado
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter()


# --------------------------------------------------------------------------- #
# Componentes do palco por canal (D-911)
# --------------------------------------------------------------------------- #
# Estilo do palco, cabeçalho (imagem + nome + @) e placa: o que o operador liga,
# desliga, renomeia e ilustra na tela de Canais. Os arquivos (imagem subida,
# cache do palco) são sempre os do canal ATIVO — é dele que a tela edita.


def _palco_para_response(
    canal_id: str, componentes: palco_dominio.PalcoComponentes
) -> PalcoComponentesResponse:
    nome, handle = _identidade_para_o_palco(canal_id)
    props = palco_dominio.props_para_renderer(
        componentes, nome_do_canal=nome, handle_do_canal=handle, imagem_servida=""
    )
    imagem = palco_componentes.imagem_para_servir(componentes)
    imagem_url = (
        f"/api/channels/{canal_id}/palco/imagem?v={int(imagem.stat().st_mtime)}" if imagem else ""
    )
    return PalcoComponentesResponse(
        canal_id=canal_id,
        estilo=componentes.estilo,
        estilos=list(palco_dominio.ESTILOS),
        fundo=componentes.fundo,
        fundos=list(palco_dominio.FUNDOS),
        contorno_short=componentes.contorno_short,
        fundo_short=componentes.fundo_short,
        fundos_do_short=list(palco_dominio.FUNDOS_DO_SHORT),
        estilo_da_legenda=componentes.estilo_da_legenda,
        estilos_da_legenda=list(palco_dominio.ESTILOS_DA_LEGENDA),
        cards=CardsResponse(**componentes.cards.para_dict()),
        tipos_de_cena=[TipoDeCenaModel(id=tipo, nome=nome) for tipo, nome in TIPOS_DE_CENA.items()],
        cabecalho=CabecalhoResponse(
            ativo=componentes.cabecalho.ativo,
            nome=componentes.cabecalho.nome,
            handle=componentes.cabecalho.handle,
            imagem=componentes.cabecalho.imagem,
            escala=componentes.cabecalho.escala,
            posicao=PosicaoModel(**props["cabecalho"]["posicao"]),
            posicao_short=PosicaoModel(**props["cabecalho"]["posicao_short"]),
            mostrar_imagem=componentes.cabecalho.mostrar_imagem,
            mostrar_nome=componentes.cabecalho.mostrar_nome,
            mostrar_handle=componentes.cabecalho.mostrar_handle,
            nome_efetivo=componentes.cabecalho.nome or nome.strip(),
            handle_efetivo=palco_dominio.com_handle(componentes.cabecalho.handle or handle),
            imagem_url=imagem_url,
        ),
        placa=PlacaResponse(
            ativo=componentes.placa.ativo,
            escala=componentes.placa.escala,
            posicao=PosicaoModel(**props["placa"]["posicao"]),
        ),
    )


def _identidade_para_o_palco(canal_id: str) -> tuple[str, str]:
    """O canal do palco, que tem de ser o ATIVO.

    O banco de settings e a pasta da imagem são os do canal ativo; servir outro
    id leria padrões falsos e gravaria a imagem por cima do cabeçalho do ativo.
    """
    canal = next((c for c in channels_service.listar_canais() if c.id == canal_id), None)
    if canal is None:
        raise HTTPException(status_code=404, detail=f"Canal '{canal_id}' nao encontrado")
    if not canal.ativo:
        raise HTTPException(
            status_code=409, detail=f"O palco se edita no canal ativo; ative '{canal_id}' antes."
        )
    return canal.nome, canal.handle


@router.get("/{canal_id}/palco", response_model=PalcoComponentesResponse)
async def obter_palco_do_canal(canal_id: str):
    _identidade_para_o_palco(canal_id)
    return _palco_para_response(canal_id, palco_componentes.ler(channel_id=canal_id))


@router.put("/{canal_id}/palco", response_model=PalcoComponentesResponse)
async def gravar_palco_do_canal(canal_id: str, body: PalcoComponentesRequest):
    _identidade_para_o_palco(canal_id)
    componentes = palco_componentes.gravar(body.model_dump(exclude_none=True), channel_id=canal_id)
    return _palco_para_response(canal_id, componentes)


def _palco_do_escopo(canal_id: str, resolvido: dict[str, Any]) -> PalcoDoEscopoResponse:
    efetivo = _palco_para_response(canal_id, resolvido["efetivo"])
    return PalcoDoEscopoResponse(**{**resolvido, "efetivo": efetivo})


@router.get("/{canal_id}/palco/do-escopo", response_model=PalcoDoEscopoResponse)
async def obter_palco_do_escopo(
    canal_id: str,
    projeto_id: str,
    tipo: Literal["horizontal", "short"],
    corte_id: str | None = None,
):
    """D-923: o palco que vale no corte (ou no projeto) para o tipo, e de onde ele vem."""
    _identidade_para_o_palco(canal_id)
    return _palco_do_escopo(canal_id, palco_por_escopo.resolver(projeto_id, corte_id, tipo))


@router.put("/{canal_id}/palco/do-escopo", response_model=PalcoDoEscopoResponse)
async def gravar_palco_do_escopo(canal_id: str, body: PalcoDoEscopoRequest):
    """D-923: ajusta o palco só do projeto ou só do corte — o do canal não muda."""
    _identidade_para_o_palco(canal_id)
    alvo = body.projeto_id if body.escopo == "projeto" else body.corte_id
    if not alvo:
        raise HTTPException(status_code=422, detail="Escopo de corte sem corte_id.")
    componentes = body.componentes.model_dump(exclude_none=True) if body.componentes else None
    palco_por_escopo.gravar_escolha(
        body.escopo, alvo, body.tipo, componentes, projeto_id=body.projeto_id
    )
    return _palco_do_escopo(
        canal_id, palco_por_escopo.resolver(body.projeto_id, body.corte_id, body.tipo)
    )


@router.post("/{canal_id}/palco/imagem", response_model=PalcoComponentesResponse)
async def enviar_imagem_do_cabecalho(canal_id: str, arquivo: UploadFile = File(...)):
    _identidade_para_o_palco(canal_id)
    conteudo = await arquivo.read()
    componentes = palco_componentes.salvar_imagem(
        conteudo, arquivo.content_type or "", channel_id=canal_id
    )
    return _palco_para_response(canal_id, componentes)


@router.delete("/{canal_id}/palco/imagem", response_model=PalcoComponentesResponse)
async def remover_imagem_do_cabecalho(canal_id: str):
    _identidade_para_o_palco(canal_id)
    componentes = palco_componentes.remover_imagem(channel_id=canal_id)
    return _palco_para_response(canal_id, componentes)


# Fora do contrato (`include_in_schema=False`): é um arquivo, não um JSON, e a
# tela monta a URL pela `imagem_url` da resposta tipada acima.
@router.get("/{canal_id}/palco/imagem", response_class=FileResponse, include_in_schema=False)
async def servir_imagem_do_cabecalho(canal_id: str):
    _identidade_para_o_palco(canal_id)
    """A imagem ao lado do @: a subida pelo operador ou a pose padrão do mascote."""
    imagem = palco_componentes.imagem_para_servir(palco_componentes.ler(channel_id=canal_id))
    if imagem is None:
        raise HTTPException(status_code=404, detail="O canal nao tem imagem para o cabecalho")
    tipos = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    return FileResponse(str(imagem), media_type=tipos.get(imagem.suffix.lower(), "image/png"))


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


# --------------------------------------------------------------------------- #
# Navegador do robô do TikTok e do Instagram, no canal ativo (D-832)
# --------------------------------------------------------------------------- #


class NavegadorDoRobo(BaseModel):
    navegador: Literal["chrome", "edge"]


@router.get("/ativo/navegador-do-robo", response_model=NavegadorDoRobo)
async def obter_navegador_do_robo():
    return NavegadorDoRobo(navegador=navegador_do_robo.navegador_do_canal())


@router.put("/ativo/navegador-do-robo", response_model=NavegadorDoRobo)
async def escolher_navegador_do_robo(body: NavegadorDoRobo):
    return NavegadorDoRobo(navegador=navegador_do_robo.escolher_navegador(body.navegador))


# --------------------------------------------------------------------------- #
# Robô do YouTube Studio, no canal ativo (D-895)
# --------------------------------------------------------------------------- #


class RoboDoStudio(BaseModel):
    monetizar: bool
    relacionar_short: bool


@router.get("/ativo/robo-do-studio", response_model=RoboDoStudio)
async def obter_robo_do_studio():
    return RoboDoStudio(**studio_youtube.ler_configuracao())


@router.put("/ativo/robo-do-studio", response_model=RoboDoStudio)
async def gravar_robo_do_studio(body: RoboDoStudio):
    return RoboDoStudio(
        **studio_youtube.gravar_configuracao(
            monetizar=body.monetizar, relacionar_short=body.relacionar_short
        )
    )


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
