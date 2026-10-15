"""Os cards (cenas) do canal: quais tipos aparecem, de que tamanho e onde (D-916).

O canal escolhe, na tela de Canais, quais tipos de cena nunca saem no vídeo
dele, o tamanho dos cards e onde eles sentam quando a cena está sobre o vídeo
cheio. Na compartilhada quem posiciona o card é a zona de cada corte (o
retângulo "Cards" do modal de posição), e ela continua mandando.

Sem I/O. Mora fora de `palco_componentes.py` porque aquele módulo já está perto
do teto de tamanho; o palco só guarda um `Cards`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.domain.compartilhado.erros import PedidoInvalido

# Os tipos de cena que o renderer desenha (`renderCenaV2`), com o nome que a
# tela mostra. `comparativo_enfase` é apelido do contraponto e segue junto.
TIPOS_DE_CENA: dict[str, str] = {
    "card_informacao": "Card de informação",
    "definicao_termo": "Definição",
    "pergunta_transicao": "Pergunta",
    "ficha_biografica": "Ficha biográfica",
    "marco_historico": "Marco histórico",
    "citacao_autor": "Citação",
    "destaque_numerico": "Número em destaque",
    "enfase": "Ênfase",
    "comparativo_contraponto": "Comparativo",
    "lista_enumerada": "Lista",
    "linha_tempo": "Linha do tempo",
    "fonte_referencia": "Fonte",
    "barra_inferior": "Barra inferior",
    "tela_cheia": "Tela cheia (tese)",
    "chamada_final": "Chamada final",
    "pergunta_chat": "Pergunta do chat",
}
APELIDOS = {"comparativo_enfase": "comparativo_contraponto"}

ESCALA_MINIMA, ESCALA_MAXIMA = 0.25, 5.0  # D-927: de 25% a 500%
# O canto de sempre no layout cheio: 96 px da esquerda; com a posição manual o
# operador escolhe o canto de cima à esquerda do card no quadro de 1920x1080.
QUADRO = (1920, 1080)
POSICAO_PADRAO = (96, 112)

# D-926: como o card se apresenta DENTRO do espaço dele (a zona dos cards na
# compartilhada). "preencher" cresce o card com pouco texto e encolhe o com
# muito, até caber no espaço; "natural" deixa o tamanho de sempre. O
# alinhamento diz onde o card senta quando sobra espaço.
AJUSTES = ("preencher", "natural")
ALINHAMENTOS_VERTICAIS = ("centro", "topo", "base")
ALINHAMENTOS_HORIZONTAIS = ("centro", "esquerda", "direita")


class TipoDeCenaInvalido(PedidoInvalido):
    """Um tipo de cena que o renderer não conhece."""


@dataclass(frozen=True)
class PosicaoDosCards:
    automatica: bool = True
    x: int = POSICAO_PADRAO[0]
    y: int = POSICAO_PADRAO[1]


@dataclass(frozen=True)
class Cards:
    ocultos: tuple[str, ...] = field(default_factory=tuple)
    """Tipos que não aparecem no vídeo deste canal."""
    escala: float = 1.0
    posicao: PosicaoDosCards = PosicaoDosCards()
    ajuste: str = AJUSTES[0]
    alinhamento_vertical: str = ALINHAMENTOS_VERTICAIS[0]
    alinhamento_horizontal: str = ALINHAMENTOS_HORIZONTAIS[0]

    def para_dict(self) -> dict[str, Any]:
        return {
            "ocultos": list(self.ocultos),
            "escala": self.escala,
            "ajuste": self.ajuste,
            "alinhamento_vertical": self.alinhamento_vertical,
            "alinhamento_horizontal": self.alinhamento_horizontal,
            "posicao": {
                "automatica": self.posicao.automatica,
                "x": self.posicao.x,
                "y": self.posicao.y,
            },
        }


def _ocultos(valor: Any, atual: tuple[str, ...], *, tolerante: bool) -> tuple[str, ...]:
    if valor is None:
        return atual
    if not isinstance(valor, (list, tuple)):
        raise TipoDeCenaInvalido("Os tipos escondidos vêm numa lista.")
    tipos: list[str] = []
    for bruto in valor:
        tipo = str(bruto).strip().lower()
        if tipo not in TIPOS_DE_CENA:
            if tolerante:
                continue
            raise TipoDeCenaInvalido(f"Tipo de cena desconhecido: {bruto!r}.")
        if tipo not in tipos:
            tipos.append(tipo)
    return tuple(tipos)


def _numero(valor: Any, atual: float, minimo: float, maximo: float) -> float:
    if valor is None:
        return atual
    try:
        return max(minimo, min(maximo, float(valor)))
    except (TypeError, ValueError):
        return atual


def _opcao(valor: Any, atual: str, opcoes: tuple[str, ...], *, tolerante: bool) -> str:
    """Uma das opções; desconhecida é recusada na edição e ignorada na leitura.

    Exemplos:
        >>> _opcao("Topo", "centro", ALINHAMENTOS_VERTICAIS, tolerante=False)
        'topo'
        >>> _opcao("meio", "centro", ALINHAMENTOS_VERTICAIS, tolerante=True)
        'centro'
    """
    if valor is None:
        return atual
    opcao = str(valor).strip().lower()
    if opcao in opcoes:
        return opcao
    if tolerante:
        return atual
    raise PedidoInvalido(f"Opção de card desconhecida: {valor!r} (use {', '.join(opcoes)}).")


def mesclar(atual: Cards, mudancas: Any, *, tolerante: bool = False) -> Cards:
    """Os cards depois de uma edição parcial (campo ausente não muda).

    `tolerante` é a leitura do banco: um tipo que deixou de existir some em vez
    de derrubar o render; na edição pela tela ele é recusado.

    Exemplos:
        >>> mesclar(Cards(), {"ocultos": ["enfase", "Enfase"], "escala": 9}).para_dict()["ocultos"]
        ['enfase']
        >>> mesclar(Cards(), {"escala": 9}).escala
        5.0
        >>> mesclar(Cards(), {"ocultos": ["sumiu"]}, tolerante=True).ocultos
        ()
    """
    if not isinstance(mudancas, dict):
        return atual
    posicao = mudancas.get("posicao")
    if isinstance(posicao, dict):
        nova_posicao = PosicaoDosCards(
            automatica=bool(posicao.get("automatica", atual.posicao.automatica)),
            x=int(_numero(posicao.get("x"), atual.posicao.x, 0, QUADRO[0])),
            y=int(_numero(posicao.get("y"), atual.posicao.y, 0, QUADRO[1])),
        )
    else:
        nova_posicao = atual.posicao
    return Cards(
        ocultos=_ocultos(mudancas.get("ocultos"), atual.ocultos, tolerante=tolerante),
        escala=_numero(mudancas.get("escala"), atual.escala, ESCALA_MINIMA, ESCALA_MAXIMA),
        posicao=nova_posicao,
        ajuste=_opcao(mudancas.get("ajuste"), atual.ajuste, AJUSTES, tolerante=tolerante),
        alinhamento_vertical=_opcao(
            mudancas.get("alinhamento_vertical"),
            atual.alinhamento_vertical,
            ALINHAMENTOS_VERTICAIS,
            tolerante=tolerante,
        ),
        alinhamento_horizontal=_opcao(
            mudancas.get("alinhamento_horizontal"),
            atual.alinhamento_horizontal,
            ALINHAMENTOS_HORIZONTAIS,
            tolerante=tolerante,
        ),
    )


def props_para_renderer(estilo: str, cards: Cards) -> dict[str, Any]:
    """O `estiloCenas` que as composições do Remotion recebem.

    Um tipo escondido leva junto o apelido dele (o comparativo de ênfase sai com
    o contraponto), para o operador não ter de saber que os dois existem.

    Exemplo:
        >>> props_para_renderer("limpo", Cards(ocultos=("comparativo_contraponto",)))["ocultos"]
        ['comparativo_contraponto', 'comparativo_enfase']
    """
    ocultos = list(cards.ocultos)
    ocultos += [apelido for apelido, tipo in APELIDOS.items() if tipo in cards.ocultos]
    return {
        "estilo": estilo,
        "ocultos": ocultos,
        "escala": cards.escala,
        "posicao": cards.para_dict()["posicao"],
        "ajuste": cards.ajuste,
        "alinhamento_vertical": cards.alinhamento_vertical,
        "alinhamento_horizontal": cards.alinhamento_horizontal,
    }
