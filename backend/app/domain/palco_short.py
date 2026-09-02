"""Geometria do palco vertical do short (E-036, D-486).

## O problema que este módulo resolve

O short recortava uma janela 9:16 do quadro cru da live. Tudo que estivesse ali
dentro vinha junto — inclusive o chrome da própria transmissão (no acervo atual,
uma moldura verde-limão com a faixa "ASSINANTE"). Não havia cor escolhida: era
cópia de pixel.

O pipeline horizontal nunca teve esse problema, e não é porque ele esconde o
chrome — é porque **nunca o pega**. Ele recorta REGIÕES nomeadas (a facecam, a
tela compartilhada) e as recoloca em SLOTS sobre um fundo próprio. O que fica de
fora do recorte simplesmente não existe no resultado.

## A regra que rege tudo aqui

    o CROP vem da região (do preset do canal)
    o SLOT vem do modelo (deste arquivo)

Os dois formatos partem do MESMO quadro-fonte, então as regiões que o operador
já mantém para o horizontal valem inteiras aqui. O que muda entre 16:9 e 9:16
não é onde recortar — é onde colar. Foi essa constatação que tornou o palco
vertical um trabalho de slots, e não um cadastro novo.

Sem I/O: só a aritmética. A string do ffmpeg mora em `ffmpeg_short`.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.formato_video import VERTICAL

CANVAS = VERTICAL
"""1080x1920 — o quadro do short. Todo slot deste arquivo vive dentro dele."""

# Fração da altura que pertence à UI dos apps, em cima e embaixo. Espelha
# SAFE_ZONE em `video-renderer/src/cenas-shorts/LegendaShort.tsx`: conteúdo
# colocado ali é conteúdo que o botão de curtir tapa.
SAFE_ZONE = 0.18
_TOPO_SEGURO = int(CANVAS.altura * SAFE_ZONE)  # 345


class Ajuste(str, Enum):
    """Como o recorte se acomoda no slot quando as proporções não batem.

    A escolha não é estética, é editorial, e muda por tipo de conteúdo:

    COBRIR  — preenche o slot e corta o excesso. Certo para ROSTO: sobra de
              testa ou de ombro não custa nada, e uma tarja ao lado da pessoa
              num short é espaço morto no formato mais disputado que existe.

    CABER   — encaixa inteiro, deixando folga. Certo para TELA COMPARTILHADA:
              cortar ali esconde justamente o que a pessoa está mostrando, e
              ninguém rebobina um short para ler o pedaço que faltou.
    """

    COBRIR = "cobrir"
    CABER = "caber"


@dataclass(frozen=True)
class Slot:
    """Onde um recorte é colado no quadro do short."""

    x: int
    y: int
    w: int
    h: int
    ajuste: Ajuste

    @property
    def fim_y(self) -> int:
        return self.y + self.h


@dataclass(frozen=True)
class ModeloPalco:
    """Um arranjo de slots — o "estilo" do short.

    `regioes_exigidas` é o que o modelo NÃO funciona sem. Um modelo que pede a
    tela e não a recebe não deve cair num arranjo meia-boca em silêncio: ele
    deve dizer que falta, para o operador escolher outro modelo ou marcar a
    região.
    """

    id: str
    nome: str
    porque: str
    slots: dict[str, Slot]

    @property
    def regioes_exigidas(self) -> frozenset[str]:
        return frozenset(self.slots)


# ── Os quatro modelos ───────────────────────────────────────────────────────
#
# As alturas saem de duas âncoras, não de gosto: a safe zone (345px em cima e
# embaixo) e o meio do quadro (960), que é onde o olho divide a tela sem
# esforço quando há dois blocos.

_TELA_CIMA_PESSOA_BAIXO = ModeloPalco(
    id="tela_cima_pessoa_baixo",
    nome="Tela em cima, pessoa embaixo",
    porque=(
        "O arranjo clássico de short com compartilhamento. A tela ocupa a metade "
        "superior inteira e a pessoa a inferior — quem fala fica perto da legenda, "
        "que é onde o olho já está."
    ),
    slots={
        # 352 = logo abaixo da safe zone; 608 = 1080 em 16:9. A tela fecha
        # exatamente no meio do quadro.
        "tela": Slot(x=0, y=352, w=CANVAS.largura, h=608, ajuste=Ajuste.CABER),
        "pessoa": Slot(x=0, y=960, w=CANVAS.largura, h=960, ajuste=Ajuste.COBRIR),
    },
)

_PESSOA_CHEIA = ModeloPalco(
    id="pessoa_cheia",
    nome="Só a pessoa, quadro cheio",
    porque=(
        "Talking head: a facecam preenche o short inteiro. É o modelo do corte "
        "sem tela compartilhada — e o único que não deixa nada do quadro original "
        "aparecer, porque só a região da pessoa é recortada."
    ),
    slots={"pessoa": Slot(x=0, y=0, w=CANVAS.largura, h=CANVAS.altura, ajuste=Ajuste.COBRIR)},
)

_PESSOA_COM_INSERT = ModeloPalco(
    id="pessoa_com_insert",
    nome="Pessoa grande, tela num insert",
    porque=(
        "Quando a tela ilustra mas não é o assunto. A pessoa domina o quadro e a "
        "tela entra como card na área superior, acima da legenda e abaixo da "
        "safe zone."
    ),
    slots={
        "pessoa": Slot(x=0, y=0, w=CANVAS.largura, h=CANVAS.altura, ajuste=Ajuste.COBRIR),
        # Margem de 64px dos dois lados para o insert ler como card sobreposto,
        # e não como uma segunda faixa colada na borda.
        "tela": Slot(x=64, y=400, w=952, h=536, ajuste=Ajuste.CABER),
    },
)

_QUADRO_COM_MOLDURA = ModeloPalco(
    id="quadro_com_moldura",
    nome="Quadro da live, com moldura",
    porque=(
        "O mais barato: um recorte só, como era antes. A diferença é que a região "
        "'quadro' é do operador — marcada PARA DENTRO do chrome da transmissão, "
        "ela deixa a moldura da live de fora em vez de arrastá-la para o short."
    ),
    slots={"quadro": Slot(x=0, y=0, w=CANVAS.largura, h=CANVAS.altura, ajuste=Ajuste.COBRIR)},
)

MODELOS: dict[str, ModeloPalco] = {
    modelo.id: modelo
    for modelo in (
        _TELA_CIMA_PESSOA_BAIXO,
        _PESSOA_CHEIA,
        _PESSOA_COM_INSERT,
        _QUADRO_COM_MOLDURA,
    )
}

MODELO_PADRAO = _PESSOA_CHEIA.id
"""Sem tela compartilhada marcada, é o arranjo que sempre funciona."""


@dataclass(frozen=True)
class Recorte:
    """Uma região da fonte com destino definido: de onde sai, para onde vai."""

    regiao: str
    crop: dict
    slot: Slot
    escala: tuple[int, int]
    """Tamanho após escalar, ANTES de qualquer corte pelo slot."""

    @property
    def desloca(self) -> tuple[int, int]:
        """Quanto tirar de cada lado quando o conteúdo é maior que o slot.

        Centraliza o excesso: cortar só de um lado jogaria o rosto para a borda
        justamente no modelo que existe para dar destaque a ele.
        """
        return (
            max(0, (self.escala[0] - self.slot.w) // 2),
            max(0, (self.escala[1] - self.slot.h) // 2),
        )


@dataclass(frozen=True)
class PlanoPalco:
    """O que compor, na ordem de empilhamento."""

    modelo: ModeloPalco
    recortes: list[Recorte]


class RegiaoFaltando(ValueError):
    """O modelo pede uma região que o preset do corte não tem.

    Erro explícito, e não arranjo silencioso: um short montado sem a tela que o
    modelo previa sai com um buraco de fundo que ninguém pediu, e o operador só
    descobre no arquivo.
    """


def montar_plano(modelo_id: str, regioes: dict[str, dict]) -> PlanoPalco:
    """Resolve modelo + regiões num plano de composição.

    `regioes` mapeia nome → crop (`{x, y, w, h}` no quadro-fonte), tipicamente
    vindo do preset do canal: `crop_facecam` → "pessoa", `crop_tela` → "tela".

    Levanta `KeyError` para modelo desconhecido e `RegiaoFaltando` quando o
    preset não cobre o que o modelo exige.

    Os recortes saem NA ORDEM DOS SLOTS do modelo, que é a ordem de
    empilhamento: quem vem depois fica por cima. Por isso o insert é declarado
    depois da pessoa.
    """
    modelo = MODELOS[modelo_id]

    ausentes = sorted(nome for nome in modelo.slots if not _crop_valido(regioes.get(nome)))
    if ausentes:
        raise RegiaoFaltando(
            f"O modelo {modelo.nome!r} precisa de {', '.join(ausentes)}, "
            "e o preset deste corte nao tem essa(s) regiao(oes)."
        )

    return PlanoPalco(
        modelo=modelo,
        recortes=[
            Recorte(
                regiao=nome,
                crop=dict(regioes[nome]),
                slot=slot,
                escala=escalar(regioes[nome], slot),
            )
            for nome, slot in modelo.slots.items()
        ],
    )


def escalar(crop: dict, slot: Slot) -> tuple[int, int]:
    """O tamanho do recorte depois de escalado para o slot.

    COBRIR usa o MAIOR fator (o conteúdo transborda e é cortado); CABER usa o
    MENOR (cabe inteiro, com folga). A escolha entre os dois é o que separa um
    rosto que preenche a tela de uma tela compartilhada legível.

    Resultado sempre PAR: o ffmpeg recusa dimensão ímpar em yuv420p.

    Exemplos:
        >>> facecam = {"x": 0, "y": 0, "w": 340, "h": 260}
        >>> escalar(facecam, MODELOS["pessoa_cheia"].slots["pessoa"])
        (2510, 1920)
        >>> tela = {"x": 0, "y": 0, "w": 1600, "h": 900}
        >>> escalar(tela, MODELOS["tela_cima_pessoa_baixo"].slots["tela"])
        (1080, 608)
    """
    largura = max(1, int(crop["w"]))
    altura = max(1, int(crop["h"]))
    fator_x = slot.w / largura
    fator_y = slot.h / altura
    # Comparação por VALOR, não por identidade: sob duplo import (pytest
    # coletando o módulo por outro caminho) existem dois objetos `Ajuste`, e o
    # `is` escolheria silenciosamente o ajuste errado — CABER onde devia COBRIR.
    fator = max(fator_x, fator_y) if slot.ajuste == Ajuste.COBRIR else min(fator_x, fator_y)
    return (_par(largura * fator), _par(altura * fator))


def modelo_sugerido(regioes: dict[str, dict]) -> str:
    """O modelo que as regiões disponíveis comportam — o "automático".

    Regra: havendo tela marcada, o arranjo de duas faixas é o que aproveita o
    material; havendo só a pessoa, o quadro cheio. `quadro` sozinho significa
    que o operador marcou o recorte à mão, e a intenção dele manda.

    Exemplos:
        >>> um = {"x": 0, "y": 0, "w": 10, "h": 10}
        >>> modelo_sugerido({"pessoa": um, "tela": um})
        'tela_cima_pessoa_baixo'
        >>> modelo_sugerido({"pessoa": um})
        'pessoa_cheia'
        >>> modelo_sugerido({"quadro": um})
        'quadro_com_moldura'
        >>> modelo_sugerido({})
        'pessoa_cheia'
    """
    tem = {nome for nome, crop in regioes.items() if _crop_valido(crop)}
    if {"pessoa", "tela"} <= tem:
        return _TELA_CIMA_PESSOA_BAIXO.id
    if "pessoa" in tem:
        return _PESSOA_CHEIA.id
    if "quadro" in tem:
        return _QUADRO_COM_MOLDURA.id
    return MODELO_PADRAO


def regioes_do_layout(layout: dict | None) -> dict[str, dict]:
    """Traduz o layout do corte no vocabulário do palco vertical.

    O horizontal fala `crop_facecam`/`crop_tela`; o palco fala `pessoa`/`tela`.
    A tradução mora aqui, num lugar só, porque são os MESMOS retângulos sobre o
    MESMO quadro — renomear na origem exigiria mexer no layout do horizontal,
    que está travado e não tem nada a ganhar com isso.

    Aceita tanto o formato de preset compartilhado quanto o topo do layout do
    corte, que é onde a D-464 já lia a facecam.
    """
    if not isinstance(layout, dict):
        return {}

    fonte = layout.get("compartilhada") if isinstance(layout.get("compartilhada"), dict) else layout
    regioes: dict[str, dict] = {}
    for destino, origem in (("pessoa", "crop_facecam"), ("tela", "crop_tela")):
        if _crop_valido(fonte.get(origem)):
            regioes[destino] = dict(fonte[origem])
    # O preset de modo FULL guarda o recorte em `full.crop` (tipo
    # "posicionamento_full"), e nao no topo. Ler so o topo deixava de fora
    # justamente o preset mais util contra o chrome da live: o crop do FULL ja
    # nasce recortado PARA DENTRO das bordas da transmissao.
    full = layout.get("full") if isinstance(layout.get("full"), dict) else {}
    for candidato in (layout.get("crop"), full.get("crop")):
        if _crop_valido(candidato):
            regioes["quadro"] = dict(candidato)
            break
    return regioes


def _crop_valido(crop: object) -> bool:
    """Retângulo utilizável: tem as quatro chaves e área positiva."""
    if not isinstance(crop, dict):
        return False
    try:
        return (
            float(crop["w"]) > 0
            and float(crop["h"]) > 0
            and float(crop["x"]) >= 0
            and float(crop["y"]) >= 0
        )
    except (KeyError, TypeError, ValueError):
        return False


def _par(valor: float) -> int:
    """O inteiro PAR mais próximo — o ffmpeg recusa dimensão ímpar em yuv420p."""
    return max(2, int(round(valor / 2)) * 2)
