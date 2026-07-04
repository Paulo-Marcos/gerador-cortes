"""D-179: mascote opcional — tolerancia a mascote desabilitado / catalogo ausente,
e consolidacao do catalogo de poses para `<canal>/mascot/poses.json`.

Cobre o criterio de NAO-QUEBRA da Onda C1:
  - `mascot_catalog` degrada para catalogo vazio (sem excecao) quando o mascote esta
    desabilitado OU quando nao ha `poses.json` (nem instance nem espelho versionado).
  - `/api/mascot/poses` responde 200 com lista vazia nesses casos (nao 500).
  - `consolidar_assets_do_canal` passa a mover `sapo_poses.json` -> `mascot/poses.json`
    (idempotente; no-op quando ausente).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.channel_layout_migration import consolidar_assets_do_canal
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
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Sem a env (default): o espelho versionado continua sendo servido (nao-regressao).
    monkeypatch.delenv("CANAL_MASCOTE_HABILITADO", raising=False)
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


# --------------------------------------------------------------------------- #
# Consolidacao do catalogo de poses (D-179)
# --------------------------------------------------------------------------- #


def _criar_instance_plano(instance: Path) -> None:
    instance.mkdir(parents=True, exist_ok=True)
    (instance / "channel.yaml").write_text(
        'handle: "@meucanal"\nnome: "Meu Canal"\n', encoding="utf-8"
    )
    (instance / "editorial").mkdir()
    (instance / "editorial" / "cortes.md").write_text("# cortes\n", encoding="utf-8")


def _criar_poses_no_repo(repo: Path) -> Path:
    data = repo / "backend" / "app" / "data"
    data.mkdir(parents=True)
    origem = data / "sapo_poses.json"
    origem.write_text('{"version": 1, "poses": [{"mood": "serio"}]}', encoding="utf-8")
    return origem


def test_consolida_move_poses_para_mascot_do_canal(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    origem = _criar_poses_no_repo(repo)

    resultado = consolidar_assets_do_canal(instance_root=instance, repo_root=repo)
    destino = resultado.canal_root / "mascot" / "poses.json"

    assert destino.is_file()
    assert '"serio"' in destino.read_text(encoding="utf-8")
    assert not origem.exists()  # origem legada esvaziada


def test_consolida_poses_e_idempotente(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    _criar_poses_no_repo(repo)

    consolidar_assets_do_canal(instance_root=instance, repo_root=repo)
    resultado2 = consolidar_assets_do_canal(instance_root=instance, repo_root=repo)

    # Segunda passagem: origem ausente -> no-op, destino intacto.
    assert resultado2.acao == "noop"
    assert (resultado2.canal_root / "mascot" / "poses.json").is_file()


def test_consolida_poses_noop_quando_origem_ausente(tmp_path: Path) -> None:
    instance = tmp_path / "instance"
    repo = tmp_path / "repo"
    _criar_instance_plano(instance)
    # repo sem backend/app/data/sapo_poses.json

    resultado = consolidar_assets_do_canal(instance_root=instance, repo_root=repo)

    # Sem origem, nada e criado no destino — puro no-op, sem excecao.
    assert not (resultado.canal_root / "mascot" / "poses.json").exists()
