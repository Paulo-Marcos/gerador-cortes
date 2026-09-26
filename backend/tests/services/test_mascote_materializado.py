"""D-171 / E-011: materialização do mascote do canal ATIVO nos `public/mascote`.

`garantir_mascote_materializado()` espelha `<canal>/assets/mascote/*` para os dois
diretórios que Vite/Remotion servem (`frontend/public/mascote`,
`video-renderer/public/mascote`), sem tocar os componentes `.tsx`. Deve ser
idempotente e NO-OP quando o canal ainda não tem mascote consolidado — nunca
apagando o `public/mascote` de fallback já servido. O nome legado `sapo/` continua
aceito como origem (E-011) para não regredir canais consolidados antes da
genericização.
"""

from __future__ import annotations

from pathlib import Path

from app.infrastructure.channel_assets_sync import garantir_mascote_materializado


def _criar_mascote(
    canal_assets: Path, arquivos: dict[str, bytes], *, subdir: str = "mascote"
) -> None:
    mascote = canal_assets / subdir
    mascote.mkdir(parents=True)
    for nome, conteudo in arquivos.items():
        (mascote / nome).write_bytes(conteudo)


def test_materializa_mascote_nos_dois_public_mascote(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    _criar_mascote(
        canal_assets,
        {"sapo_serio.png": b"PNG-serio", "sapo_animado.png": b"PNG-animado"},
    )
    frontend = tmp_path / "frontend" / "public" / "mascote"
    renderer = tmp_path / "renderer" / "public" / "mascote"

    materializados = garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer
    )

    assert (frontend / "sapo_serio.png").read_bytes() == b"PNG-serio"
    assert (frontend / "sapo_animado.png").read_bytes() == b"PNG-animado"
    assert (renderer / "sapo_serio.png").read_bytes() == b"PNG-serio"
    assert (renderer / "sapo_animado.png").read_bytes() == b"PNG-animado"
    # 2 PNGs x 2 destinos, cada um + a cópia canônica `<pose>.png` (D-636)
    assert len(materializados) == 8


def test_aceita_origem_legada_sapo(tmp_path: Path) -> None:
    # Canal consolidado antes da genericização: assets/sapo/ ainda é aceito.
    canal_assets = tmp_path / "canal" / "assets"
    _criar_mascote(canal_assets, {"sapo_serio.png": b"PNG"}, subdir="sapo")
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"

    materializados = garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer
    )

    assert (frontend / "sapo_serio.png").read_bytes() == b"PNG"
    assert (renderer / "sapo_serio.png").read_bytes() == b"PNG"
    assert len(materializados) == 4  # 1 PNG x 2 destinos, + cópia canônica (D-636)


def test_prefere_mascote_sobre_sapo(tmp_path: Path) -> None:
    # Com as duas subpastas presentes, `mascote/` (canônica) tem precedência.
    canal_assets = tmp_path / "canal" / "assets"
    _criar_mascote(canal_assets, {"sapo_serio.png": b"NOVO"}, subdir="mascote")
    _criar_mascote(canal_assets, {"sapo_serio.png": b"LEGADO"}, subdir="sapo")
    frontend = tmp_path / "frontend" / "mascote"

    garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=tmp_path / "r"
    )

    assert (frontend / "sapo_serio.png").read_bytes() == b"NOVO"


def test_materializacao_e_idempotente(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    _criar_mascote(canal_assets, {"sapo_serio.png": b"PNG"})
    kwargs = dict(
        frontend_mascote=tmp_path / "frontend" / "mascote",
        renderer_mascote=tmp_path / "renderer" / "mascote",
    )

    garantir_mascote_materializado(canal_assets, **kwargs)
    segunda = garantir_mascote_materializado(canal_assets, **kwargs)

    assert segunda == []  # nada divergiu → nenhuma cópia na 2ª passagem


def test_sem_assets_do_canal_e_noop(tmp_path: Path, monkeypatch) -> None:
    # Layout legado (assets_root None) → não copia nada do canal, preserva o fallback.
    from app.infrastructure import channel_assets_sync

    monkeypatch.setattr(channel_assets_sync.channel_paths, "assets_root", lambda: None)
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"
    assert (
        garantir_mascote_materializado(None, frontend_mascote=frontend, renderer_mascote=renderer)
        == []
    )


def test_canal_sem_pasta_mascote_e_noop(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    (canal_assets / "youtube_bg").mkdir(parents=True)  # tem assets, mas sem mascote/
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"

    materializados = garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer
    )

    assert materializados == []
    assert not frontend.exists()  # NÃO cria/apaga nada quando não há mascote
    assert not renderer.exists()


# ─── D-636: nome canônico por pose ──────────────────────────────────────────


def test_pngs_legados_ganham_nome_canonico_no_servido(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    (canal_assets / "sapo").mkdir(parents=True)
    (canal_assets / "sapo" / "sapo_pensativo.png").write_bytes(b"PNG-pensativo")
    (canal_assets / "sapo" / "sapo_serio.png").write_bytes(b"PNG-serio")
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"

    garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer
    )

    for servido in (frontend, renderer):
        assert (servido / "pensativo.png").read_bytes() == b"PNG-pensativo"
        assert (servido / "serio.png").read_bytes() == b"PNG-serio"
        assert (servido / "sapo_pensativo.png").exists()  # origem legada preservada


def test_canal_com_nomes_canonicos_e_copiado_como_esta(tmp_path: Path) -> None:
    canal_assets = tmp_path / "canal" / "assets"
    (canal_assets / "mascote").mkdir(parents=True)
    (canal_assets / "mascote" / "pensativo.png").write_bytes(b"coruja")
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"

    garantir_mascote_materializado(
        canal_assets, frontend_mascote=frontend, renderer_mascote=renderer
    )

    assert (renderer / "pensativo.png").read_bytes() == b"coruja"
    assert sorted(p.name for p in renderer.iterdir()) == ["pensativo.png"]


def test_layout_legado_normaliza_o_cache_ja_servido(tmp_path: Path, monkeypatch) -> None:
    from app.infrastructure import channel_assets_sync

    monkeypatch.setattr(channel_assets_sync.channel_paths, "assets_root", lambda: None)
    frontend = tmp_path / "frontend" / "mascote"
    renderer = tmp_path / "renderer" / "mascote"
    renderer.mkdir(parents=True)
    (renderer / "sapo_animado.png").write_bytes(b"animado")

    criados = garantir_mascote_materializado(
        None, frontend_mascote=frontend, renderer_mascote=renderer
    )

    assert criados == [renderer / "animado.png"]
    assert not frontend.exists()
    assert (
        garantir_mascote_materializado(None, frontend_mascote=frontend, renderer_mascote=renderer)
        == []
    )  # idempotente
