"""
Resolução única dos caminhos do canal ativo.

Este módulo é o ÚNICO ponto que decide ONDE vivem os arquivos de um canal —
editorial, mascote e banco/projetos. Todos os consumidores derivam daqui, em vez
de montar `… / "instance" / …` cada um por conta própria.

POR QUÊ (épico Multi-canal — Opção X): cada canal será uma pasta autocontida
(`instance/channels/<canal>/{channel.yaml, editorial/, mascot/, projetos/,
projetos.db}`) com um ponteiro de "canal ativo". Quando isso existir (D-151), basta
`active_channel_root()` passar a apontar para `instance/channels/<ativo>/` e TODOS
os caminhos seguem atomicamente — sem caçar usos espalhados pelo código.

DESDE D-151 a raiz resolvida passou a apontar para a pasta do canal ATIVO
(`<repo>/instance/channels/<ativo>/`), lida do ponteiro `instance/active-channel`
que o migrador de boot (`channel_layout_migration`) garante existir. Com isso
TODOS os caminhos (editorial, mascote, banco/projetos) seguem o canal ativo
atomicamente. Mantemos um fallback seguro para o `instance/` plano legado caso o
ponteiro ainda não exista (ex.: primeiro boot antes do migrador rodar).
"""

from __future__ import annotations

import os
from pathlib import Path

# Raiz do repositório, derivada do próprio arquivo (backend/app/channel_paths.py):
# parent = app, parent.parent = backend, parent.parent.parent = raiz do repo.
# Mesma convenção de ancoragem usada por channel_config_loader e mascot_catalog.
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_BACKEND_ROOT = _REPO_ROOT / "backend"
_VIDEO_RENDERER_ROOT = _REPO_ROOT / "video-renderer"

_DIR_CANAIS = "channels"
_PONTEIRO_ATIVO = "active-channel"

# Subpasta que agrega os ASSETS VISUAIS do canal (D-156): mascote,
# fundos editoriais (youtube_bg), retratos e a paleta (theme.config.json).
_DIR_ASSETS = "assets"

# Nome da subpasta de PNGs do mascote. Desde E-011 o naming é genérico
# (`mascote/`); `sapo/` permanece aceito como fallback para não quebrar canais que
# já consolidaram assets sob o nome legado antes da genericização.
_DIR_MASCOTE = "mascote"
_DIR_MASCOTE_LEGADO = "sapo"


def _instance_root() -> Path:
    return _REPO_ROOT / "instance"


def instance_root() -> Path:
    """Raiz da instância (`<repo>/instance`), independente do canal ativo.

    É onde vive o banco de settings GLOBAL (D-191), fora da pasta de qualquer
    canal — settings de app e o registry de canais não pertencem a um canal só.
    """
    return _instance_root()


def settings_db_path() -> Path:
    """Banco de configurações da aplicação (`instance/settings.db`, D-191).

    Fonte da verdade das configs editáveis pelo app (ajustes de app por canal +
    identidade dos canais). Global e à parte do `projetos.db` (dados/mídias), para
    que evoluir a config nunca toque no banco pesado.
    """
    return _instance_root() / "settings.db"


def _ler_canal_ativo(instance_root: Path) -> str:
    """Id do canal ativo gravado no ponteiro, ou string vazia se ausente."""
    try:
        return (instance_root / _PONTEIRO_ATIVO).read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def active_channel_root() -> Path:
    """Raiz física do canal ATIVO.

    Resolve `<repo>/instance/channels/<canal-ativo>/` lendo o ponteiro
    `instance/active-channel`. Fallback seguro para o `instance/` plano quando o
    ponteiro/pasta do canal ainda não existir (layout legado pré-migração).
    Este é o ÚNICO ponto de virada do épico Multi-canal — todos os demais
    caminhos derivam daqui.
    """
    instance_root = _instance_root()
    canal = _ler_canal_ativo(instance_root)
    if canal:
        canal_root = instance_root / _DIR_CANAIS / canal
        if canal_root.is_dir():
            return canal_root
    return instance_root


def editorial_dir() -> Path:
    """Diretório editorial do canal ativo (`<raiz>/editorial`).

    Fonte editorial única (prompts/skills sobrescritas, `canal_config.py`).
    """
    return active_channel_root() / "editorial"


def mascot_dir() -> Path:
    """Diretório do mascote do canal ativo (`<raiz>/mascot`)."""
    return active_channel_root() / "mascot"


# --------------------------------------------------------------------------- #
# Assets visuais do canal (D-156)
# --------------------------------------------------------------------------- #


