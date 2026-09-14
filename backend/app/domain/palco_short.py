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

# Menor lado de um slot ajustado. Abaixo disso o bloco some da tela e o operador
# perde a alça para trazê-lo de volta — o mesmo motivo do mínimo das bordas.
_LADO_MINIMO = 40


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

    @property
    def corte_interno(self) -> tuple[int, int, int, int] | None:
        """`(w, h, x, y)` do corte a aplicar DEPOIS de escalar, ou `None`.

        Só existe em COBRIR: ali o conteúdo transborda o slot de propósito, e o
        excesso precisa sair em algum momento. Em CABER não há o que cortar —
        aplicar um corte de mesmo tamanho seria um passo de ffmpeg pago para não
        fazer nada.
        """
        if self.slot.ajuste != Ajuste.COBRIR:
            return None
        dx, dy = self.desloca
        return (self.slot.w, self.slot.h, dx, dy)

    @property
    def janela(self) -> dict:
        """O retângulo que o VÍDEO de fato ocupa no quadro do short (D-508).

        Diferente do slot em CABER: ali o conteúdo sai menor e fica centralizado,
        então a moldura desenhada em volta do slot inteiro sobraria dos dois
        lados — um quadro vazio em torno do vídeo.

        É o que o palco em PNG precisa: o buraco transparente tem de ter o
        tamanho do vídeo, não o do espaço reservado para ele.

        Exemplo (tela 1325x720 num slot 1080x608: enche a largura e sobra 22px
        de altura, 11 de cada lado):
            >>> tela = {"x": 0, "y": 0, "w": 1325, "h": 720}
            >>> slot = Slot(x=0, y=352, w=1080, h=608, ajuste=Ajuste.CABER)
            >>> Recorte("tela", tela, slot, escalar(tela, slot)).janela
            {'x': 0, 'y': 363, 'w': 1080, 'h': 586}
        """
        if self.slot.ajuste == Ajuste.COBRIR:
            return {"x": self.slot.x, "y": self.slot.y, "w": self.slot.w, "h": self.slot.h}
        x, y = self.posicao
        return {"x": x, "y": y, "w": self.escala[0], "h": self.escala[1]}

    @property
    def desenho(self) -> dict:
        """As coordenadas do recorte em forma de DESENHO, não de filtro.

        O `filter_complex` e o `drawImage` do canvas fazem a mesma coisa com
        vocabulários diferentes: recortar um retângulo da fonte e colá-lo
        escalado, limitado a uma área. Esta propriedade fala o que os dois
        entendem — de onde tirar, onde colar, e onde cortar o que sobrou.

        Existe para a PRÉVIA (D-489). Sem ela, a tela reimplementaria a
        geometria em CSS e passaria a poder discordar do arquivo — o risco que
        este épico inteiro existe para evitar. Aqui a conta continua sendo uma
        só, no domínio; a tela apenas aplica os números.

        Exemplo (pessoa cheia, facecam 340x260):
            >>> from app.domain.arranjo_short import Arranjo, montar_modelo
            >>> facecam = {"x": 24, "y": 410, "w": 340, "h": 260}
            >>> regioes = {"pessoa": facecam}
            >>> plano = montar_plano(montar_modelo(Arranjo(), regioes), regioes)
            >>> plano.recortes[0].desenho == {
            ...     "origem": {"x": 24, "y": 410, "w": 340, "h": 260},
            ...     "destino": {"x": -715, "y": 0, "w": 2510, "h": 1920},
            ...     "recorta": {"x": 0, "y": 0, "w": 1080, "h": 1920},
            ... }
            True
        """
        dx, dy = self.desloca
        # O destino sai de `posicao` MENOS o deslocamento, e nao de `slot`: em
        # CABER a `posicao` ja carrega a centralizacao da sobra, e derivar do
        # slot cru punha a tela colada na borda esquerda no canvas enquanto o
        # ffmpeg a centralizava. Divergencia de 54px pega lendo os numeros
        # servidos — exatamente o tipo de erro que esta propriedade existe para
        # nao deixar acontecer.
        px, py = self.posicao
        return {
            "origem": {
                "x": int(self.crop["x"]),
                "y": int(self.crop["y"]),
                "w": int(self.crop["w"]),
                "h": int(self.crop["h"]),
            },
            # O destino pode começar FORA do slot (x/y negativos em COBRIR): é
            # assim que o excesso fica de fora sem que ninguém precise cortá-lo
            # antes. Quem limita é `recorta`.
            "destino": {"x": px - dx, "y": py - dy, "w": self.escala[0], "h": self.escala[1]},
            "recorta": {"x": self.slot.x, "y": self.slot.y, "w": self.slot.w, "h": self.slot.h},
        }

    @property
    def posicao(self) -> tuple[int, int]:
        """Onde o conteúdo é sobreposto, em coordenadas do quadro do short.

        COBRIR já saiu do corte com o tamanho exato do slot, então pousa na
        origem dele. CABER saiu menor: a sobra é dividida entre os dois lados,
        senão a tela compartilhada ficaria colada num canto do próprio slot.
        """
        if self.slot.ajuste == Ajuste.COBRIR:
            return (self.slot.x, self.slot.y)
        return (
            self.slot.x + max(0, (self.slot.w - self.escala[0]) // 2),
            self.slot.y + max(0, (self.slot.h - self.escala[1]) // 2),
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


def aplicar_ajustes(modelo: ModeloPalco, ajustes: dict[str, dict] | None) -> ModeloPalco:
    """O modelo com os slots que o operador moveu (D-493).

    ## A mudança de conceito

    O eixo deste arquivo era "o slot vem do modelo". Passa a ser "o slot vem do
    modelo OU do ajuste do operador" — com o modelo como DEFAULT e o ajuste como
    sobreposição explícita, nunca como substituto silencioso.

    A diferença importa: um ajuste ausente não é um slot em (0,0), é o slot do
    modelo. Materializar os defaults ao gravar apagaria a herança — trocar de
    modelo depois não moveria mais nada, porque tudo estaria fixado. É a mesma
    razão pela qual o layout do horizontal grava escopo PARCIAL.

    Ajuste com retângulo inválido é IGNORADO, não corrigido: um slot de largura
    zero vindo de um arraste malfeito deve cair no modelo, e não virar um bloco
    invisível que o operador não entende por que sumiu.
    """
    if not ajustes:
        return modelo

    slots = dict(modelo.slots)
    for nome, retangulo in ajustes.items():
        base = slots.get(nome)
        if base is None or not _slot_valido(retangulo):
            continue
        slots[nome] = Slot(
            x=_inteiro_na_faixa(retangulo["x"], 0, CANVAS.largura),
            y=_inteiro_na_faixa(retangulo["y"], 0, CANVAS.altura),
            w=_inteiro_na_faixa(retangulo["w"], _LADO_MINIMO, CANVAS.largura),
            h=_inteiro_na_faixa(retangulo["h"], _LADO_MINIMO, CANVAS.altura),
            # O AJUSTE guarda posição e tamanho, não a regra de encaixe: cortar
            # ou caber continua sendo do tipo de conteúdo (rosto corta, tela
            # não), e deixar o operador inverter isso por arraste seria dar-lhe
            # uma alavanca cujo efeito ele não vê.
            ajuste=base.ajuste,
        )
    return ModeloPalco(id=modelo.id, nome=modelo.nome, porque=modelo.porque, slots=slots)


def _slot_valido(retangulo: object) -> bool:
    if not isinstance(retangulo, dict):
        return False
    try:
        return all(float(retangulo[c]) >= 0 for c in "xy") and all(
            float(retangulo[c]) >= _LADO_MINIMO for c in "wh"
        )
    except (KeyError, TypeError, ValueError):
        return False


def montar_plano(
    modelo: ModeloPalco, regioes: dict[str, dict], ajustes: dict[str, dict] | None = None
) -> PlanoPalco:
    """Resolve modelo + regiões num plano de composição.

    `regioes` mapeia nome → crop (`{x, y, w, h}` no quadro-fonte), tipicamente
    vindo do preset do canal: `crop_facecam` → "pessoa", `crop_tela` → "tela".

    Recebe o modelo JÁ RESOLVIDO e não um id (D-507): desde que o arranjo virou
    modo + disposição, não existe mais catálogo fixo de onde buscar por chave —
    quem monta é `arranjo_short.montar_modelo`, e é lá que a viabilidade se
    decide. Aqui sobra a geometria.

    Levanta `RegiaoFaltando` quando o preset não cobre o que os slots exigem.

    Os recortes saem NA ORDEM DOS SLOTS do modelo, que é a ordem de
    empilhamento: quem vem depois fica por cima. Por isso o insert é declarado
    depois da pessoa.
    """
    modelo = aplicar_ajustes(modelo, ajustes)

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
        >>> cheia = Slot(x=0, y=0, w=1080, h=1920, ajuste=Ajuste.COBRIR)
        >>> escalar(facecam, cheia)
        (2510, 1920)
        >>> tela = {"x": 0, "y": 0, "w": 1600, "h": 900}
        >>> metade = Slot(x=0, y=352, w=1080, h=608, ajuste=Ajuste.CABER)
        >>> escalar(tela, metade)
        (1080, 608)
    """
    largura = max(1, int(crop["w"]))
    altura = max(1, int(crop["h"]))
    fator_x = slot.w / largura
    fator_y = slot.h / altura
    # Comparação por VALOR, não por identidade: sob duplo import (pytest
    # coletando o módulo por outro caminho) existem dois objetos `Ajuste`, e o
    # `is` escolheria silenciosamente o ajuste errado — CABER onde devia COBRIR.
    if slot.ajuste != Ajuste.COBRIR:
        fator = min(fator_x, fator_y)
        return (_par(largura * fator), _par(altura * fator))

    # COBRIR promete escala >= slot, porque o corte interno recorta o slot de
    # dentro dela. Slot ajustado a mao sai impar (1365), e o par mais proximo
    # (1364) ficava 1px abaixo: crop maior que o quadro, -22 no ffmpeg.
    fator = max(fator_x, fator_y)
    return (
        max(_par(largura * fator), _par_acima(slot.w)),
        max(_par(altura * fator), _par_acima(slot.h)),
    )


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


def _par_acima(valor: int) -> int:
    """O menor inteiro PAR que não fica abaixo de `valor`."""
    return valor + valor % 2


def _inteiro_na_faixa(valor: object, minimo: int, maximo: int) -> int:
    """Coordenada de slot ajustado: inteira e dentro do quadro.

    O arraste produz fração, e um slot fracionário viraria crop fracionário no
    ffmpeg — que arredonda por conta própria, e aí a prévia e o arquivo divergem
    por um pixel sem ninguém saber de onde veio.
    """
    return max(minimo, min(int(round(float(valor))), maximo))
