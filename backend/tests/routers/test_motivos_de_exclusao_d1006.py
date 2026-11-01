"""D-1006: os motivos de excluir moram no settings.db, por canal, editáveis na tela.

Pela porta HTTP da tela de Canais, e depois pela do apagar: o motivo novo vale
no snapshot, o escondido é recusado ao apagar mas segue contado e nomeado na
telemetria. Banco do projeto em memória (fixtures da D-1005); canal e
settings.db numa pasta do teste.
"""

from __future__ import annotations

import pytest
from app.core import channel_paths
from app.routers import channels as channels_router
from app.routers.errors import registrar_tratadores
from app.services.telemetria_cortes import TelemetriaCortesService
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.routers import test_apagar_corte_varios_motivos_d1005 as d1005

# O banco do projeto e a porta do apagar são os da D-1005.
fabrica = d1005.fabrica
cliente = d1005.cliente
_snapshot = d1005._snapshot

ROTA = "/api/channels/ativo/motivos-de-exclusao"


@pytest.fixture
def canal(monkeypatch, tmp_path):
    ativo = {"nome": "canal-a"}
    monkeypatch.setattr(
        channel_paths, "active_channel_root", lambda: tmp_path / "channels" / ativo["nome"]
    )
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    return ativo


@pytest.fixture
def tela(canal):
    app = FastAPI()
    app.include_router(channels_router.router, prefix="/api/channels")
    registrar_tratadores(app)
    return TestClient(app)


def _slugs(resposta) -> list[tuple[str, bool]]:
    return [(m["slug"], m["ativo"]) for m in resposta.json()["motivos"]]


def test_canal_novo_mostra_os_seis_de_hoje(tela):
    resposta = tela.get(ROTA)

    assert resposta.status_code == 200
    assert resposta.json()["personalizado"] is False
    assert [m["rotulo"] for m in resposta.json()["motivos"]][:2] == [
        "Tema não rende",
        "Repete outro corte",
    ]
    assert len(resposta.json()["motivos"]) == 6


def test_acrescentar_e_esconder_ficam_gravados_so_no_canal(tela, canal):
    tela.post(ROTA, json={"rotulo": "Polêmico demais"})
    tela.put(f"{ROTA}/curto_demais", json={"ativo": False})

    resposta = tela.get(ROTA)
    assert resposta.json()["personalizado"] is True
    assert ("polemico_demais", True) in _slugs(resposta)
    assert ("curto_demais", False) in _slugs(resposta)

    canal["nome"] = "canal-b"
    assert tela.get(ROTA).json()["personalizado"] is False


def test_nome_repetido_da_400_e_slug_estranho_da_404(tela):
    assert tela.post(ROTA, json={"rotulo": "tema não RENDE"}).status_code == 400
    assert tela.put(f"{ROTA}/nao_existe", json={"ativo": False}).status_code == 404


@pytest.mark.asyncio
async def test_apagar_aceita_o_novo_e_recusa_o_escondido(tela, cliente, fabrica):
    tela.post(ROTA, json={"rotulo": "Polêmico"})
    tela.put(f"{ROTA}/repetido", json={"ativo": False})

    resposta = cliente.delete("/api/cortes/c1", params={"motivo": "repetido|polemico"})

    assert resposta.status_code == 200
    assert (await _snapshot(fabrica, "c1")).motivo_apagado == "polemico"


@pytest.mark.asyncio
async def test_telemetria_conta_e_nomeia_o_motivo_escondido(tela, cliente, fabrica):
    cliente.delete("/api/cortes/c1", params={"motivo": "repetido"})
    tela.put(f"{ROTA}/repetido", json={"ativo": False})

    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    assert telemetria["apagados"]["por_motivo"]["repetido"] == 1
    escondido = next(m for m in telemetria["motivos_apagado"] if m["slug"] == "repetido")
    assert escondido == {"slug": "repetido", "rotulo": "Repete outro corte", "ativo": False}
    origem = telemetria["mudancas_por_origem"][0]["apagados"]
    assert origem["por_motivo"]["repetido"] == 1
