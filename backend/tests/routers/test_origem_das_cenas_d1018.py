"""D-1018: a rota da conferência devolve os avisos e não altera o corte."""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.routers import origem_das_cenas as rota
from app.routers.errors import registrar_tratadores
from app.services import origem_das_cenas as servico
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_CENAS = json.dumps(
    {"cenas": [{"tipo": "destaque_numerico", "numero": "50x", "inicio": 3.0, "fim": 8.0}]}
)


@pytest_asyncio.fixture
async def cliente(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        db.add(Corte(id="c1", projeto_id="p1", numero=1, status="proposto", cenas_remotion=_CENAS))
        await db.commit()
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota.router, prefix="/api/cortes")
    yield TestClient(app), f


@pytest.mark.asyncio
async def test_devolve_o_aviso_identificado_e_nao_altera_as_cenas(cliente):
    http, f = cliente
    resposta = http.get("/api/cortes/c1/cenas-remotion/conferencia")
    assert resposta.status_code == 200
    aviso = resposta.json()["avisos"][0]
    assert (aviso["tipo"], aviso["inicio"], aviso["codigo"]) == (
        "destaque_numerico",
        3.0,
        "sem_fonte",
    )
    async with f() as db:
        assert (await db.get(Corte, "c1")).cenas_remotion == _CENAS


@pytest.mark.asyncio
async def test_corte_inexistente_devolve_404(cliente):
    http, _ = cliente
    assert http.get("/api/cortes/nao-existe/cenas-remotion/conferencia").status_code == 404
