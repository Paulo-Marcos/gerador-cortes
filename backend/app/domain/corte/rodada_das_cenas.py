"""A rodada das cenas: o plano que uma geração gravou, e a que ele substituiu (D-1071, RN-37).

Gerar as cenas de novo trocava o plano inteiro e o anterior se perdia. Agora a rodada que
sai fica guardada, uma só: o operador volta a ela e compara as duas. A cena é dado opaco
aqui: o diff compara campo a campo, sem saber o que cada um significa, para que um campo
novo do roteiro (o riscado da D-1070, por exemplo) apareça como mudança sem mexer nesta regra.
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.domain.corte.corte_mapper import extrair_cenas_remotion, normalizar_cena_remotion

# Quem gerou: a IA pela assinatura (Claude CLI; Gemini pelo `agy -p` ou pela API) ou o
# operador, que colou a resposta de uma IA de fora. `None` é a rodada gravada antes da D-1071.
OrigemDasCenas = Literal["claude", "gemini", "manual"]


@dataclass(frozen=True)
class RodadaDasCenas:
    """Um plano de cenas e o que se sabe dele: quem gerou, quando, e se o operador validou."""

    cenas: str | None
    origem: str | None
    gerada_em: datetime | None
    validadas: bool
    validadas_em: datetime | None

    def lista(self) -> list[dict]:
        """As cenas do plano, normalizadas; payload fora do formato é plano vazio."""
        try:
            cenas = extrair_cenas_remotion(json.loads(self.cenas or "[]"))
        except (TypeError, ValueError):
            return []
        return [normalizar_cena_remotion(cena) for cena in cenas if isinstance(cena, dict)]


def anterior_depois_de_gerar(
    atual: RodadaDasCenas, anterior: RodadaDasCenas | None
) -> RodadaDasCenas | None:
    """A rodada que fica guardada quando uma geração substitui a atual.

    A que sai vira a anterior se tinha cenas. Plano vazio não apaga a anterior guardada:
    gerar sobre um corte que o operador esvaziou deixa voltar ao último plano de verdade.
    """
    return atual if atual.lista() else anterior


def versao_das_rodadas(atual: str | None, anterior: str | None) -> str:
    """Uma impressão das duas rodadas: muda quando qualquer cena de uma delas muda.

    É o que a tela mostra e devolve ao desfazer, para a troca valer sobre o que ela viu.
    """
    conteudo = json.dumps([atual or "", anterior or ""], ensure_ascii=False)
    return hashlib.sha256(conteudo.encode("utf-8")).hexdigest()[:16]


def comparar_rodadas(atuais: list[dict], anteriores: list[dict]) -> dict:
    """O que entrou, o que saiu e o que mudou entre a rodada anterior e a atual.

    A cena é a mesma nas duas quando tem o mesmo `tipo` e começa no mesmo instante (ao
    centésimo), que é como a conferência de origem também a identifica; repetida, pareia
    na ordem. Mudou é a mesma cena com algum campo diferente, e `campos` diz quais.
    """
    atual = _por_identidade(atuais)
    anterior = _por_identidade(anteriores)
    mudaram = []
    for chave, cena in atual.items():
        antes = anterior.get(chave)
        if antes is None:
            continue
        campos = sorted(
            campo for campo in cena.keys() | antes.keys() if cena.get(campo) != antes.get(campo)
        )
        if campos:
            mudaram.append({"atual": cena, "anterior": antes, "campos": campos})
    return {
        "entraram": [cena for chave, cena in atual.items() if chave not in anterior],
        "sairam": [cena for chave, cena in anterior.items() if chave not in atual],
        "mudaram": mudaram,
    }


def _por_identidade(cenas: list[dict]) -> dict[tuple, dict]:
    vistas: Counter = Counter()
    por_identidade: dict[tuple, dict] = {}
    for cena in cenas:
        if not isinstance(cena, dict):
            continue
        normalizada = normalizar_cena_remotion(cena)
        base = (str(normalizada.get("tipo") or ""), round(normalizada["inicio"], 2))
        por_identidade[(*base, vistas[base])] = normalizada
        vistas[base] += 1
    return por_identidade
