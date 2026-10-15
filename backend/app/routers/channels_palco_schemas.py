"""Os contratos HTTP do palco do canal (D-911) e do palco por escopo (D-923).

Saíram de `routers/channels.py` pelo teto de 500 linhas (D-771): o router só
monta as respostas; os formatos moram aqui.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class PosicaoModel(BaseModel):
    """Onde o componente senta, em px do quadro; `automatica` = a regra do estilo."""

    automatica: bool
    x: int
    y: int


class CabecalhoRequest(BaseModel):
    ativo: bool | None = None
    nome: str | None = None
    handle: str | None = None
    escala: float | None = None
    posicao: PosicaoModel | None = None
    posicao_short: PosicaoModel | None = None
    # D-923: desligado = o item some do cabeçalho (vazio continua herdando do canal).
    mostrar_imagem: bool | None = None
    mostrar_nome: bool | None = None
    mostrar_handle: bool | None = None


class PlacaRequest(BaseModel):
    ativo: bool | None = None
    escala: float | None = None
    posicao: PosicaoModel | None = None


class CardsRequest(BaseModel):
    """D-916: tipos de cena escondidos, tamanho e posição dos cards no layout cheio."""

    ocultos: list[str] | None = None
    escala: float | None = None
    posicao: PosicaoModel | None = None
    # D-926: como o card se apresenta dentro do espaço dele.
    ajuste: Literal["preencher", "natural"] | None = None
    alinhamento_vertical: Literal["centro", "topo", "base"] | None = None
    alinhamento_horizontal: Literal["centro", "esquerda", "direita"] | None = None


class TipoDeCenaModel(BaseModel):
    id: str
    nome: str


class CardsResponse(BaseModel):
    ocultos: list[str]
    escala: float
    posicao: PosicaoModel
    # D-926: a resposta sempre os traz; opcionais no contrato para cliente antigo
    # (e fixture) que não os conhece continuar valendo — ausente = o padrão.
    ajuste: str | None = None
    alinhamento_vertical: str | None = None
    alinhamento_horizontal: str | None = None


class PalcoComponentesRequest(BaseModel):
    """Edição parcial: campo ausente não muda."""

    estilo: Literal["atual", "limpo"] | None = None
    fundo: Literal["reticula-aurora", "reticula", "aurora", "linho", "chapado"] | None = None
    contorno_short: int | None = None
    fundo_short: Literal["palco", "eco"] | None = None
    estilo_da_legenda: Literal["contorno", "sombra"] | None = None
    cards: CardsRequest | None = None
    cabecalho: CabecalhoRequest | None = None
    placa: PlacaRequest | None = None


class CabecalhoResponse(BaseModel):
    ativo: bool
    nome: str
    handle: str
    imagem: str
    # Os textos como saem no palco (vazio herda da identidade do canal).
    escala: float
    posicao: PosicaoModel
    posicao_short: PosicaoModel
    mostrar_imagem: bool
    mostrar_nome: bool
    mostrar_handle: bool
    nome_efetivo: str
    handle_efetivo: str
    # URL da imagem que a tela mostra ao lado do @; vazia sem imagem nenhuma.
    imagem_url: str


class PlacaResponse(BaseModel):
    ativo: bool
    escala: float
    posicao: PosicaoModel


class PalcoComponentesResponse(BaseModel):
    canal_id: str
    estilo: str
    estilos: list[str]
    fundo: str
    fundos: list[str]
    contorno_short: int
    fundo_short: str
    fundos_do_short: list[str]
    estilo_da_legenda: str
    estilos_da_legenda: list[str]
    cards: CardsResponse
    tipos_de_cena: list[TipoDeCenaModel]
    cabecalho: CabecalhoResponse
    placa: PlacaResponse


class PalcoDoEscopoResponse(BaseModel):
    tipo: Literal["horizontal", "short"]
    origem: Literal["canal", "projeto", "corte"]
    efetivo: PalcoComponentesResponse
    projeto: dict[str, Any]
    corte: dict[str, Any]


class PalcoDoEscopoRequest(BaseModel):
    escopo: Literal["projeto", "corte"]
    tipo: Literal["horizontal", "short"]
    projeto_id: str
    corte_id: str | None = None
    # O palco como o modal o deixou (só o que difere do nível de cima é gravado);
    # `null` volta a herdar.
    componentes: PalcoComponentesRequest | None = None
