"""Testes de integração do endpoint de settings (D-191).

Monta apenas o router de settings numa app FastAPI nova e isola o armazenamento
num `tmp_path` via `set_settings_path_for_tests`. Cobre o novo bloco `render`
exposto na API (GET devolve, PUT persiste e reflete de volta).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.routers import settings as settings_router
from app.services.app_settings import AppSettingsService
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    app = FastAPI()
    app.include_router(settings_router.router, prefix="/settings")
    yield TestClient(app)
    AppSettingsService.set_settings_path_for_tests(None)


def test_get_inclui_bloco_render_com_defaults(client: TestClient):
    resp = client.get("/settings")
    assert resp.status_code == 200
    render = resp.json()["render"]
    assert render["overlay_concurrency"] == 4
    assert render["overlay_codec"] == "prores_4444"
    assert render["grade_global_quality"] == 30


def test_put_render_persiste_e_reflete(client: TestClient):
    payload = {
        "render": {
            "cooldown_sec": 8,
            "overlay_concurrency": 2,
            "bundle_cache_enabled": False,
            "overlay_codec": "vp9",
            "overlay_max_attempts": 5,
            "grade_global_quality": 27,
        }
    }
    resp = client.put("/settings", json=payload)
    assert resp.status_code == 200
    render = resp.json()["render"]
    assert render["cooldown_sec"] == 8
    assert render["overlay_codec"] == "vp9"

    # Releitura reflete o persistido.
    assert client.get("/settings").json()["render"]["overlay_max_attempts"] == 5
