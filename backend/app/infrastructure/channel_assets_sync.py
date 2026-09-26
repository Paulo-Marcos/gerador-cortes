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

import json
import re
import shutil
from pathlib import Path

from app.core import channel_paths

_REPO_ROOT = Path(__file__).resolve().parents[3]  # infrastructure → app → backend → repo
_FRONTEND_MASCOTE = _REPO_ROOT / "frontend" / "public" / "mascote"
_RENDERER_MASCOTE = _REPO_ROOT / "video-renderer" / "public" / "mascote"
_RENDERER_THEME = _REPO_ROOT / "video-renderer" / "theme.config.json"

# Nomes aceitos para a subpasta de PNGs do mascote nos assets do canal: o genérico
# `mascote/` (E-011) tem precedência; `sapo/` é fallback legado.
_SUBDIRS_MASCOTE = ("mascote", "sapo")

# D-636: o render procura cada pose pelo nome canônico `<pose>.png`. Canais antigos
# forneceram os PNGs com o prefixo do primeiro mascote (`sapo_<pose>.png`); eles
# ganham uma cópia canônica no diretório servido, sem renomear nada na origem.
_PREFIXO_LEGADO_POSE = re.compile(r"^sapo_([a-z]+)\.png$")


def nome_canonico_da_pose(nome_arquivo: str) -> str | None:
    """`sapo_pensativo.png` -> `pensativo.png`; None se não for pose legada."""
    achado = _PREFIXO_LEGADO_POSE.match(nome_arquivo)
    return f"{achado.group(1)}.png" if achado else None


def _garantir_nomes_canonicos(servido: Path) -> list[Path]:
    """Cria `<pose>.png` para cada `sapo_<pose>.png` do diretório servido."""
    if not servido.is_dir():
        return []
    criados: list[Path] = []
    for arquivo in sorted(servido.iterdir()):
        canonico = nome_canonico_da_pose(arquivo.name)
        if canonico and _espelhar_arquivo(arquivo, servido / canonico):
            criados.append(servido / canonico)
    return criados


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
    frontend_mascote = frontend_mascote or _FRONTEND_MASCOTE
    renderer_mascote = renderer_mascote or _RENDERER_MASCOTE
    if canal_assets_root is None:
        canal_assets_root = channel_paths.assets_root()

    materializados: list[Path] = []
    # Layout legado (sem assets do canal) ou canal sem mascote: nada a copiar, os
    # PNGs já servidos são a fonte — mas eles ainda precisam dos nomes canônicos.
    mascote_src = _origem_mascote(canal_assets_root) if canal_assets_root else None
    if mascote_src is not None:
        materializados += _espelhar_dir(mascote_src, frontend_mascote)
        materializados += _espelhar_dir(mascote_src, renderer_mascote)
    materializados += _garantir_nomes_canonicos(frontend_mascote)
    materializados += _garantir_nomes_canonicos(renderer_mascote)
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


def paleta_do_tema() -> dict:
    """A paleta do canal inteira, lida do `theme.config.json` sincronizado.

    D-499: o fundo do short passou a ser ESCOLHIDO dentro da paleta, e escolher
    exige ver a lista — não dá para oferecer opções lendo uma chave por vez.

    Dicionário vazio quando o arquivo não existe ou está quebrado; quem chama
    decide o default, porque tema ausente não pode derrubar um render.
    """
    try:
        dados = json.loads(_RENDERER_THEME.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    paleta = dados.get("palette") if isinstance(dados, dict) else None
    return paleta if isinstance(paleta, dict) else {}


def cor_do_tema(chave: str, padrao: str) -> str:
    """Uma cor da paleta do canal, lida do `theme.config.json` sincronizado.

    Existe para que o BACKEND possa usar as cores do canal — a moldura do short
    (D-501) precisa da mesma `verdeMoldura` que o renderer usa. Cravar o valor
    aqui criaria uma segunda fonte: o canal trocaria a paleta e o short sairia
    com a cor antiga, sem nada indicando por quê.

    Devolve `padrao` quando o arquivo não existe ou não tem a chave — cor
    ausente não pode derrubar um render.
    """
    valor = paleta_do_tema().get(chave)
    return valor if isinstance(valor, str) and valor.strip() else padrao
