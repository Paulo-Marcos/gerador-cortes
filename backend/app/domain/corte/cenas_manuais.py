"""As cenas manuais numa geração nova: a IA não mexe nelas (D-1075, RN-39).

Gerar de novo trocava o plano inteiro e levava junto a cena que o operador criou ou
reescreveu, marcada com `manual: true` (D-1070). Agora a manual fica como está, riscada ou
não, e as cenas da IA se encaixam em volta: a que cai em cima de uma manual é descartada.
A cena da IA que estava no plano sai, riscada ou não, como sempre saiu.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.domain.corte.corte_mapper import extrair_cenas_remotion, normalizar_cena_remotion


@dataclass(frozen=True)
class PlanoComAsManuais:
    """O plano que a geração grava, e quantas cenas dela ficaram de fora pelas manuais."""

    cenas: list[dict]
    descartadas: int


def ler_as_manuais(cenas_gravadas: str | None) -> list[dict]:
    """As cenas manuais do plano gravado, como estão; plano fora do formato não tem nenhuma."""
    try:
        cenas = extrair_cenas_remotion(json.loads(cenas_gravadas or "[]"))
    except (TypeError, ValueError):
        return []
    return [cena for cena in cenas if isinstance(cena, dict) and cena.get("manual") is True]


def encaixar_em_volta_das_manuais(geradas: list, manuais: list[dict]) -> PlanoComAsManuais:
    """As manuais intactas e as geradas que não se sobrepõem a nenhuma, ordenadas por início.

    Sobrepor é dividir algum instante: encostar (uma acaba quando a outra começa) não conta.
    A manual riscada também barra, porque o "Trazer de volta" a põe no vídeo de novo.
    """
    tempos_das_manuais = [_tempos(cena) for cena in manuais]
    aceitas = [
        cena
        for cena in geradas
        if not any(_sobrepoe(_tempos(cena), tempos) for tempos in tempos_das_manuais)
    ]
    plano = sorted([*manuais, *aceitas], key=lambda cena: _tempos(cena)[0])
    return PlanoComAsManuais(cenas=plano, descartadas=len(geradas) - len(aceitas))


def _tempos(cena: dict) -> tuple[float, float]:
    normalizada = normalizar_cena_remotion(cena)
    return normalizada["inicio"], normalizada["fim"]


def _sobrepoe(a: tuple[float, float], b: tuple[float, float]) -> bool:
    return a[0] < b[1] and b[0] < a[1]
