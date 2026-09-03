"""A moldura do canal sobre o short (E-037, D-501).

O short saía com a identidade da LIVE — quando saía com alguma. O horizontal tem
a moldura verde do canal; o vertical não tinha nada, e o pedido foi direto:
"uma borda verde pequena, só em cima e só embaixo, duas faixas, daí eu
enquadraria o short nisso".

## Por que faixas, e por que no topo e no rodapé

Ali já é área morta. A safe zone (18% em cima e embaixo) pertence à UI dos apps
— é onde o botão de curtir, o nome do canal e a barra de progresso ficam. Pôr a
moldura lá não custa conteúdo nenhum; pôr em qualquer outro lugar custaria.

## Por que a moldura é ORTOGONAL ao arranjo

Ela vale para os quatro modelos. Rosto cheio, tela em cima, insert — todos são
arranjos do conteúdo, e a moldura é a assinatura em volta. Amarrá-la ao modelo
obrigaria a duplicar cada arranjo em duas versões, com e sem.

Sem I/O: a cor chega de fora, lida do tema do canal.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.palco_short import CANVAS

# Espelha SAFE_ZONE do renderer: a fração que pertence à UI dos apps.
_SAFE_ZONE = 0.18

# Altura de cada faixa, em fração da altura do quadro.
#
# 8% NÃO é gosto: é exatamente a tarja preta que o filtro de cinema já desenha
# (`cinema_filters.com_letterbox`, `ih*0.08`). A moldura vai DEPOIS da grade, e
# com 7% ela ficaria DENTRO da tarja preta, deixando uma nesga escura sobrando
# entre o verde e a borda — descoberto porque um teste tropeçou no `drawbox` que
# o próprio filtro já emitia.
#
# Cabe folgado na safe zone (18%), então a moldura nunca chega ao conteúdo — nem
# à legenda, que começa logo acima dos 18%.
FRACAO_FAIXA = 0.08

# A tarja que `cinema_filters` desenha. A moldura precisa COBRI-LA, senão o
# preto do filtro aparece por baixo do verde do canal.
FRACAO_LETTERBOX_DO_FILTRO = 0.08

COR_PADRAO = "#6aaa84"
"""`verdeMoldura` do tema. Só o fallback — a cor real vem do canal."""


class Moldura(str, Enum):
    """Se o short leva a assinatura do canal em volta.

    NENHUMA — o quadro cru.
    PALCO   — o palco do canal: fundo com textura, chrome, molduras nas janelas.

    D-508: era `FAIXAS`, e eram literalmente duas barras verdes chapadas —
    "um lembrete da identidade, não ela". O horizontal sempre teve palco de
    verdade; agora o short usa o MESMO, rasterizado em PNG pelo Remotion.

    As faixas continuam no código como PLANO B: sem o PNG (Node fora do ar,
    render do palco falhando) o short sai com a cor do canal em vez de sair sem
    identidade nenhuma.
    """

    NENHUMA = "nenhuma"
    PALCO = "palco"


MOLDURA_PADRAO = Moldura.PALCO
"""O short do canal leva a marca do canal. Quem não quer, desliga."""


@dataclass(frozen=True)
class Faixa:
    """Uma barra da moldura, em pixels do quadro do short."""

    x: int
    y: int
    w: int
    h: int
    cor: str


def faixas(moldura: Moldura | str, cor: str = COR_PADRAO) -> list[Faixa]:
    """As barras a desenhar, de cima para baixo.

    Lista vazia em `NENHUMA` — e é o chamador que decide não desenhar nada, sem
    precisar de um `if` sobre o tipo da moldura em cada lugar.

    Exemplos:
        >>> [ (f.y, f.h) for f in faixas(Moldura.PALCO) ]
        [(0, 154), (1766, 154)]
        >>> faixas(Moldura.NENHUMA)
        []
        >>> faixas("palco", "#ff0000")[0].cor
        '#ff0000'
    """
    if _normalizar(moldura) is Moldura.NENHUMA:
        return []

    altura = int(round(CANVAS.altura * FRACAO_FAIXA))
    return [
        Faixa(x=0, y=0, w=CANVAS.largura, h=altura, cor=cor),
        Faixa(x=0, y=CANVAS.altura - altura, w=CANVAS.largura, h=altura, cor=cor),
    ]


def cabe_na_safe_zone() -> bool:
    """A moldura não pode invadir a área de conteúdo.

    Guarda contra um ajuste futuro de `FRACAO_FAIXA` que passasse dos 18%: ali a
    faixa começaria a tapar legenda e cena, e o sintoma (texto sumindo pela
    borda) não apontaria para a moldura.

    Exemplo:
        >>> cabe_na_safe_zone()
        True
    """
    return FRACAO_FAIXA <= _SAFE_ZONE


def cobre_o_letterbox_do_filtro() -> bool:
    """A moldura tapa a tarja preta que o filtro de cinema desenha.

    Sem isso sobra uma nesga preta entre o verde e a borda do quadro — visível,
    feia, e sem nada no código apontando de onde veio.

    Exemplo:
        >>> cobre_o_letterbox_do_filtro()
        True
    """
    return FRACAO_FAIXA >= FRACAO_LETTERBOX_DO_FILTRO


def _normalizar(valor: Moldura | str) -> Moldura:
    """Valor desconhecido cai no padrão — moldura errada não derruba render.

    `valor.value` e não `str(valor)`: num enum com mixin `str`, `str(membro)`
    devolve "Moldura.NENHUMA", não "nenhuma", e o próprio membro seria rejeitado
    como inválido. Pego pelo doctest, que passou o membro — o caso que o código
    de produção usa e que um teste só com strings não cobriria.
    """
    bruto = valor.value if isinstance(valor, Moldura) else str(valor)
    try:
        return Moldura(bruto)
    except ValueError:
        return MOLDURA_PADRAO
