"""D-156: resolução e serving dos ASSETS VISUAIS por canal ativo.

Duas frentes (o move offline saiu no D-698, junto com o comando que o rodava):

  - RESOLUÇÃO (`channel_paths`): mascote, fundos, retratos, paleta e palco derivam
    da raiz do canal ATIVO quando `<canal>/assets/` existe; senão caem no legado
    (garante render IDÊNTICO antes do move offline).
  - SERVING (`channel_assets_sync`): materializa os assets do canal nos diretórios
    servidos (Vite/Remotion) de forma idempotente, mantendo o código consumidor
    intacto.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.infrastructure import channel_assets_sync

# --------------------------------------------------------------------------- #
# RESOLUÇÃO por canal (channel_paths)
# --------------------------------------------------------------------------- #


@pytest.fixture
def canal_fixture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Aponta `active_channel_root`/`_instance_root` para uma instância-fixture."""
    instance = tmp_path / "instance"
    canal = instance / "channels" / "default"
    canal.mkdir(parents=True)
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: canal)
    monkeypatch.setattr(channel_paths, "_instance_root", lambda: instance)
    return canal


def test_resolvers_seguem_assets_do_canal_quando_consolidado(canal_fixture: Path) -> None:
    assets = canal_fixture / "assets"
    (assets / "youtube_bg").mkdir(parents=True)
    (assets / "retratos").mkdir()
    (assets / "mascote").mkdir()
    (assets / "theme.config.json").write_text("{}", encoding="utf-8")

    assert channel_paths.assets_root() == assets
    assert channel_paths.youtube_bg_dir() == assets / "youtube_bg"
    assert channel_paths.retratos_dir() == assets / "retratos"
    assert channel_paths.mascot_pngs_dir() == assets / "mascote"
    assert channel_paths.theme_config_path() == assets / "theme.config.json"


def test_mascot_pngs_dir_aceita_nome_legado_sapo(canal_fixture: Path) -> None:
    # Canal consolidado antes de E-011: só `assets/sapo/` existe → resolve nele.
    assets = canal_fixture / "assets"
    (assets / "sapo").mkdir(parents=True)

    assert channel_paths.mascot_pngs_dir() == assets / "sapo"


def test_resolvers_caem_no_legado_sem_assets_consolidado(canal_fixture: Path) -> None:
    # Canal sem `assets/` → resolvedores apontam para os locais versionados legados.
    assert channel_paths.assets_root() is None
    assert channel_paths.youtube_bg_dir().as_posix().endswith("backend/assets/youtube_bg")
    assert channel_paths.retratos_dir().as_posix().endswith("backend/assets/retratos")
    # E-011: canônico `public/mascote` quando presente; senão o legado `public/sapo`.
    mascote = channel_paths.mascot_pngs_dir().as_posix()
    assert mascote.endswith("video-renderer/public/mascote") or mascote.endswith(
        "video-renderer/public/sapo"
    )
    assert channel_paths.theme_config_path().as_posix().endswith("video-renderer/theme.config.json")


# --------------------------------------------------------------------------- #
# SERVING (channel_assets_sync)
# --------------------------------------------------------------------------- #


def test_sync_materializa_mascote_e_theme_nos_dirs_servidos(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    (canal_assets / "mascote").mkdir(parents=True)
    (canal_assets / "mascote" / "sapo_serio.png").write_bytes(b"PNG-serio")
    (canal_assets / "mascote" / "sapo_animado.png").write_bytes(b"PNG-animado")
    (canal_assets / "theme.config.json").write_text('{"palette":{}}', encoding="utf-8")

    frontend = tmp_path / "frontend" / "public" / "mascote"
    renderer = tmp_path / "renderer" / "public" / "mascote"
    theme = tmp_path / "renderer" / "theme.config.json"

    materializados = channel_assets_sync.sincronizar_assets_servidos(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer, renderer_theme=theme
    )

    assert (frontend / "sapo_serio.png").read_bytes() == b"PNG-serio"
    assert (renderer / "sapo_animado.png").read_bytes() == b"PNG-animado"
    assert theme.read_text(encoding="utf-8") == '{"palette":{}}'
    # 2 PNGs x 2 destinos + cópias canônicas `<pose>.png` (D-636) + 1 theme
    assert len(materializados) == 9


def test_sync_e_idempotente(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    (canal_assets / "mascote").mkdir(parents=True)
    (canal_assets / "mascote" / "sapo_serio.png").write_bytes(b"PNG")
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"
    theme = tmp_path / "renderer" / "theme.config.json"

    kwargs = dict(frontend_mascote=frontend, renderer_mascote=renderer, renderer_theme=theme)
    channel_assets_sync.sincronizar_assets_servidos(canal_assets, **kwargs)
    segunda = channel_assets_sync.sincronizar_assets_servidos(canal_assets, **kwargs)

    assert segunda == []  # nada divergiu → nenhuma cópia na 2ª passagem


def test_sync_e_noop_no_layout_legado(monkeypatch) -> None:
    # Sem raiz de assets do canal (None) → não materializa nada.
    monkeypatch.setattr(channel_assets_sync.channel_paths, "assets_root", lambda: None)
    assert channel_assets_sync.sincronizar_assets_servidos(None) == []
