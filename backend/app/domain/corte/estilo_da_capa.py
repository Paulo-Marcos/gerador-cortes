"""O estilo da capa do TikTok de um canal: desenho, componentes e posições (D-933).

## O que o operador escolhe

- **estilo**: `palco` segue o palco horizontal do corte (o que a D-932 fez
  sozinha), ou `atual`/`limpo` fixos, para a capa ter identidade própria;
- **fundo**: o fundo do estilo limpo; ausente, vale o do palco;
- **visiveis**: o que aparece. Cabeçalho do canal e acento só existem no limpo
  — no atual eles nem desenham, porque o chrome antigo não tem onde pô-los;
- **posicoes**: onde cada componente senta, em px do quadro de 1080x1920.

## A cascata é PARCIAL (RN-10)

Chave ausente é herança: posições vêm do layout global dos Ajustes (D-532) e,
por baixo dele, do padrão da geometria; visibilidade vem de `VISIVEIS_PADRAO`.
`normalizar` só limpa o que chegou — nunca preenche o que faltou.

O mesmo contrato é o `payload` do preset `capa_tiktok`: aplicar um preset é
gravar o payload dele como o estilo do canal.

Módulo puro: sem I/O.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte import capa_tiktok as geometria

# Os estilos do palco ("atual", "limpo") repetidos aqui de propósito: um
# agregado não importa outro (ADR-0015). O teste da D-933 confere que casam com
# os de `domain/canal/palco_componentes.py`; os fundos válidos chegam por
# parâmetro, do service.
ESTILO_DO_PALCO = "palco"
ESTILO_LIMPO = "limpo"
ESTILOS_DA_CAPA = (ESTILO_DO_PALCO, "atual", ESTILO_LIMPO)

COMPONENTES = (*geometria.COMPONENTES, *geometria.COMPONENTES_DO_LIMPO)

# Sem nada salvo, a capa é a de sempre: os três componentes, nenhum do limpo.
VISIVEIS_PADRAO = {
    "etiqueta": True,
    "arte": True,
    "selo": True,
    "cabecalho": False,
    "acento": False,
}

_CAMPOS_DA_POSICAO = ("x", "y", "w", "h")


class EstiloDaCapaInvalido(PedidoInvalido):
    """O estilo informado não existe."""


@dataclass(frozen=True)
class EstiloResolvido:
    """O que a capa deste corte vai desenhar, já sem herança pendente."""

    estilo: str
    fundo: str
    visiveis: dict[str, bool]
    layout: geometria.Layout


def normalizar(dados: object, fundos: tuple[str, ...] = ()) -> dict:
    """Só as chaves válidas do que chegou — parcial, como foi gravado.

    >>> normalizar({"estilo": "limpo", "visiveis": {"acento": 1, "x": True}, "lixo": 2})
    {'estilo': 'limpo', 'visiveis': {'acento': True}}
    >>> normalizar({"fundo": "linho"}, fundos=("linho",)), normalizar({"fundo": "x"}, fundos=("linho",))
    ({'fundo': 'linho'}, {})
    >>> normalizar({"posicoes": {"selo": {"y": "900", "z": 1}, "arte": "abc"}})
    {'posicoes': {'selo': {'y': 900}}}
    >>> normalizar("[1]")
    {}
    """
    if not isinstance(dados, dict):
        return {}
    limpo: dict = {}
    estilo = dados.get("estilo")
    if estilo in ESTILOS_DA_CAPA:
        limpo["estilo"] = estilo
    if dados.get("fundo") in fundos:
        limpo["fundo"] = dados["fundo"]
    visiveis = dados.get("visiveis")
    if isinstance(visiveis, dict):
        escolhas = {c: bool(visiveis[c]) for c in COMPONENTES if c in visiveis}
        if escolhas:
            limpo["visiveis"] = escolhas
    posicoes = _normalizar_posicoes(dados.get("posicoes"))
    if posicoes:
        limpo["posicoes"] = posicoes
    return limpo


def validar(dados: object, fundos: tuple[str, ...] = ()) -> dict:
    """Como `normalizar`, mas um estilo que não existe é erro, não silêncio."""
    if isinstance(dados, dict) and "estilo" in dados and dados["estilo"] not in ESTILOS_DA_CAPA:
        raise EstiloDaCapaInvalido(f"Estilo de capa desconhecido: {dados['estilo']!r}")
    return normalizar(dados, fundos)


def _normalizar_posicoes(posicoes: object) -> dict[str, dict[str, int]]:
    if not isinstance(posicoes, dict):
        return {}
    saida = {}
    for componente in COMPONENTES:
        campos = posicoes.get(componente)
        if not isinstance(campos, dict):
            continue
        numeros = {}
        for campo in _CAMPOS_DA_POSICAO:
            try:
                numeros[campo] = int(round(float(campos[campo])))
            except (KeyError, TypeError, ValueError):
                continue
        if numeros:
            saida[componente] = numeros
    return saida


def resolver(
    salvo: dict,
    *,
    estilo_do_palco: str,
    fundo_do_palco: str,
    posicoes_globais: dict | None = None,
) -> EstiloResolvido:
    """O estilo efetivo: o salvo por cima do palco, dos Ajustes e do padrão.

    >>> r = resolver({}, estilo_do_palco="atual", fundo_do_palco="linho")
    >>> (r.estilo, r.visiveis["selo"], r.visiveis["cabecalho"])
    ('atual', True, False)
    >>> r = resolver({"estilo": "limpo", "visiveis": {"acento": True}},
    ...              estilo_do_palco="atual", fundo_do_palco="linho")
    >>> (r.estilo, r.fundo, r.visiveis["acento"])
    ('limpo', 'linho', True)
    >>> resolver({"visiveis": {"acento": True}}, estilo_do_palco="atual",
    ...          fundo_do_palco="linho").visiveis["acento"]   # o atual não tem acento
    False
    """
    escolhido = salvo.get("estilo", ESTILO_DO_PALCO)
    estilo = estilo_do_palco if escolhido == ESTILO_DO_PALCO else escolhido
    fundo = salvo.get("fundo") or fundo_do_palco

    visiveis = {**VISIVEIS_PADRAO, **salvo.get("visiveis", {})}
    if estilo != ESTILO_LIMPO:
        for componente in geometria.COMPONENTES_DO_LIMPO:
            visiveis[componente] = False

    globais = posicoes_globais if isinstance(posicoes_globais, dict) else {}
    layout = geometria.montar_layout({**globais, **salvo.get("posicoes", {})})
    return EstiloResolvido(estilo=estilo, fundo=fundo, visiveis=visiveis, layout=layout)


def props_para_renderer(resolvido: EstiloResolvido, cabecalho: dict[str, str]) -> dict:
    """O que o entry da capa recebe além do texto e da arte.

    `cabecalho` é `{nome, handle, imagem}` (a imagem em data URI) e só segue
    quando ele aparece: sem uso, não engorda o JSON dos props.
    """
    props: dict = {
        "estilo": resolvido.estilo,
        "fundoLimpo": resolvido.fundo,
        "visiveis": resolvido.visiveis,
        "faixas": resolvido.layout.como_dict(),
    }
    if resolvido.visiveis["cabecalho"]:
        props["cabecalho"] = cabecalho
    return props
