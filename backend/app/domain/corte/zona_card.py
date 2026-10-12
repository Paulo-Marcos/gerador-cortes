"""Onde o card vertical encaixa no palco compartilhado (I-035, D-904).

O palco e uma mesa de redacao: a tela grande e a facecam ja tem cadeira, e o
card precisa sentar onde nao tampa nenhuma das duas. Ate a D-904 so havia uma
regra, calculada: o card a esquerda, acima da tela menor. Um palco em tres
colunas, com a facecam embaixo do card, nao cabe nela — e e por isso que o
operador passa a poder dizer onde o card senta.

RN-28: a zona que o operador definiu (``zona_card``) vence; a chave ausente E
a regra automatica, e e a ausencia que deixa o corte herdar a zona do projeto
(RN-10). Normalizar nunca a inventa.

Sem I/O. O espelho na tela e `sharedVerticalCardZone` em
`frontend/src/shared/palco/zonaCard.ts` — preview e render mostram o mesmo card.
"""

from __future__ import annotations

from typing import Any

CANVAS_W = 1920
CANVAS_H = 1080

# Menor zona aceita — o mesmo piso do encaixe no renderer
# (`video-renderer/src/shared-card-zone.tsx`): abaixo dele o card some.
ZONA_CARD_MINIMA = {"w": 240, "h": 180}

_MARGEM = 48
_MARGEM_TOPO = 96
_RESPIRO = 28


def resolver_zona_card(config: dict[str, Any]) -> dict[str, int]:
    """O retangulo do card para este ``compartilhada``: o manual, senao o automatico.

    I-035: a regra automatica e DINAMICA por layout. A borda externa do palco
    (StageChrome) e fixa, entao define o topo e a esquerda. As duas telas mudam
    por preset ou por customizacao do corte, e sao elas que limitam o espaco:
      - a tela grande (``slot_tela``) limita o alcance a DIREITA;
      - a tela pequena / facecam (``slot_facecam``) limita o alcance INFERIOR.
    Sempre que as telas deixam mais respiro a esquerda, o card cresce.
    """
    manual = normalizar_zona_card(config.get("zona_card"))
    if manual is not None:
        return manual
    if config.get("telas") == 1:
        return _zona_automatica_uma_tela(config)
    return _zona_automatica_duas_telas(config)


def normalizar_zona_card(valor: Any) -> dict[str, int] | None:
    """A zona que o operador definiu, ou ``None`` quando nao definiu.

    Diferente dos recortes e encaixes, aqui NAO ha fallback: a ausencia e um
    valor em si (a regra automatica), e inventar um retangulo apagaria a
    heranca (RN-10). Retangulo incompleto ou ilegivel conta como ausente — um
    arraste malfeito nao pode virar um card invisivel.
    """
    if not isinstance(valor, dict):
        return None
    try:
        numeros = {chave: float(valor[chave]) for chave in ("x", "y", "w", "h")}
    except (KeyError, TypeError, ValueError):
        return None
    if any(numero != numero for numero in numeros.values()):
        return None
    w = _inteiro_na_faixa(numeros["w"], ZONA_CARD_MINIMA["w"], CANVAS_W)
    h = _inteiro_na_faixa(numeros["h"], ZONA_CARD_MINIMA["h"], CANVAS_H)
    return {
        "x": _inteiro_na_faixa(numeros["x"], 0, CANVAS_W - w),
        "y": _inteiro_na_faixa(numeros["y"], 0, CANVAS_H - h),
        "w": w,
        "h": h,
    }


def _zona_automatica_uma_tela(config: dict[str, Any]) -> dict[str, int]:
    tela = _tamanho_renderizado(config["crop_tela"], config["slot_tela"])
    tela_right = config["slot_tela"]["x"] + tela["w"]
    left_space = config["slot_tela"]["x"] - _MARGEM - _RESPIRO
    right_space = CANVAS_W - tela_right - _MARGEM - _RESPIRO
    if right_space > left_space:
        left = min(CANVAS_W - _MARGEM - 240, tela_right + _RESPIRO)
        right = CANVAS_W - _MARGEM
    else:
        left = _MARGEM
        right = max(left + 240, config["slot_tela"]["x"] - _RESPIRO)
    top = max(56, min(config["slot_tela"]["y"], CANVAS_H - 236))
    bottom = max(top + 180, min(CANVAS_H - 56, config["slot_tela"]["y"] + tela["h"]))
    return {
        "x": int(left),
        "y": int(top),
        "w": int(max(240, right - left)),
        "h": int(max(180, bottom - top)),
    }


def _zona_automatica_duas_telas(config: dict[str, Any]) -> dict[str, int]:
    # Borda externa fixa em cima/esquerda; as telas limitam a faixa. O topo usa
    # respiro maior que a lateral para o card nao colar no contorno do palco.
    left = _MARGEM
    top = _MARGEM_TOPO
    right = config["slot_tela"]["x"] - _RESPIRO
    bottom = config["slot_facecam"]["y"] - _RESPIRO
    # Pisos de seguranca: mesmo que um preset aproxime demais as telas da borda,
    # o card nunca some. 240x180 espelha o piso do fit (shared-card-zone.tsx).
    right = min(max(right, left + 240), CANVAS_W - _MARGEM)
    bottom = min(max(bottom, top + 180), CANVAS_H - _MARGEM)
    return {"x": int(left), "y": int(top), "w": int(right - left), "h": int(bottom - top)}


def _tamanho_renderizado(crop: dict[str, int], slot: dict[str, int]) -> dict[str, int]:
    escala = max(0.01, min(slot["w"] / crop["w"], slot["h"] / crop["h"]))
    return {"w": round(crop["w"] * escala), "h": round(crop["h"] * escala)}


def _inteiro_na_faixa(valor: float, minimo: int, maximo: int) -> int:
    return max(minimo, min(maximo, int(valor)))
