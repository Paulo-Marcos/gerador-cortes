"""Biblioteca versionada de TEMAS de render por canal (D-174).

Um TEMA amarra dois eixos da aparência das cenas Remotion v2:

  1. **Paleta COMPLETA** — o conjunto inteiro de cores consumidas por `COLORS_V2`
     em `video-renderer/src/theme-v2.ts` (17 chaves). Hoje só 6 vinham do
     `theme.config.json`; as demais eram literais hardcoded. A biblioteca carrega
     o conjunto completo para que trocar de tema mude cards, linhas e acentos —
     não só as 6 base.
  2. **Preset tipográfico** — uma das chaves de `FONT_PRESETS_V2`
     (`atual`/`moderna`/`cientifica`/`minimalista`/`tecnica`).

O tema `atual` é o DEFAULT e reproduz EXATAMENTE os valores de hoje (paleta base do
`theme.config.json` + os literais que estavam hardcoded em `theme-v2.ts`), para que
um canal sem tema selecionado — ou que selecione `atual` — renderize idêntico.

Esta camada é PURA: só dados e funções de consulta, sem I/O, SQLAlchemy ou HTTP.
A seleção por canal (settings.db) e a materialização do `theme.config.json` vivem
em `services/channel_theme.py`; o consumo build-time da paleta, em `theme-v2.ts`.
"""

from __future__ import annotations

from dataclasses import dataclass

# Chaves canônicas da paleta de render. DEVE espelhar exatamente as chaves de
# `COLORS_V2` em `video-renderer/src/theme-v2.ts` — é o contrato entre a biblioteca
# (backend) e o consumo build-time (Remotion). Ordem irrelevante; presença importa.
PALETA_CHAVES: tuple[str, ...] = (
    "verdeMoldura",
    "verdeProfundo",
    "verdeCard1",
    "verdeCard2",
    "verdeCard3",
    "verdeCard4",
    "marromQuente",
    "azulAcento",
    "azulSoft",
    "azulGhost",
    "branco",
    "brancoMuted",
    "brancoDim",
    "linha",
    "linhaSoft",
    "linhaGhost",
    "fundoPalco",
)


@dataclass(frozen=True)
class Tema:
    """Um tema nomeado = id + rótulo + paleta completa + preset tipográfico.

    `paleta` cobre todas as chaves de `PALETA_CHAVES`. `fonte_preset` é uma chave
    válida de `FONT_PRESETS_V2` (validada no consumo; aqui é só dado).
    """

    id: str
    nome: str
    paleta: dict[str, str]
    fonte_preset: str


TEMA_DEFAULT_ID = "atual"

# Paleta EXATA de hoje: 6 base (do theme.config.json versionado) + os literais que
# estavam hardcoded em theme-v2.ts. Reproduzida aqui verbatim para o tema `atual`
# renderizar pixel-idêntico ao estado pré-D-174.
_PALETA_ATUAL: dict[str, str] = {
    "verdeMoldura": "#6aaa84",
    "verdeProfundo": "#1a221c",
    "verdeCard1": "rgba(44, 68, 56, 0.96)",
    "verdeCard2": "rgba(36, 58, 48, 0.92)",
    "verdeCard3": "rgba(28, 42, 34, 0.55)",
    "verdeCard4": "rgba(18, 26, 22, 0.25)",
    "marromQuente": "#3c2a22",
    "azulAcento": "#9bcfe3",
    "azulSoft": "rgba(150, 205, 235, 0.42)",
    "azulGhost": "rgba(150, 205, 235, 0.09)",
    "branco": "#ffffff",
    "brancoMuted": "rgba(255, 255, 255, 0.85)",
    "brancoDim": "rgba(255, 255, 255, 0.55)",
    "linha": "rgba(235, 245, 235, 0.92)",
    "linhaSoft": "rgba(235, 245, 235, 0.40)",
    "linhaGhost": "rgba(255, 255, 255, 0.12)",
    "fundoPalco": "#0f1410",
}

