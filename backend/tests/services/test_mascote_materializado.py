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

from app.channel_assets_sync import garantir_mascote_materializado


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
    assert len(materializados) == 4  # 2 PNGs x 2 destinos


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
    assert len(materializados) == 2  # 1 PNG x 2 destinos


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


def test_sem_assets_do_canal_e_noop() -> None:
    # Layout legado (assets_root None) → não materializa nada, preserva o fallback.
    assert garantir_mascote_materializado(None) == []


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
