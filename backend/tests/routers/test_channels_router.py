"""Testes de integração dos endpoints de canais (D-153).

Monta APENAS o router de canais numa app FastAPI nova (sem o lifespan real, que
abriria banco/migraria layout) e redireciona a raiz do repositório do serviço
para um `tmp_path` — assim os endpoints exercitam o filesystem de uma instância
isolada, sem tocar o `instance/` real.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.routers import channels as channels_router
from app.services import channels as svc
from fastapi import FastAPI
from fastapi.testclient import TestClient

EXEMPLO_YAML = """config_version: 1
handle: "@seucanal"
nome: "Seu Canal"
credito: "@seucanal"
paleta:
  primaria: "#1a1a2e"
  secundaria: "#16213e"
  acento: "#0f3460"
"""


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    # Redireciona a ancoragem do serviço para o tmp: _instance_root e _exemplo_dir
    # derivam de _REPO_ROOT, então ambos passam a apontar para a instância isolada.
    monkeypatch.setattr(svc, "_REPO_ROOT", tmp_path)

    canal = tmp_path / "instance" / "channels" / "default"
    canal.mkdir(parents=True)
    (canal / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")
    (tmp_path / "instance" / "active-channel").write_text("default\n", encoding="utf-8")

    exemplo = tmp_path / "examples" / "instance.example"
    (exemplo / "editorial").mkdir(parents=True)
    (exemplo / "channel.yaml").write_text(EXEMPLO_YAML, encoding="utf-8")

    app = FastAPI()
    app.include_router(channels_router.router, prefix="/api/channels")
    return TestClient(app)


def test_get_lista_com_ativo(client):
    resp = client.get("/api/channels")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ativo"] == "default"
    assert len(body["canais"]) == 1
    assert body["canais"][0]["id"] == "default"
    assert body["canais"][0]["ativo"] is True


def test_post_cria_canal(client):
    resp = client.post("/api/channels", json={"id": "segundo", "nome": "Segundo"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == "segundo"
    assert body["nome"] == "Segundo"
    assert body["ativo"] is False
    # Aparece na listagem sem virar o ativo.
    lista = client.get("/api/channels").json()
    assert {c["id"] for c in lista["canais"]} == {"default", "segundo"}
    assert lista["ativo"] == "default"


def test_post_id_duplicado_409(client):
    resp = client.post("/api/channels", json={"id": "default"})
    assert resp.status_code == 409


def test_post_id_invalido_422(client):
    resp = client.post("/api/channels", json={"id": "Com Espaco"})
    assert resp.status_code == 422


def test_select_grava_e_requer_restart(client):
    client.post("/api/channels", json={"id": "segundo"})
    resp = client.post("/api/channels/segundo/select")
    assert resp.status_code == 200
    assert resp.json() == {"canal_id": "segundo", "requer_restart": True}
    assert client.get("/api/channels").json()["ativo"] == "segundo"


def test_select_inexistente_404(client):
    resp = client.post("/api/channels/fantasma/select")
    assert resp.status_code == 404


def test_patch_edita_identidade(client):
    resp = client.patch("/api/channels/default", json={"nome": "Renomeado"})
    assert resp.status_code == 200
    assert resp.json()["nome"] == "Renomeado"
    # Persistiu.
    assert client.get("/api/channels").json()["canais"][0]["nome"] == "Renomeado"


def test_patch_inexistente_404(client):
    resp = client.patch("/api/channels/fantasma", json={"nome": "x"})
    assert resp.status_code == 404
