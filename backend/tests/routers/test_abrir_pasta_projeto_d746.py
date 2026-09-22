"""D-746: "Abrir a pasta do projeto" ganha rota própria.

O botão da live chamava a rota do CORTE com o id do projeto — falhava sempre.
Banco SQLite em memória, só o router de projetos montado; a abertura no
sistema é trocada por um registro, para o teste não abrir janela nenhuma.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import pytest_asyncio
from app.database import get_db
from app.models import Base, Projeto, StatusProjeto
from app.routers import projetos as router_mod
from app.services import abrir_no_sistema
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        db.add(
            Projeto(
                id="proj-1",
                youtube_url="https://www.youtube.com/watch?v=abc123",
                canal_origem="Canal",
                status=StatusProjeto.PRONTO,
            )
        )
        await db.commit()
    yield factory
    await engine.dispose()


@pytest.fixture()
def abertas(monkeypatch, tmp_path) -> list[Path]:
    registro: list[Path] = []

    def falso(caminho: Path) -> str:
        registro.append(caminho)
        return str(caminho)

    monkeypatch.setattr(abrir_no_sistema, "abrir_pasta", falso)
    monkeypatch.setattr(router_mod, "projetos_dir", lambda: tmp_path)
    return registro


@pytest.fixture()
def client(session_factory) -> TestClient:
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/api/projetos")

    async def db_de_teste():
        async with session_factory() as db:
            yield db

    app.dependency_overrides[get_db] = db_de_teste
    return TestClient(app)


def test_abre_a_pasta_da_live(client, abertas, tmp_path):
    resposta = client.post("/api/projetos/proj-1/abrir-pasta")
    assert resposta.status_code == 200
    assert abertas == [tmp_path / "proj-1"]


def test_projeto_inexistente_devolve_404(client, abertas):
    resposta = client.post("/api/projetos/nao-existe/abrir-pasta")
    assert resposta.status_code == 404
    assert abertas == []


def test_sistema_que_recusa_vira_erro_com_motivo(client, monkeypatch):
    def recusa(_caminho: Path) -> str:
        raise abrir_no_sistema.NaoConsegueAbrir("sem explorador")

    monkeypatch.setattr(abrir_no_sistema, "abrir_pasta", recusa)
    resposta = client.post("/api/projetos/proj-1/abrir-pasta")
    assert resposta.status_code == 500
    assert "sem explorador" in resposta.json()["detail"]
