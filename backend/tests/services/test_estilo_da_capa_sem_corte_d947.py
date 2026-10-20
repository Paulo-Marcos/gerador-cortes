"""D-947: o modal "Estilizar capa" aberto pela tela de Canais, sem corte.

Sem corte não há arte nem palco de projeto: a prévia sai com o palco do canal e
a área da arte vazia, e salvar grava no mesmo destino do canal.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.domain.corte import estilo_da_capa as dominio
from app.services import capa_tiktok, estilo_da_capa, palco_componentes


@pytest.fixture
def cliente(tmp_path: Path, monkeypatch):
    from app.routers import capa_tiktok_estilo
    from app.routers.errors import registrar_tratadores
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    banco = tmp_path / "settings.db"
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: banco)
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-a")
    palco_componentes.gravar({"estilo": "limpo"}, db_path=banco, cache_dir=tmp_path)
    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {})
    monkeypatch.setattr(
        estilo_da_capa, "_cabecalho", lambda: {"nome": "Canal", "handle": "@c", "imagem": ""}
    )

    def sem_corte(*_):
        raise AssertionError("sem corte, nada se busca no banco nem na pasta do projeto")

    monkeypatch.setattr(estilo_da_capa, "corte_conferido", sem_corte)
    monkeypatch.setattr(capa_tiktok, "arte_do_corte", sem_corte)
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(capa_tiktok_estilo.router, prefix="/api/capa-tiktok")
    return TestClient(app)


def test_painel_sem_corte_segue_o_palco_do_canal_com_a_arte_vazia(cliente):
    resposta = cliente.get("/api/capa-tiktok/estilo")
    assert resposta.status_code == 200
    painel = resposta.json()
    assert painel["estilo_do_palco"] == "limpo"
    assert painel["efetivo"]["estilo"] == "limpo"
    assert painel["arte"] == ""
    assert set(painel["efetivo"]["faixas"]) == set(dominio.COMPONENTES)


def test_coordenadas_do_painel_saem_inteiras(cliente):
    """A garantia que o teste do endpoint removido dos Ajustes dava (D-722, D-948)."""
    painel = cliente.get("/api/capa-tiktok/estilo").json()
    for faixa in [*painel["padrao"].values(), *painel["efetivo"]["faixas"].values()]:
        assert all(type(faixa[eixo]) is int for eixo in ("x", "y", "w", "h"))


def test_previa_sem_corte_mostra_o_rascunho_sem_gravar(cliente):
    previa = cliente.post("/api/capa-tiktok/estilo/previa", json={"estilo": {"estilo": "atual"}})
    assert previa.status_code == 200
    assert previa.json()["efetivo"]["estilo"] == "atual"
    assert estilo_da_capa.ler_salvo() == {}


def test_gravar_sem_corte_vale_para_o_canal(cliente):
    estilo = {"estilo": "atual", "visiveis": {"selo": False}}
    gravado = cliente.put("/api/capa-tiktok/estilo", json={"estilo": estilo})
    assert gravado.status_code == 200
    assert estilo_da_capa.ler_salvo() == estilo
    assert gravado.json()["efetivo"]["visiveis"]["selo"] is False


def test_o_layout_global_dos_ajustes_segue_como_base_da_capa(cliente, monkeypatch):
    """D-948: o endpoint dos Ajustes saiu; o layout global continua na cascata (RN-10)."""
    monkeypatch.setattr(estilo_da_capa, "ajuste_do_layout", lambda: {"selo": {"y": 1500}})
    painel = cliente.get("/api/capa-tiktok/estilo").json()
    assert painel["padrao"]["selo"]["y"] == 1500
    assert painel["efetivo"]["faixas"]["selo"]["y"] == 1500


def test_o_endpoint_do_layout_nos_ajustes_saiu():
    from app.routers import settings

    assert "/capa-tiktok/layout" not in {rota.path for rota in settings.router.routes}
