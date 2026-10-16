"""D-938: o desenho da capa do TikTok se escolhe na tela de Canais, sem corte."""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.services import estilo_da_capa, palco_componentes


@pytest.fixture
def canal(tmp_path: Path, monkeypatch):
    banco = tmp_path / "settings.db"
    palco_componentes.gravar({"estilo": "atual"}, db_path=banco, cache_dir=tmp_path)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: banco)
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-a")


@pytest.fixture
def cliente(canal):
    from app.routers import capa_tiktok_estilo
    from app.routers.errors import registrar_tratadores
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(capa_tiktok_estilo.router, prefix="/api/capa-tiktok")
    return TestClient(app)


def test_trocar_o_desenho_preserva_componentes_e_posicoes(canal):
    estilo_da_capa.gravar({"visiveis": {"selo": False}, "posicoes": {"selo": {"y": 900}}})
    estilo_da_capa.escolher_estilo("limpo")
    assert estilo_da_capa.ler_salvo() == {
        "estilo": "limpo",
        "visiveis": {"selo": False},
        "posicoes": {"selo": {"y": 900}},
    }


def test_seguir_o_palco_e_a_chave_ausente(canal):
    """RN-10: seguir o palco não grava valor nenhum — volta a herdar."""
    estilo_da_capa.escolher_estilo("limpo")
    estilo_da_capa.escolher_estilo("palco")
    assert estilo_da_capa.ler_salvo() == {}


def test_a_tela_le_e_grava_sem_corte(cliente):
    assert cliente.get("/api/capa-tiktok/estilo/do-canal").json() == {"estilo": "palco"}
    gravado = cliente.put("/api/capa-tiktok/estilo/do-canal", json={"estilo": "atual"})
    assert gravado.status_code == 200
    assert gravado.json() == {"estilo": "atual"}
    assert cliente.get("/api/capa-tiktok/estilo/do-canal").json() == {"estilo": "atual"}


def test_desenho_desconhecido_e_recusado(cliente):
    assert (
        cliente.put("/api/capa-tiktok/estilo/do-canal", json={"estilo": "neon"}).status_code == 400
    )
    assert estilo_da_capa.ler_salvo() == {}
