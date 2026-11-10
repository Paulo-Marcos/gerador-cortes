"""D-1089 (P10): a rota "Voltar à borda da IA", do clique à resposta que a tela lê.

Banco em memória (toda sessão do app é desviada para ele).
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers import riscados as rota_riscados
from app.routers.errors import registrar_tratadores
from app.services.corte import CorteService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_MANUAL = {
    "inicio_hms": "00:00:30.000",
    "fim_hms": "00:00:31.000",
    "inicio_seg": 30.0,
    "fim_seg": 31.0,
    "motivo": "marcada à mão",
    "origem": "manual",
}
# Da rodada 1, com a borda arrastada de 12–15 s para 11–16 s.
_AJUSTADA = {
    "inicio_hms": "00:00:11.000",
    "fim_hms": "00:00:16.000",
    "inicio_seg": 11.0,
    "fim_seg": 16.0,
    "motivo": "repete",
    "categoria": "repeticao",
    "origem": "claude",
    "rodada": 1,
    "borda_da_rodada": [12.0, 15.0],
}


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:01:00",
                inicio_seg=0.0,
                fim_seg=60.0,
                desvios=json.dumps([_AJUSTADA, _MANUAL]),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def sincronizados(monkeypatch) -> list[str]:
    chamadas: list[str] = []

    async def _fake(corte_id, db=None):
        chamadas.append(corte_id)

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))
    return chamadas


@pytest.fixture
def cliente(fabrica):
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.include_router(rota_riscados.router, prefix="/api/cortes")
    return TestClient(app)


def test_a_tela_recebe_o_carimbo_para_distinguir_auto_de_manual(cliente):
    desvio = cliente.get("/api/cortes/c1").json()["desvios"][0]

    assert desvio["rodada"] == 1
    assert desvio["borda_da_rodada"] == [12.0, 15.0]


def test_voltar_devolve_a_borda_grava_e_poe_o_trecho_na_rodada(cliente, fabrica, sincronizados):
    assert cliente.get("/api/cortes/c1").json()["trechos_da_ultima_rodada"] == 0

    r = cliente.post("/api/cortes/c1/voltar-a-borda-da-ia", json={"desvio_index": 0})

    assert r.status_code == 200
    corpo = r.json()
    volta = corpo["desvios"][0]
    assert (volta["inicio_hms"], volta["fim_hms"]) == ("00:00:12.000", "00:00:15.000")
    assert corpo["desvios"][1]["motivo"] == "marcada à mão"
    assert corpo["trechos_da_ultima_rodada"] == 1
    # A transcrição final segue os desvios: é dela que leem cenas, avaliação e capa.
    assert sincronizados == ["c1"]
    gravado = cliente.get("/api/cortes/c1").json()["desvios"][0]
    assert (gravado["inicio_seg"], gravado["fim_seg"]) == (12.0, 15.0)


def test_voltar_e_desfazer_leva_o_trecho_e_deixa_a_marca_a_mao(cliente, sincronizados):
    cliente.post("/api/cortes/c1/voltar-a-borda-da-ia", json={"desvio_index": 0})

    corpo = cliente.post("/api/cortes/c1/desfazer-rodada").json()

    assert [d["origem"] for d in corpo["desvios"]] == ["manual"]
    assert [d["motivo"] for d in corpo["desvios_riscados"]] == ["repete"]


@pytest.mark.parametrize("indice", [1, 5])
def test_trecho_sem_carimbo_ou_que_nao_existe_e_400(cliente, sincronizados, indice):
    r = cliente.post("/api/cortes/c1/voltar-a-borda-da-ia", json={"desvio_index": indice})

    assert r.status_code == 400
    assert sincronizados == []
