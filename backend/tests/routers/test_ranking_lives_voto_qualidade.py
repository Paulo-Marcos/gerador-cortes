"""D-372: voto manual (1-5) de qualidade da live, comparável à `pontuacao_ranking`.

Endpoints montados em `routers/ranking_lives.py` (não em `routers/projetos.py`,
travado por `f024-pos-layout-youtube`) — ver comentário no router. Banco em
memória real (SQLite), monta só este router numa app FastAPI nova.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.models import Base, Projeto, StatusProjeto
from app.routers import ranking_lives as router_mod
from app.services import ranking_lives as service_mod
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(service_mod, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest.fixture()
def client(session_factory) -> TestClient:
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/api/ranking-lives")
    return TestClient(app)


@pytest_asyncio.fixture
async def projeto_com_ranking(session_factory) -> str:
    async with session_factory() as db:
        projeto = Projeto(
            id="proj-1",
            youtube_url="https://www.youtube.com/watch?v=abc123",
            canal_origem="Canal",
            status=StatusProjeto.PRONTO,
            pontuacao_ranking=72.5,
        )
        db.add(projeto)
        await db.commit()
    return "proj-1"


def test_obter_voto_antes_de_votar_vem_nulo(client: TestClient, projeto_com_ranking: str):
    resp = client.get(f"/api/ranking-lives/projetos/{projeto_com_ranking}/voto-qualidade")
    assert resp.status_code == 200
    body = resp.json()
    assert body["voto_qualidade_live"] is None
    assert body["pontuacao_ranking"] == 72.5


def test_salvar_voto_reflete_na_leitura(client: TestClient, projeto_com_ranking: str):
    resp = client.put(
        f"/api/ranking-lives/projetos/{projeto_com_ranking}/voto-qualidade", json={"voto": 4}
    )
    assert resp.status_code == 200
    assert resp.json()["voto_qualidade_live"] == 4

    depois = client.get(f"/api/ranking-lives/projetos/{projeto_com_ranking}/voto-qualidade")
    assert depois.json()["voto_qualidade_live"] == 4


@pytest.mark.parametrize("voto", [0, 6, -1])
def test_voto_fora_da_faixa_1_a_5_da_422(client: TestClient, projeto_com_ranking: str, voto: int):
    resp = client.put(
        f"/api/ranking-lives/projetos/{projeto_com_ranking}/voto-qualidade", json={"voto": voto}
    )
    assert resp.status_code == 422


def test_projeto_inexistente_da_404(client: TestClient):
    assert client.get("/api/ranking-lives/projetos/nao-existe/voto-qualidade").status_code == 404
    assert (
        client.put(
            "/api/ranking-lives/projetos/nao-existe/voto-qualidade", json={"voto": 3}
        ).status_code
        == 404
    )
