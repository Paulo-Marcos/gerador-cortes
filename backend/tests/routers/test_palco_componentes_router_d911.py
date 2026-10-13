"""D-911: os endpoints dos componentes do palco por canal.

Monta só o router de canais numa app nova, com a instância, o banco de settings,
as pastas de assets e o cache do palco redirecionados para o `tmp_path` — os
endpoints exercitam o filesystem inteiro sem tocar o `instance/` real.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.core import channel_paths
from app.infrastructure import channel_assets_sync
from app.routers import channels as channels_router
from app.routers.errors import registrar_tratadores
from app.services import channels as svc
from fastapi import FastAPI
from fastapi.testclient import TestClient

EXEMPLO_YAML = """config_version: 1
handle: "@seucanal"
nome: "Seu Canal"
credito: "@seucanal"
"""


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setattr(svc, "_REPO_ROOT", tmp_path)
    canal = tmp_path / "instance" / "channels" / "default"
    canal.mkdir(parents=True)
    (canal / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    (tmp_path / "instance" / "active-channel").write_text("default\n", encoding="utf-8")

    mascote = tmp_path / "mascote"
    mascote.mkdir()
    (mascote / "apresentador.png").write_bytes(b"POSE")
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(channel_paths, "palco_assets_dir", lambda: canal / "assets" / "palco")
    monkeypatch.setattr(channel_paths, "palco_cache_dir", lambda: tmp_path / "_palco_cache")
    monkeypatch.setattr(channel_paths, "mascot_pngs_dir", lambda: mascote)
    monkeypatch.setattr(channel_assets_sync, "RENDERER_PUBLIC", tmp_path / "renderer" / "public")

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(channels_router.router, prefix="/api/channels")
    return TestClient(app)


def test_get_devolve_o_padrao_com_a_identidade_herdada(client: TestClient):
    resp = client.get("/api/channels/default/palco")
    assert resp.status_code == 200
    body = resp.json()
    assert body["estilo"] == "atual"
    assert body["estilos"] == ["atual", "limpo"]
    assert body["fundo"] == "reticula-aurora"
    assert "linho" in body["fundos"]
    assert body["cabecalho"]["nome"] == ""
    assert body["cabecalho"]["nome_efetivo"] == "Seu Canal"
    assert body["cabecalho"]["handle_efetivo"] == "@seucanal"
    assert body["cabecalho"]["imagem"] == ""
    assert body["cabecalho"]["imagem_url"].startswith("/api/channels/default/palco/imagem?v=")
    assert body["placa"]["ativo"] is True


def test_put_edita_parcialmente(client: TestClient):
    resp = client.put(
        "/api/channels/default/palco",
        json={"estilo": "limpo", "cabecalho": {"nome": "Pedro", "handle": "pedroivosa"}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["estilo"] == "limpo"
    assert body["cabecalho"]["nome_efetivo"] == "Pedro"
    assert body["cabecalho"]["handle_efetivo"] == "@pedroivosa"

    resp = client.put("/api/channels/default/palco", json={"placa": {"ativo": False}})
    body = resp.json()
    assert body["estilo"] == "limpo"
    assert body["placa"]["ativo"] is False


def test_put_troca_o_fundo(client: TestClient):
    resp = client.put("/api/channels/default/palco", json={"fundo": "aurora"})
    assert resp.status_code == 200
    assert resp.json()["fundo"] == "aurora"
    assert client.put("/api/channels/default/palco", json={"fundo": "neon"}).status_code == 422


def test_put_estilo_desconhecido_e_422(client: TestClient):
    resp = client.put("/api/channels/default/palco", json={"estilo": "neon"})
    assert resp.status_code == 422


def test_canal_inexistente_e_404(client: TestClient):
    assert client.get("/api/channels/nao-existe/palco").status_code == 404
    assert client.put("/api/channels/nao-existe/palco", json={}).status_code == 404


def test_imagem_padrao_e_o_mascote(client: TestClient):
    resp = client.get("/api/channels/default/palco/imagem")
    assert resp.status_code == 200
    assert resp.content == b"POSE"


def test_enviar_e_remover_a_imagem_do_cabecalho(client: TestClient, tmp_path: Path):
    resp = client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.png", b"MINHA", "image/png")},
    )
    assert resp.status_code == 200
    assert resp.json()["cabecalho"]["imagem"] == "cabecalho.png"
    assert client.get("/api/channels/default/palco/imagem").content == b"MINHA"
    assert (tmp_path / "renderer" / "public" / "palco" / "cabecalho.png").read_bytes() == b"MINHA"

    resp = client.delete("/api/channels/default/palco/imagem")
    assert resp.status_code == 200
    assert resp.json()["cabecalho"]["imagem"] == ""
    assert client.get("/api/channels/default/palco/imagem").content == b"POSE"


def test_imagem_em_formato_recusado_e_400(client: TestClient):
    resp = client.post(
        "/api/channels/default/palco/imagem",
        files={"arquivo": ("logo.gif", b"GIF", "image/gif")},
    )
    assert resp.status_code == 400
