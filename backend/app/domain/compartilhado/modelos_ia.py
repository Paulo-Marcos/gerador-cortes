"""Que modelo atende cada faixa de IA (D-924).

A skill não escolhe modelo: escolhe uma FAIXA — pesado, médio ou rápido — e a
configuração do canal diz qual modelo do Claude e qual do Gemini (Antigravity)
responde por ela. Quando um modelo sai de uso, troca-se num lugar só, na tela,
em vez de receita por receita. As chamadas pela API do Gemini (cenas, desvios e a
imagem da thumbnail) não têm faixa: têm um modelo de texto e um de imagem.

O gravado é PARCIAL, como a cascata de layout (RN-10): papel ausente herda o
padrão daqui, e só se grava o que difere dele — assim, mudar um padrão no código
alcança todo canal que nunca mexeu naquele papel.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum


class Faixa(StrEnum):
    PESADO = "pesado"
    MEDIO = "medio"
    RAPIDO = "rapido"


# Aliases do CLI (`opus`, `sonnet`, `haiku`) e não ids completos: o alias sempre
# aponta para o modelo mais novo da família. No Gemini, o 3.1 Pro saiu do
# Antigravity em 10/2026; o Flash High assumiu as faixas de qualidade.
PADRAO: dict[str, str] = {
    "claude_pesado": "opus",
    "claude_medio": "sonnet",
    "claude_rapido": "haiku",
    "gemini_pesado": "gemini-3.8-flash-high",
    "gemini_medio": "gemini-3.8-flash-high",
    "gemini_rapido": "gemini-3.8-flash-medium",
    "gemini_api_texto": "gemini-2.5-flash",
    "gemini_api_imagem": "gemini-2.5-flash-image",
}

# Antes da D-924 a skill gravava o modelo Claude; a família diz a faixa.
_FAIXA_DA_FAMILIA: tuple[tuple[str, Faixa], ...] = (
    ("haiku", Faixa.RAPIDO),
    ("sonnet", Faixa.MEDIO),
)


@dataclass(frozen=True)
class ModelosIa:
    """Os modelos vigentes do canal, já completos com o padrão."""

    escolhas: Mapping[str, str]

    def claude(self, faixa: Faixa) -> str:
        return self.escolhas[f"claude_{faixa.value}"]

    def gemini(self, faixa: Faixa) -> str:
        return self.escolhas[f"gemini_{faixa.value}"]

    @property
    def gemini_api_texto(self) -> str:
        return self.escolhas["gemini_api_texto"]

    @property
    def gemini_api_imagem(self) -> str:
        return self.escolhas["gemini_api_imagem"]


def completar(gravado: Mapping[str, object]) -> ModelosIa:
    """O gravado do canal completo com o padrão (papel ausente, vazio ou
    desconhecido não conta)."""
    escolhas = dict(PADRAO)
    for papel, valor in gravado.items():
        if papel in PADRAO and isinstance(valor, str) and valor.strip():
            escolhas[papel] = valor.strip()
    return ModelosIa(escolhas)


def so_o_que_difere(escolhas: Mapping[str, object]) -> dict[str, str]:
    """O que gravar: só os papéis que fogem do padrão."""
    completos = completar(escolhas).escolhas
    return {papel: valor for papel, valor in completos.items() if valor != PADRAO[papel]}


def faixa_de(valor: object, *, modelo_legado: object = None, padrao: Faixa) -> Faixa:
    """A faixa gravada na skill; sem ela, a que o modelo Claude legado indica."""
    try:
        return Faixa(str(valor))
    except ValueError:
        pass
    if not modelo_legado:
        return padrao
    nome = str(modelo_legado).lower()
    for familia, faixa in _FAIXA_DA_FAMILIA:
        if familia in nome:
            return faixa
    return Faixa.PESADO
