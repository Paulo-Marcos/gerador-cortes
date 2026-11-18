"""A luz do canal: duas cores amostradas das capas (D-1130, E-069 B-3).

O anel do avatar do canal usa a luz. A paleta cadastrada tem precedência, mas isso é
decisão da tela; aqui só nasce a amostra. A função é pura: recebe pixels RGB (já
reduzidos por quem leu as capas) e devolve até duas cores `#rrggbb`.

A cor que importa é a que a capa tem de MAIS viva, não a média: a média de uma capa
escura com texto amarelo dá um marrom que nenhuma capa tem. Por isso só contam pixels
com saturação e brilho mínimos, agrupados por matiz.
"""

from __future__ import annotations

import colorsys
from collections.abc import Sequence

Rgb = tuple[int, int, int]

# Pixel apagado ou acinzentado não carrega a cor da capa.
_SATURACAO_MINIMA = 0.35
_BRILHO_MINIMO = 0.35
_FAIXAS_DE_MATIZ = 12
# Duas faixas a menos que isto de distância (em faixas de 30°) são "a mesma cor".
_DISTANCIA_MINIMA = 2


def _hex(cor: Rgb) -> str:
    return "#{:02x}{:02x}{:02x}".format(*cor)


def _media(pixels: Sequence[Rgb]) -> Rgb:
    n = len(pixels)
    r, g, b = (sum(p[i] for p in pixels) // n for i in range(3))
    return (r, g, b)


def _distancia_circular(a: int, b: int) -> int:
    d = abs(a - b)
    return min(d, _FAIXAS_DE_MATIZ - d)


def luz_das_amostras(pixels: Sequence[Rgb]) -> list[str]:
    """Até duas cores `#rrggbb` das mais vivas; vazio quando não há cor para tirar.

    >>> luz_das_amostras([(10, 10, 10)] * 5)
    []
    """
    faixas: dict[int, list[Rgb]] = {}
    peso: dict[int, float] = {}
    for r, g, b in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < _SATURACAO_MINIMA or v < _BRILHO_MINIMO:
            continue
        faixa = int(h * _FAIXAS_DE_MATIZ) % _FAIXAS_DE_MATIZ
        faixas.setdefault(faixa, []).append((r, g, b))
        peso[faixa] = peso.get(faixa, 0.0) + s * v
    if not faixas:
        return []

    ordem = sorted(faixas, key=lambda f: peso[f], reverse=True)
    primeira = ordem[0]
    segunda = next(
        (f for f in ordem[1:] if _distancia_circular(f, primeira) >= _DISTANCIA_MINIMA),
        None,
    )
    if segunda is not None:
        return [_hex(_media(faixas[primeira])), _hex(_media(faixas[segunda]))]

    # Capa de uma cor só: a luz vira o par claro e escuro dessa cor.
    unica = sorted(faixas[primeira], key=lambda p: colorsys.rgb_to_hsv(*p)[2])
    meio = max(1, len(unica) // 2)
    return [_hex(_media(unica[meio:] or unica)), _hex(_media(unica[:meio]))]
