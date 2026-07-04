"""D-156: resolução, serving e consolidação dos ASSETS VISUAIS por canal ativo.

Três frentes:

  - RESOLUÇÃO (`channel_paths`): mascote, fundos, retratos, paleta e palco derivam
    da raiz do canal ATIVO quando `<canal>/assets/` existe; senão caem no legado
    (garante render IDÊNTICO antes do move offline).
  - SERVING (`channel_assets_sync`): materializa os assets do canal nos diretórios
    servidos (Vite/Remotion) de forma idempotente, mantendo o código consumidor
    intacto.
  - MOVE OFFLINE (`consolidar_assets_do_canal`): traz os assets legados para
    `<canal>/assets/` via rename same-volume — lossless, idempotente, defensivo,
    e funde os dois diretórios de mascote sem perda.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from app import channel_assets_sync, channel_paths
from app import channel_layout_migration as mod
from app.channel_layout_migration import (
    LayoutMigrationError,
    consolidar_assets_do_canal,
)

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
    assert len(materializados) == 5  # 2 PNGs x 2 destinos + 1 theme


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


def test_sync_e_noop_no_layout_legado() -> None:
    # Sem raiz de assets do canal (None) → não materializa nada.
    assert channel_assets_sync.sincronizar_assets_servidos(None) == []


# --------------------------------------------------------------------------- #
# MOVE OFFLINE (consolidar_assets_do_canal)
# --------------------------------------------------------------------------- #


def _criar_instance_plano(instance: Path, handle: str = "@meucanal") -> None:
    instance.mkdir(parents=True, exist_ok=True)
    (instance / "channel.yaml").write_text(
        f'handle: "{handle}"\nnome: "Meu Canal"\n', encoding="utf-8"
    )
    (instance / "editorial").mkdir()
    (instance / "editorial" / "cortes.md").write_text("# cortes\n", encoding="utf-8")


def _criar_repo_assets(repo: Path) -> None:
    """Layout dos assets espalhados no repo (subpasta canônica `mascote/`)."""
    vr_mascote = repo / "video-renderer" / "public" / "mascote"
    vr_mascote.mkdir(parents=True)
    for nome in ("sapo_serio.png", "sapo_animado.png", "sapo_pensativo.png"):
        (vr_mascote / nome).write_bytes(f"vr-{nome}".encode())

    fe_mascote = repo / "frontend" / "public" / "mascote"
    fe_mascote.mkdir(parents=True)
    # Subset idêntico ao superset (mesmo nome + mesmo conteúdo → redundante).
    (fe_mascote / "sapo_serio.png").write_bytes(b"vr-sapo_serio.png")

    bg = repo / "backend" / "assets" / "youtube_bg"
    bg.mkdir(parents=True)
    (bg / "estudio.png").write_bytes(b"fundo-estudio")

    retr = repo / "backend" / "assets" / "retratos"
    retr.mkdir(parents=True)
    (retr / "karl_marx.jpg").write_bytes(b"retrato")

    (repo / "video-renderer" / "theme.config.json").write_text(
        '{"palette":{"verde":"#0f0"}}', encoding="utf-8"
    )


def test_consolida_assets_sem_perda(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    _criar_repo_assets(repo)

    resultado = consolidar_assets_do_canal(instance_root=instance, repo_root=repo)
    canal = instance / "channels" / "meucanal"
    assert resultado.canal_root == canal

    assets = canal / "assets"
    assert (assets / "mascote" / "sapo_serio.png").read_bytes() == b"vr-sapo_serio.png"
    assert (assets / "mascote" / "sapo_animado.png").is_file()
    assert (assets / "mascote" / "sapo_pensativo.png").is_file()
    assert (assets / "youtube_bg" / "estudio.png").read_bytes() == b"fundo-estudio"
    assert (assets / "retratos" / "karl_marx.jpg").read_bytes() == b"retrato"
    assert (assets / "theme.config.json").read_text(encoding="utf-8") == '{"palette":{"verde":"#0f0"}}'

    # Origens esvaziadas.
    assert not (repo / "video-renderer" / "public" / "mascote").exists()
    assert not (repo / "frontend" / "public" / "mascote").exists()
    assert not (repo / "backend" / "assets" / "youtube_bg").exists()
    assert not (repo / "video-renderer" / "theme.config.json").exists()


def test_consolidacao_assets_e_idempotente(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    _criar_repo_assets(repo)

    consolidar_assets_do_canal(instance_root=instance, repo_root=repo)
    canal = instance / "channels" / "meucanal"
    estado1 = _checksums(canal / "assets")

    resultado2 = consolidar_assets_do_canal(instance_root=instance, repo_root=repo)
    estado2 = _checksums(canal / "assets")

    assert resultado2.acao == "noop"
    assert estado2 == estado1


def test_funde_mascote_subset_divergente_aborta(tmp_path: Path) -> None:
    """Mesmo nome com conteúdo diferente entre os dois mascotes → aborta (ambíguo)."""
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    _criar_repo_assets(repo)
    # Sobrescreve o subset com conteúdo DIVERGENTE do superset.
    (repo / "frontend" / "public" / "mascote" / "sapo_serio.png").write_bytes(b"DIVERGENTE")

    with pytest.raises(LayoutMigrationError, match="difere"):
        consolidar_assets_do_canal(instance_root=instance, repo_root=repo)


def test_aborta_quando_volumes_diferentes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    _criar_repo_assets(repo)

    def fake_id_volume(caminho: Path) -> int:
        return 1 if str(repo) in str(caminho) else 2

    monkeypatch.setattr(mod, "_id_volume", fake_id_volume)

    with pytest.raises(LayoutMigrationError, match="volumes diferentes"):
        consolidar_assets_do_canal(instance_root=instance, repo_root=repo)

    # Nada movido: origem intacta.
    assert (repo / "backend" / "assets" / "youtube_bg" / "estudio.png").is_file()


def test_sem_repo_root_explicito_recusa(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    _criar_instance_plano(instance)

    with pytest.raises(ValueError, match="repo_root"):
        consolidar_assets_do_canal(instance_root=instance)

    assert not (instance / "channels" / "meucanal" / "assets").exists()


def _checksums(raiz: Path) -> dict[str, str]:
    saida: dict[str, str] = {}
    for arquivo in sorted(raiz.rglob("*")):
        if arquivo.is_file():
            rel = arquivo.relative_to(raiz).as_posix()
            saida[rel] = hashlib.sha256(arquivo.read_bytes()).hexdigest()
    return saida
