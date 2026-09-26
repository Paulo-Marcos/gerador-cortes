"""Decidir um segmento detectado e validar as cenas, pela porta HTTP (D-705).

Teste de caracterização, antes de os dois casos de uso saírem do router de
cortes. Decidir um segmento muda o status dele e, quando aceito, põe uma região
no layout do YouTube (F-054); validar as cenas marca — ou desmarca — o roteiro
visual como conferido pelo editor. Troca só a borda do banco: toda sessão do
app vai para um banco em memória.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_SEGMENTOS = [
    {"inicio": 10.0, "fim": 20.0, "status": "sugerido"},
    {"inicio": 30.0, "fim": 45.0, "status": "sugerido"},
]


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
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
                segmentos_detectados=json.dumps(_SEGMENTOS),
                cenas_remotion=json.dumps({"cenas": [{"tipo": "ficha", "inicio": 1, "fim": 2}]}),
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica):
    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


# ─── Decidir segmento ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_aceitar_segmento_muda_o_status_e_poe_a_regiao_no_layout(cliente, fabrica):
    resposta = cliente.patch(
        "/api/cortes/c1/segmentos-detectados/1", json={"decisao": "compartilhada"}
    )

    corpo = resposta.json()
    assert corpo["id"] == "c1"
    corte = await _corte(fabrica)
    segmentos = json.loads(corte.segmentos_detectados)
    assert [s["status"] for s in segmentos] == ["sugerido", "aceito_compartilhada"]
    regioes = json.loads(corte.layout_youtube)["regioes"]
    assert [(r["inicio"], r["fim"], r["modo"]) for r in regioes] == [(30.0, 45.0, "compartilhada")]


@pytest.mark.asyncio
async def test_rejeitar_segmento_so_muda_o_status(cliente, fabrica):
    antes = (await _corte(fabrica)).layout_youtube

    cliente.patch("/api/cortes/c1/segmentos-detectados/0", json={"decisao": "rejeitar"})

    corte = await _corte(fabrica)
    assert json.loads(corte.segmentos_detectados)[0]["status"] == "rejeitado"
    assert corte.layout_youtube == antes


@pytest.mark.parametrize(
    ("indice", "decisao", "status"),
    [(0, "talvez", 400), (9, "full", 404)],
)
def test_decisao_invalida_ou_indice_fora_da_lista(cliente, indice, decisao, status):
    resposta = cliente.patch(
        f"/api/cortes/c1/segmentos-detectados/{indice}", json={"decisao": decisao}
    )

    assert resposta.status_code == status


@pytest.mark.asyncio
async def test_corte_sem_segmentos_detectados_da_400(cliente, fabrica):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).segmentos_detectados = "[]"
        await db.commit()

    resposta = cliente.patch("/api/cortes/c1/segmentos-detectados/0", json={"decisao": "full"})

    assert resposta.status_code == 400
    assert "rode a detecção" in resposta.json()["detail"]


def test_decidir_segmento_de_corte_inexistente_da_404(cliente):
    resposta = cliente.patch("/api/cortes/nao-tem/segmentos-detectados/0", json={"decisao": "full"})

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Corte não encontrado")


# ─── Validar cenas ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_validar_marca_as_cenas_e_desfazer_tira_a_marca(cliente, fabrica):
    corpo = cliente.post("/api/cortes/c1/cenas-remotion/validar").json()

    assert corpo["cenas_validadas"] == 1
    corte = await _corte(fabrica)
    assert (corte.cenas_validadas, corte.cenas_validadas_em is not None) == (1, True)

    cliente.post("/api/cortes/c1/cenas-remotion/validar", json={"validado": False})

    corte = await _corte(fabrica)
    assert (corte.cenas_validadas, corte.cenas_validadas_em) == (0, None)


@pytest.mark.asyncio
async def test_validar_sem_cenas_da_400(cliente, fabrica):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).cenas_remotion = "[]"
        await db.commit()

    resposta = cliente.post("/api/cortes/c1/cenas-remotion/validar")

    assert resposta.status_code == 400
    assert (await _corte(fabrica)).cenas_validadas == 0


def test_validar_cenas_de_corte_inexistente_da_404(cliente):
    resposta = cliente.post("/api/cortes/nao-tem/cenas-remotion/validar")

    assert resposta.status_code == 404
