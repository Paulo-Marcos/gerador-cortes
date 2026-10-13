"""Quão clara uma capa é, medido, e não no olho (D-909).

## O que motivou

O operador achava as capas dele mais escuras que as das referências. Medido em
13/10/2026 sobre as grades que ele mandou (luminância média de 0 a 255 e fração
de pixels abaixo de 50):

    referência roxa (9 capas)   ~85   ~43% escuros
    canal Flow (6 capas)        107    34%
    canal do operador (6)        77    51%

A impressão procedia. E a diferença não estava no fundo, escuro nos dois: estava
no rosto, em luz alta nas referências e na penumbra do cenário nas dele. A
regra de luz vive na skill; aqui fica o termômetro que diz se ela pegou.

## Por histograma

A medida recebe o histograma de luminância (256 contagens, a do Pillow em modo
"L"), e não a imagem: assim o domínio continua sem I/O, e quem abre o arquivo é
o serviço.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.compartilhado.erros import PedidoInvalido

# A escala da luminância (0 a 255) e o tamanho do histograma que a cobre.
LUMINANCIA_MAXIMA = 255
TONS = LUMINANCIA_MAXIMA + 1
CEM_POR_CENTO = 100
# Abaixo disto um pixel conta como escuro (a mesma régua da medição de 13/10).
LIMIAR_DO_ESCURO = 50

# A meta inicial: um pouco acima da referência roxa e abaixo do canal Flow.
LUMINANCIA_MINIMA_PADRAO = 95.0
ESCUROS_MAXIMO_PADRAO = 40.0


@dataclass(frozen=True)
class Claridade:
    """A luminância média (0-255) e a porcentagem de pixels escuros (0-100)."""

    luminancia: float
    escuros_pct: float


@dataclass(frozen=True)
class MetaDeClaridade:
    luminancia_minima: float = LUMINANCIA_MINIMA_PADRAO
    escuros_maximo: float = ESCUROS_MAXIMO_PADRAO


def meta_valida(luminancia_minima: float, escuros_maximo: float) -> MetaDeClaridade:
    """A meta pedida, ou `PedidoInvalido` quando sai das escalas.

    >>> meta_valida(100, 35)
    MetaDeClaridade(luminancia_minima=100.0, escuros_maximo=35.0)
    """
    if not 0 <= luminancia_minima <= LUMINANCIA_MAXIMA:
        raise PedidoInvalido("A luminância mínima vai de 0 a 255.")
    if not 0 <= escuros_maximo <= CEM_POR_CENTO:
        raise PedidoInvalido("O máximo de pixels escuros vai de 0 a 100%.")
    return MetaDeClaridade(float(luminancia_minima), float(escuros_maximo))


def medir_claridade(histograma: Sequence[int]) -> Claridade:
    """A claridade de uma imagem a partir do histograma de luminância.

    >>> medir_claridade([0] * 255 + [10])
    Claridade(luminancia=255.0, escuros_pct=0.0)
    >>> medir_claridade([5] + [0] * 254 + [5])
    Claridade(luminancia=127.5, escuros_pct=50.0)
    """
    if len(histograma) != TONS:
        raise PedidoInvalido("O histograma de luminância tem 256 posições.")
    total = sum(histograma)
    if total <= 0:
        raise PedidoInvalido("A imagem não tem pixels.")
    soma = sum(valor * contagem for valor, contagem in enumerate(histograma))
    escuros = sum(histograma[:LIMIAR_DO_ESCURO])
    return Claridade(
        luminancia=round(soma / total, 1),
        escuros_pct=round(CEM_POR_CENTO * escuros / total, 1),
    )


def abaixo_da_meta(claridade: Claridade, meta: MetaDeClaridade) -> bool:
    """Escura demais por qualquer das duas réguas.

    As duas, e não só a média: uma capa de fundo negro com um rosto estourado
    pode ter média boa e metade dos pixels no preto — é a grade escura que o
    operador vê.
    """
    return (
        claridade.luminancia < meta.luminancia_minima or claridade.escuros_pct > meta.escuros_maximo
    )