def _channel_assets_root() -> Path | None:
    """`<canal-ativo>/assets` se o canal já consolidou seus assets, senão None.

    Mesma disciplina de virada de `projetos_dir`: a virada é guiada pela PRESENÇA
    física da pasta `assets/` dentro do canal (criada pelo comando offline de move),
    não só pela existência da pasta do canal. Enquanto o canal não tiver `assets/`,
    os resolvedores caem no local LEGADO — garantindo render IDÊNTICO antes do move.
    """
    canal_root = active_channel_root()
    if canal_root != _instance_root():
        canal_assets = canal_root / _DIR_ASSETS
        if canal_assets.is_dir():
            return canal_assets
    return None


def assets_root() -> Path | None:
    """Raiz pública dos assets do canal ativo, ou None no layout legado (pré-move)."""
    return _channel_assets_root()


def youtube_bg_dir() -> Path:
    """Fundos editoriais (`youtube_bg/`) do canal ativo, com fallback ao legado."""
    canal_assets = _channel_assets_root()
    if canal_assets is not None and (canal_assets / "youtube_bg").is_dir():
        return canal_assets / "youtube_bg"
    return _BACKEND_ROOT / "assets" / "youtube_bg"


def retratos_dir() -> Path:
    """Cache de retratos (`retratos/`) do canal ativo, com fallback ao legado."""
    canal_assets = _channel_assets_root()
    if canal_assets is not None and (canal_assets / "retratos").is_dir():
        return canal_assets / "retratos"
    return _BACKEND_ROOT / "assets" / "retratos"


def _subdir_mascote(base: Path) -> Path | None:
    """Subpasta de PNGs do mascote em `base`: `mascote/` (canônica) ou `sapo/` (legada).

    Prefere o nome genérico introduzido em E-011 e cai no nome legado quando só
    este existir — mantém render idêntico para canais consolidados antes da
    genericização. None quando nenhum dos dois existe.
    """
    for nome in (_DIR_MASCOTE, _DIR_MASCOTE_LEGADO):
        if (base / nome).is_dir():
            return base / nome
    return None


def mascot_pngs_dir() -> Path:
    """PNGs do mascote (`mascote/`) do canal ativo, com fallback ao legado.

    Estes PNGs são consumidos pelo frontend (Vite) e pelo Remotion (`staticFile`)
    a partir dos diretórios públicos SERVIDOS; o canal os fornece e o
    `channel_assets_sync` materializa-os nesses diretórios. O fallback aponta para
    o superset versionado em `video-renderer/public/mascote` (51 poses), aceitando
    ainda o nome legado `sapo/` em ambos os níveis (assets do canal e versionado).
    """
    canal_assets = _channel_assets_root()
    if canal_assets is not None:
        do_canal = _subdir_mascote(canal_assets)
        if do_canal is not None:
            return do_canal
    versionado = _VIDEO_RENDERER_ROOT / "public"
    return _subdir_mascote(versionado) or versionado / _DIR_MASCOTE


def theme_config_path() -> Path:
    """`theme.config.json` (paleta) do canal ativo, com fallback ao legado.

    O Remotion importa a paleta em build (`theme-v2.ts`); o `channel_assets_sync`
    materializa este arquivo em `video-renderer/theme.config.json`. O fallback é o
    arquivo versionado nesse mesmo caminho.
    """
    canal_assets = _channel_assets_root()
    if canal_assets is not None and (canal_assets / "theme.config.json").is_file():
        return canal_assets / "theme.config.json"
    return _VIDEO_RENDERER_ROOT / "theme.config.json"


def palco_cache_dir() -> Path:
    """Cache do "palco" (frente editorial), derivado dos dados do canal ativo.

    O palco é um CACHE regenerável que vive DENTRO de `projetos/` — logo segue o
    canal automaticamente pela consolidação de dados (D-155), sem move próprio.
    Centralizamos aqui a resolução do nome do diretório (`_palco_cache`).
    """
    return projetos_dir() / "_palco_cache"


def _projetos_legado() -> Path:
    """Local legado dos dados: `PROJETOS_DIR` (env) ou `backend/projetos`."""
    env = os.getenv("PROJETOS_DIR")
    return Path(env) if env else _BACKEND_ROOT / "projetos"


# --------------------------------------------------------------------------- #
# Credenciais OAuth do YouTube (D-168)
# --------------------------------------------------------------------------- #
# POR QUÊ: no modelo OAuth há DOIS artefatos com escopos distintos:
#   • `client_secrets.json` = a identidade do APP (CortadorLive) perante o Google.
#     É emitido pelo Google Cloud e é UM SÓ do app — logo, compartilhado. Vive na
#     raiz do backend (local histórico), com override opcional por canal caso
#     algum canal use um app OAuth próprio.
#   • `token.json` = a autorização de UMA conta do YouTube (o login). Cada canal
#     publica numa conta diferente, então o token é SEMPRE por canal ativo.
# Ambos degradam para o layout legado (raiz do backend) quando não há canal ativo.

_DIR_YOUTUBE = "youtube"


