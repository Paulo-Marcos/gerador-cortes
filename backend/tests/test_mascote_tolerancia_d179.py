"""D-179: mascote opcional — tolerancia a mascote desabilitado / catalogo ausente.

Cobre o criterio de NAO-QUEBRA da Onda C1:
  - `mascot_catalog` degrada para catalogo vazio (sem excecao) quando o mascote esta
    desabilitado OU quando nao ha `poses.json` (nem instance nem espelho versionado).
  - `/api/mascot/poses` responde 200 com lista vazia nesses casos (nao 500).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.services import mascot_catalog
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _limpar_cache_catalogo():
    """Cada teste comeca e termina com o cache do catalogo limpo."""
    mascot_catalog.recarregar()
    yield
    mascot_catalog.recarregar()


# --------------------------------------------------------------------------- #
# Tolerancia do servico
# --------------------------------------------------------------------------- #


def test_catalogo_vazio_quando_mascote_desabilitado(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CANAL_MASCOTE_HABILITADO", "false")
    mascot_catalog.recarregar()

    assert mascot_catalog.listar_poses() == []
    assert mascot_catalog.buscar_pose("pensativo") is None
    assert mascot_catalog.metadata()["total"] == 0


def test_catalogo_vazio_quando_arquivo_ausente(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Nem override da instancia nem espelho versionado existem.
    inexistente = tmp_path / "nao-existe" / "poses.json"
    monkeypatch.setattr(mascot_catalog, "_resolver_caminho", lambda: inexistente)
    mascot_catalog.recarregar()

    # Nao levanta FileNotFoundError; degrada para vazio.
    assert mascot_catalog.listar_poses() == []
    assert mascot_catalog.listar_poses(cena="tela_cheia") == []
    assert mascot_catalog.buscar_pose("serio") is None


def test_habilitado_por_padrao_serve_o_espelho_versionado(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Sem a env (default): o espelho continua sendo servido (nao-regressao).
    # O espelho foi des-versionado na publicacao (E-011): o teste cria o proprio
    # em tmp_path — depender do arquivo real so passa em maquina de canal.
    monkeypatch.delenv("CANAL_MASCOTE_HABILITADO", raising=False)
    espelho = tmp_path / "data"
    espelho.mkdir()
    (espelho / "mascote_poses.json").write_text(
        json.dumps({"version": 1, "poses": [{"id": "serio"}]}), encoding="utf-8"
    )
    monkeypatch.setattr(mascot_catalog, "_DATA_DIR", espelho)
    # Instancia sem override: garante que quem responde e o espelho.
    monkeypatch.setattr(mascot_catalog, "mascot_dir", lambda: tmp_path / "instance-vazia")
    mascot_catalog.recarregar()

    assert len(mascot_catalog.listar_poses()) > 0


# --------------------------------------------------------------------------- #
# Tolerancia do endpoint /api/mascot
# --------------------------------------------------------------------------- #


def test_endpoint_poses_nao_quebra_com_mascote_desabilitado(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CANAL_MASCOTE_HABILITADO", "false")
    mascot_catalog.recarregar()

    from app.routers import mascot as mascot_router

    app = _app_so_com_mascot(mascot_router)
    with TestClient(app) as client:
        resp = client.get("/api/mascot/poses")
        assert resp.status_code == 200
        assert resp.json()["poses"] == []

        # Pose individual inexistente continua sendo 404 limpo (nao 500).
        assert client.get("/api/mascot/poses/pensativo").status_code == 404


def _app_so_com_mascot(mascot_router):
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(mascot_router.router, prefix="/api/mascot")
    return app
