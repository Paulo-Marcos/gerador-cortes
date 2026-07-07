"""Testes de integração do endpoint de skills editoriais por canal (E-021).

Monta só o router numa app FastAPI nova e isola o estado (banco + editorial +
channel_id) num `tmp_path`, apontando os resolvedores de `channel_paths` para lá.
Cobre GET (lista as 5 com default+atual), PUT (edita e reflete) e reset.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app import editorial_skills
from app.routers import editorial_skills as router_mod
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path, monkeypatch) -> TestClient:
    canal = tmp_path / "canal-teste"
    (canal / "editorial").mkdir(parents=True)
    monkeypatch.setattr(
        editorial_skills.channel_paths, "settings_db_path", lambda: tmp_path / "settings.db"
    )
    monkeypatch.setattr(editorial_skills.channel_paths, "active_channel_root", lambda: canal)
    monkeypatch.setattr(editorial_skills, "editorial_dir", lambda: canal / "editorial")
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/editorial-skills")
    return TestClient(app)


def test_get_lista_as_cinco_com_default_e_atual(client: TestClient):
    resp = client.get("/editorial-skills")
    assert resp.status_code == 200
    skills = resp.json()["skills"]
    assert [s["key"] for s in skills] == [
        "cortador-expert",
        "trechos-expert",
        "cenas-expert",
        "metadados-expert",
        "thumbnail-prompt-expert",
    ]
    cortador = skills[0]
    assert set(cortador["params"]) == {"modelo", "thinking_tokens", "timeout"}
    assert "corpo_default" in cortador and "params_default" in cortador
    assert cortador["descricao"]  # explicação funcional presente


def test_put_edita_corpo_e_params_e_reflete(client: TestClient):
    payload = {
        "corpo": "NOVO CORPO DO CANAL",
        "params": {"modelo": "haiku", "thinking_tokens": 4000, "timeout": 90.0},
    }
    resp = client.put("/editorial-skills/cortador-expert", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["corpo"] == "NOVO CORPO DO CANAL"
    assert body["params"]["modelo"] == "haiku"

    # Releitura reflete o persistido.
    depois = client.get("/editorial-skills").json()["skills"][0]
    assert depois["corpo"] == "NOVO CORPO DO CANAL"
    assert depois["params"]["thinking_tokens"] == 4000


def test_put_lentes_por_canal(client: TestClient):
    resp = client.put(
        "/editorial-skills/cortador-expert", json={"lentes": ["Ângulo X", "Ângulo Y"]}
    )
    assert resp.status_code == 200
    assert resp.json()["lentes"] == ["Ângulo X", "Ângulo Y"]


def test_reset_corpo_volta_ao_default(client: TestClient):
    client.put("/editorial-skills/cortador-expert", json={"corpo": "CUSTOMIZADO"})
    resp = client.post("/editorial-skills/cortador-expert/reset", json={"campos": ["corpo"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["corpo"] == body["corpo_default"]
    assert body["corpo"] != "CUSTOMIZADO"


def test_skill_desconhecida_da_404(client: TestClient):
    assert client.put("/editorial-skills/inexistente", json={"corpo": "x"}).status_code == 404


def test_reset_campo_invalido_da_422(client: TestClient):
    resp = client.post("/editorial-skills/cortador-expert/reset", json={"campos": ["xyz"]})
    assert resp.status_code == 422