def youtube_client_secrets_path() -> Path:
    """`client_secrets.json` (crachá do app) — compartilhado, com override por canal.

    É um credencial do APP (um só), então o padrão é a raiz do backend. Mas se um
    canal trouxer o seu próprio (`<canal-ativo>/youtube/client_secrets.json`), ele
    tem precedência — permitindo apps OAuth distintos por canal quando necessário.
    """
    canal_root = active_channel_root()
    if canal_root != _instance_root():
        candidato = canal_root / _DIR_YOUTUBE / "client_secrets.json"
        if candidato.exists():
            return candidato
    return _BACKEND_ROOT / "client_secrets.json"


def youtube_token_path() -> Path:
    """`token.json` (login) — SEMPRE do canal ativo (`<canal-ativo>/youtube/`).

    Cada canal autoriza uma conta diferente do YouTube, então o token segue o canal
    ativo mesmo que o `client_secrets.json` seja compartilhado na raiz do backend.
    Degrada para a raiz do backend apenas no layout legado (sem canal ativo).
    """
    canal_root = active_channel_root()
    if canal_root != _instance_root():
        return canal_root / _DIR_YOUTUBE / "token.json"
    return _BACKEND_ROOT / "token.json"


def projetos_dir() -> Path:
    """Diretório de dados operacionais (mídias + banco) do canal ativo.

    DESDE D-155 os dados podem viver em `instance/channels/<ativo>/projetos`. A
    virada é guiada pela PRESENÇA do banco já consolidado (não só pela existência
    da pasta do canal): enquanto `…/<ativo>/projetos/projetos.db` não existir,
    apontamos para o local legado. Assim, um boot ANTES da consolidação offline
    (`consolidar_dados_do_canal`) ainda lê os dados de onde eles realmente estão —
    sem criar um banco vazio paralelo — e, DEPOIS dela, segue o canal automaticamente.
    """
    canal_root = active_channel_root()
    if canal_root != _instance_root():
        canal_projetos = canal_root / "projetos"
        if (canal_projetos / "projetos.db").exists():
            return canal_projetos
    return _projetos_legado()


def database_url() -> str:
    """URL SQLAlchemy do banco do canal ativo (ou do legado até a consolidação).

    Derivada de `projetos_dir() / "projetos.db"`. Ver `projetos_dir`: a virada para
    a pasta do canal só ocorre quando o banco já foi consolidado lá, evitando abrir
    um banco vazio enquanto os dados ainda estão no local legado.
    """
    db = projetos_dir() / "projetos.db"
    return f"sqlite+aiosqlite:///{db.as_posix()}"


# --------------------------------------------------------------------------- #
# Caminhos de artefatos RELATIVOS à pasta do projeto (D-158)
# --------------------------------------------------------------------------- #
# POR QUÊ: o banco guardava caminhos ABSOLUTOS de artefatos (clip bruto,
# thumbnail, snapshot de avaliação). Quando a pasta do canal é relocada (move de
# dados do D-155, split PROD/DEV, container Docker), esses valores ficam stale e
# quebram a leitura. A cura é guardar o sub-caminho RELATIVO ao projeto e
# reancorá-lo, na leitura, pela raiz de dados vigente (`projetos_dir()`).


def para_relativo_ao_projeto(valor: str | os.PathLike[str], projeto_id: str) -> str:
    """Sub-caminho de um artefato RELATIVO à pasta do projeto.

    Aceita caminho absoluto legado (`C:\\...\\projetos\\<projeto_id>\\cortes\\...`),
    caminho de container Docker (`/app/projetos/<projeto_id>/...`) ou um valor já
    relativo — sempre devolve o trecho após o segmento `<projeto_id>/`, com barras
    normalizadas para `/`. Se `<projeto_id>` não aparecer (valor já relativo à raiz
    do projeto, ou vazio/não normalizável), devolve o próprio valor normalizado.
    """
    if not valor:
        return ""
    segmentos = [s for s in str(valor).replace("\\", "/").split("/") if s not in ("", ".")]
    for indice in range(len(segmentos) - 1, -1, -1):
        if segmentos[indice] == projeto_id:
            return "/".join(segmentos[indice + 1 :])
    return "/".join(segmentos)


def resolver_do_projeto(valor: str | os.PathLike[str], projeto_id: str) -> Path:
    """Caminho ABSOLUTO de um artefato, reancorado na raiz de dados vigente.

    Aceita valor relativo-ao-projeto (novo padrão) OU absoluto/Docker legado — o
    trecho relativo é extraído por `para_relativo_ao_projeto` e recolocado sob
    `projetos_dir() / <projeto_id>`. Assim um path gravado noutra máquina/local
    volta a resolver na raiz do canal ATIVO.
    """
    relativo = para_relativo_ao_projeto(valor, projeto_id)
    return projetos_dir() / projeto_id / relativo