# Tema neutro/frio (slate azulado), preset científico. Deriva a mesma estrutura de
# opacidade dos cards, deslocando a matiz para cinza-frio.
_PALETA_EDITORIAL_ESCURO: dict[str, str] = {
    "verdeMoldura": "#7c93a6",
    "verdeProfundo": "#171a1e",
    "verdeCard1": "rgba(48, 58, 68, 0.96)",
    "verdeCard2": "rgba(40, 50, 60, 0.92)",
    "verdeCard3": "rgba(30, 38, 46, 0.55)",
    "verdeCard4": "rgba(20, 26, 32, 0.25)",
    "marromQuente": "#2a2f36",
    "azulAcento": "#a9c7d6",
    "azulSoft": "rgba(169, 199, 214, 0.42)",
    "azulGhost": "rgba(169, 199, 214, 0.09)",
    "branco": "#ffffff",
    "brancoMuted": "rgba(255, 255, 255, 0.85)",
    "brancoDim": "rgba(255, 255, 255, 0.55)",
    "linha": "rgba(230, 238, 245, 0.92)",
    "linhaSoft": "rgba(230, 238, 245, 0.40)",
    "linhaGhost": "rgba(255, 255, 255, 0.12)",
    "fundoPalco": "#0c0e11",
}

# Tema quente (âmbar/marrom dourado), preset moderno.
_PALETA_AMBAR_QUENTE: dict[str, str] = {
    "verdeMoldura": "#c9a24b",
    "verdeProfundo": "#211a12",
    "verdeCard1": "rgba(74, 52, 34, 0.96)",
    "verdeCard2": "rgba(62, 44, 28, 0.92)",
    "verdeCard3": "rgba(48, 34, 22, 0.55)",
    "verdeCard4": "rgba(32, 22, 14, 0.25)",
    "marromQuente": "#4a2f1e",
    "azulAcento": "#e8c98a",
    "azulSoft": "rgba(232, 201, 138, 0.42)",
    "azulGhost": "rgba(232, 201, 138, 0.09)",
    "branco": "#fdf6ec",
    "brancoMuted": "rgba(253, 246, 236, 0.85)",
    "brancoDim": "rgba(253, 246, 236, 0.55)",
    "linha": "rgba(245, 238, 225, 0.92)",
    "linhaSoft": "rgba(245, 238, 225, 0.40)",
    "linhaGhost": "rgba(255, 255, 255, 0.12)",
    "fundoPalco": "#140f0a",
}

# Biblioteca versionada. O primeiro item É o default (`atual`). Adicionar um tema =
# acrescentar uma entrada aqui com a paleta completa + preset.
_TEMAS: tuple[Tema, ...] = (
    Tema(id="atual", nome="Verde Editorial", paleta=_PALETA_ATUAL, fonte_preset="atual"),
    Tema(
        id="editorial-escuro",
        nome="Editorial Escuro",
        paleta=_PALETA_EDITORIAL_ESCURO,
        fonte_preset="cientifica",
    ),
    Tema(
        id="ambar-quente",
        nome="Âmbar Quente",
        paleta=_PALETA_AMBAR_QUENTE,
        fonte_preset="moderna",
    ),
)

_TEMAS_POR_ID: dict[str, Tema] = {t.id: t for t in _TEMAS}


def listar_temas() -> tuple[Tema, ...]:
    """Todos os temas versionados, na ordem de exibição (default primeiro)."""
    return _TEMAS


def obter_tema(tema_id: str | None) -> Tema | None:
    """O tema de `tema_id`, ou `None` se o id não existir (ou for vazio/None)."""
    if not tema_id:
        return None
    return _TEMAS_POR_ID.get(tema_id)


def tema_ou_default(tema_id: str | None) -> Tema:
    """O tema de `tema_id`, caindo no default (`atual`) quando ausente/inválido."""
    return obter_tema(tema_id) or _TEMAS_POR_ID[TEMA_DEFAULT_ID]
