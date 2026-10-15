"""D-932: a capa do TikTok sai no estilo do palco horizontal do corte."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.services import capa_tiktok, estilo_da_capa, palco_componentes, palco_por_escopo


@pytest.fixture
def db(tmp_path: Path, monkeypatch) -> Path:
    banco = tmp_path / "settings.db"
    palco_componentes.gravar({"estilo": "atual"}, db_path=banco, cache_dir=tmp_path)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: banco)
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")
    return banco


def test_canal_no_estilo_atual_mantem_a_capa_de_sempre(db: Path):
    assert estilo_da_capa.estilo_do_palco("p1", "c1")["estilo"] == "atual"


def test_canal_no_estilo_limpo_leva_a_capa_limpa_com_o_fundo_dele(db: Path, tmp_path: Path):
    palco_componentes.gravar({"estilo": "limpo", "fundo": "linho"}, db_path=db, cache_dir=tmp_path)
    assert estilo_da_capa.estilo_do_palco("p1", "c1") == {"estilo": "limpo", "fundoLimpo": "linho"}


def test_escolha_do_corte_vale_para_a_capa_dele(db: Path):
    palco_por_escopo.gravar_escolha("corte", "c1", "horizontal", {"estilo": "limpo"})
    assert estilo_da_capa.estilo_do_palco("p1", "c1")["estilo"] == "limpo"
    assert estilo_da_capa.estilo_do_palco("p1", "c2")["estilo"] == "atual"


def test_palco_do_short_nao_muda_a_capa_do_horizontal(db: Path):
    palco_por_escopo.gravar_escolha("corte", "c1", "short", {"estilo": "limpo"})
    assert estilo_da_capa.estilo_do_palco("p1", "c1")["estilo"] == "atual"


@pytest.mark.asyncio
async def test_gerar_manda_o_estilo_ao_rasterizador(tmp_path: Path, monkeypatch):
    arte = tmp_path / "arte.png"
    arte.write_bytes(b"\x89PNG fake")
    enviados: list[dict] = []

    async def contexto(_corte_id, *, exigir_video=True):
        return {"projeto_id": "p1", "thumb_dir": tmp_path, "selo": "@canal", "texto_capa": "JURO"}

    async def rasterizar(destino: Path, props: dict) -> None:
        enviados.append(props)
        destino.write_bytes(b"png")

    async def gravar(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(capa_tiktok, "_contexto", contexto)
    monkeypatch.setattr(capa_tiktok, "_arte_existente", lambda *_: arte)
    monkeypatch.setattr(capa_tiktok, "_rasterizar", rasterizar)
    monkeypatch.setattr(capa_tiktok, "_gravar_caminho", gravar)
    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {})
    monkeypatch.setattr(
        estilo_da_capa,
        "estilo_do_palco",
        lambda projeto_id, corte_id: {"estilo": "limpo", "fundoLimpo": "aurora"},
    )

    await capa_tiktok.gerar("c1")

    assert (enviados[0]["estilo"], enviados[0]["fundoLimpo"]) == ("limpo", "aurora")


@pytest.mark.integration  # sobe o Remotion de verdade (D-751)
@pytest.mark.asyncio
async def test_renderer_desenha_a_capa_limpa_e_mantem_a_atual(tmp_path: Path):
    """O entry troca o desenho pelo `estilo`; sem ele, sai a capa de sempre."""
    if not (capa_tiktok._REPO_ROOT / "video-renderer" / "node_modules").exists():
        pytest.skip("renderer sem node_modules")
    faixas = {
        "etiqueta": {"x": 50, "y": 288, "w": 980, "h": 200},
        "frame": {"x": 130, "y": 512, "w": 819, "h": 1024},
        "selo": {"x": 50, "y": 1560, "w": 980, "h": 72},
    }
    base = {"fundo": "hud-forte", "etiqueta": "JURO", "selo": "@c", "frameDataUri": ""}
    capas = {}
    for nome, extra in (
        ("sem", {}),
        ("atual", {"estilo": "atual"}),
        ("limpo", {"estilo": "limpo"}),
    ):
        destino = tmp_path / f"{nome}.png"
        await capa_tiktok._rasterizar(destino, {**base, "faixas": faixas, **extra})
        capas[nome] = destino.read_bytes()

    assert capas["sem"] == capas["atual"]
    assert capas["limpo"] != capas["atual"]
