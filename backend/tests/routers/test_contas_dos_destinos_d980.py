"""A tela de Canais lista a conta de cada destino e a esquece (D-980, RN-31)."""

import pytest
from app.core import channel_paths
from app.domain.publicacao.conta_do_destino import Conta
from app.services import conta_do_destino

ROTA = "/api/channels/ativo/contas-dos-destinos"


@pytest.fixture
def cliente(monkeypatch, tmp_path):
    from app.routers import channels
    from app.routers.errors import registrar_tratadores
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: tmp_path / "canal-a")
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(channels.router, prefix="/api/channels")
    return TestClient(app)


def test_lista_a_conta_aprendida_de_cada_destino(cliente):
    conta_do_destino.conferir_conta("tiktok", Conta("71", "@ateuinforma"))

    linhas = cliente.get(ROTA).json()

    assert [c["destino"] for c in linhas] == ["youtube", "tiktok", "instagram", "instagram_web"]
    tiktok = linhas[1]
    assert (tiktok["rotulo"], tiktok["conta_id"], tiktok["nome"]) == (
        "TikTok",
        "71",
        "@ateuinforma",
    )


def test_esquecer_apaga_a_conta_e_devolve_a_lista(cliente):
    conta_do_destino.conferir_conta("tiktok", Conta("71"))

    resposta = cliente.delete(f"{ROTA}/tiktok")

    assert resposta.status_code == 200
    assert resposta.json()[1]["conta_id"] == ""


def test_destino_desconhecido_e_recusado(cliente):
    assert cliente.delete(f"{ROTA}/orkut").status_code == 400
