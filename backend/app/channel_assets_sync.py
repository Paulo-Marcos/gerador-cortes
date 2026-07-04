"""Materializa os assets do canal ATIVO nos diretórios SERVIDOS (D-156).

MECANISMO DE SERVING (Opção "a" — materialização). O desafio é que o Vite serve
`frontend/public/` e o Remotion serve `video-renderer/public/` via `staticFile`;
nenhum dos dois sabe "qual canal está ativo". Em vez de fazer o front/Remotion
carregarem cada asset por uma URL do backend (acoplaria render → backend no ar,
quebraria `staticFile`, mexeria no caminho de cache do navegador), ESPELHAMOS os
assets do canal ativo para dentro dos diretórios públicos que essas ferramentas já
servem hoje:

    <canal>/assets/mascote/*         -> frontend/public/mascote, video-renderer/public/mascote
    <canal>/assets/theme.config.json -> video-renderer/theme.config.json

POR QUÊ assim: os componentes consumidores (`Mascote.tsx` com `staticFile('/mascote/..')`,
`CenaOverlay.tsx` com `/mascote/..` e `theme-v2.ts` com `import '../theme.config.json'`)
leem sempre dos diretórios servidos, então o canal #1 renderiza igual ao de hoje.
É idempotente (só copia o que falta ou divergiu em tamanho) e é NO-OP enquanto o
canal não tiver `assets/` consolidado (o move offline ainda não rodou) — nesse
layout legado os arquivos versionados nos diretórios servidos JÁ são a fonte,
então não há o que materializar. O nome legado `sapo/` continua aceito como
origem (E-011) para não regredir canais consolidados antes da genericização.

Disparado no boot (via `garantir_layout_de_canais`) e ao final do comando offline
de move — os dois pontos em que os assets do canal ativo podem ter mudado de lugar.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from app import channel_paths

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_FRONTEND_MASCOTE = _REPO_ROOT / "frontend" / "public" / "mascote"
_RENDERER_MASCOTE = _REPO_ROOT / "video-renderer" / "public" / "mascote"
_RENDERER_THEME = _REPO_ROOT / "video-renderer" / "theme.config.json"

# Nomes aceitos para a subpasta de PNGs do mascote nos assets do canal: o genérico
# `mascote/` (E-011) tem precedência; `sapo/` é fallback legado.
_SUBDIRS_MASCOTE = ("mascote", "sapo")


def _origem_mascote(canal_assets_root: Path) -> Path | None:
    """Subpasta de PNGs do mascote no canal: `mascote/` (canônica) ou `sapo/` (legada).

    None quando nenhuma existir (canal ainda sem mascote consolidado).
    """
    for nome in _SUBDIRS_MASCOTE:
        candidato = canal_assets_root / nome
        if candidato.is_dir():
            return candidato
    return None


def garantir_mascote_materializado(
    canal_assets_root: Path | None = None,
    *,
    frontend_mascote: Path | None = None,
    renderer_mascote: Path | None = None,
) -> list[Path]:
    """Materializa os PNGs do mascote do canal ATIVO nos dois `public/mascote`.

    Espelha `<canal>/assets/mascote/*` -> `frontend/public/mascote` e
    `video-renderer/public/mascote` — os diretórios que o Vite e o Remotion
    (`staticFile('/mascote/..')`) servem. Assim o mascote do canal ativo passa a
    ser servido SEM tocar os componentes. Aceita o nome legado `assets/sapo/` como
    origem (E-011) para não regredir canais consolidados antes da genericização.

    Idempotente (só copia o que falta ou divergiu em tamanho) e NO-OP quando:
      - o canal ainda não consolidou seus assets (`assets_root()` é None — layout
        legado, o move offline não rodou); ou
      - o canal não tem `assets/mascote/` (nem o legado `assets/sapo/`).
    Em ambos os casos os PNGs versionados já servidos são a fonte e o
    `public/mascote` atual é PRESERVADO (nunca apagado) — o fallback continua valendo.

    Ponto de costura chamado ANTES de renderizar overlays e ao SELECIONAR um canal.

    Args:
        canal_assets_root: raiz de assets do canal. Default: a do canal ATIVO
            (`channel_paths.assets_root()`); None nesse default = layout legado.
        frontend_mascote / renderer_mascote: destinos servidos (parametrizáveis
            para teste). Default: os caminhos reais do repo.

    Returns:
        Lista dos arquivos efetivamente (re)materializados nesta execução.
    """
    if canal_assets_root is None:
        canal_assets_root = channel_paths.assets_root()
    if canal_assets_root is None:
        return []  # legado: os PNGs versionados nos dirs servidos já são a fonte

    mascote_src = _origem_mascote(canal_assets_root)
    if mascote_src is None:
        return []  # canal ainda sem mascote consolidado → mantém o fallback atual

    frontend_mascote = frontend_mascote or _FRONTEND_MASCOTE
    renderer_mascote = renderer_mascote or _RENDERER_MASCOTE

    materializados: list[Path] = []
    materializados += _espelhar_dir(mascote_src, frontend_mascote)
    materializados += _espelhar_dir(mascote_src, renderer_mascote)
    return materializados


def sincronizar_assets_servidos(
    canal_assets_root: Path | None = None,
    *,
    frontend_mascote: Path | None = None,
    renderer_mascote: Path | None = None,
    renderer_theme: Path | None = None,
) -> list[Path]:
    """Espelha os assets do canal ativo nos diretórios servidos. Idempotente.

    Materializa o mascote (via `garantir_mascote_materializado`) e a paleta
    (`theme.config.json`). Ver aquela função para a semântica de mascote/no-op.

    Args:
        canal_assets_root: raiz de assets do canal. Default: a do canal ATIVO
            (`channel_paths.assets_root()`); None nesse default = layout legado.
        frontend_mascote / renderer_mascote / renderer_theme: destinos servidos
            (parametrizáveis para teste). Default: os caminhos reais do repo.

    Returns:
        Lista dos arquivos efetivamente (re)materializados nesta execução.
    """
    if canal_assets_root is None:
        canal_assets_root = channel_paths.assets_root()
    if canal_assets_root is None:
        return []  # legado: os arquivos versionados nos dirs servidos já são a fonte

    materializados: list[Path] = garantir_mascote_materializado(
        canal_assets_root,
        frontend_mascote=frontend_mascote,
        renderer_mascote=renderer_mascote,
    )

    renderer_theme = renderer_theme or _RENDERER_THEME
    theme_src = canal_assets_root / "theme.config.json"
    if theme_src.is_file() and _espelhar_arquivo(theme_src, renderer_theme):
        materializados.append(renderer_theme)

    return materializados


def _espelhar_dir(origem: Path, destino: Path) -> list[Path]:
    """Copia cada arquivo de `origem` para `destino` quando ausente ou divergente."""
    destino.mkdir(parents=True, exist_ok=True)
    copiados: list[Path] = []
    for arquivo in origem.iterdir():
        if not arquivo.is_file():
            continue
        alvo = destino / arquivo.name
        if _espelhar_arquivo(arquivo, alvo):
            copiados.append(alvo)
    return copiados


def _espelhar_arquivo(origem: Path, destino: Path) -> bool:
    """Copia `origem`->`destino` se o destino faltar ou tiver tamanho diferente.

    Comparar tamanho (não conteúdo) é barato e suficiente para os PNGs/JSON do
    canal, que são reescritos por inteiro quando trocam. Retorna True se copiou.
    """
    if destino.exists() and destino.stat().st_size == origem.stat().st_size:
        return False
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(origem, destino)
    return True
