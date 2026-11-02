"""D-1015: as rotas do boletim só repassam o estado do serviço — sem esperar a medição."""

from __future__ import annotations

import pytest
from app.domain.compartilhado.erros import NaoEncontrado
from app.routers import boletim_tecnico as rota
from app.routers.errors import registrar_tratadores
from app.services import boletim_tecnico as servico
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def cliente():
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota.router, prefix="/api/boletim-tecnico")
    return TestClient(app)


def test_medindo_e_arquivo_ausente_voltam_sem_campos_de_medida(cliente, monkeypatch):
    async def falso(tipo, alvo_id, *, remedir=False):
        return {"estado": "medindo" if tipo == "corte" else "arquivo_ausente"}

    monkeypatch.setattr(servico, "consultar", falso)
    assert cliente.get("/api/boletim-tecnico/corte/c1").json() == {"estado": "medindo"}
    assert cliente.get("/api/boletim-tecnico/short/s1").json() == {"estado": "arquivo_ausente"}


def test_pronto_traz_volume_paradas_com_origem_e_emendas(cliente, monkeypatch):
    pronto = {
        "estado": "pronto",
        "medido_em": "2026-11-02T10:00:00+00:00",
        "volume": {"integrado_lufs": -14.2, "pico_dbtp": -1.2, "lra_lu": 4.0, "avisos": []},
        "paradas": [{"inicio_seg": 3.0, "duracao_seg": 0.5, "origem": "live"}],
        "emendas": {
            "total": 2,
            "com_som_dos_dois_lados": 1,
            "acima_do_p99": 1,
            "p99_da_fala": 0.04,
            "itens": [
                {
                    "tempo_seg": 5.0,
                    "com_som_dos_dois_lados": True,
                    "degrau": 0.2,
                    "acima_do_p99": True,
                },
                {
                    "tempo_seg": 9.0,
                    "com_som_dos_dois_lados": False,
                    "degrau": None,
                    "acima_do_p99": False,
                },
            ],
        },
    }

    async def falso(tipo, alvo_id, *, remedir=False):
        return pronto

    monkeypatch.setattr(servico, "consultar", falso)
    corpo = cliente.get("/api/boletim-tecnico/corte/c1").json()
    assert corpo["paradas"][0]["origem"] == "live"
    assert corpo["emendas"]["acima_do_p99"] == 1


def test_remedir_pede_a_medicao_de_novo(cliente, monkeypatch):
    pedidos = []

    async def falso(tipo, alvo_id, *, remedir=False):
        pedidos.append((tipo, alvo_id, remedir))
        return {"estado": "medindo"}

    monkeypatch.setattr(servico, "consultar", falso)
    cliente.post("/api/boletim-tecnico/corte/c1/remedir")
    cliente.post("/api/boletim-tecnico/short/s1/remedir")
    assert pedidos == [("corte", "c1", True), ("short", "s1", True)]


def test_corte_inexistente_responde_404(cliente, monkeypatch):
    async def falso(tipo, alvo_id, *, remedir=False):
        raise NaoEncontrado("Corte não encontrado.")

    monkeypatch.setattr(servico, "consultar", falso)
    assert cliente.get("/api/boletim-tecnico/corte/zz").status_code == 404
