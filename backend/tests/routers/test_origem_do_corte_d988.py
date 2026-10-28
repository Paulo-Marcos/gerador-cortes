"""Quem propôs cada corte, na resposta da API (D-988).

A proposta congelada (`CorteSnapshot`, D-303) guarda o provider da análise que
criou o corte. A tela de cortes mostra esse dado num ícone para o operador
comparar a qualidade de cada IA. Corte sem snapshot foi criado na mão (ou é
anterior à telemetria): sai sem origem, e não como erro.
"""

from __future__ import annotations

import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# corte_id -> origem gravada no snapshot; None = corte sem snapshot.
_ORIGENS = {"c1": "claude", "c2": "gemini", "c3": "manual", "c4": None}


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
        for numero, (corte_id, origem) in enumerate(_ORIGENS.items(), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.PROPOSTO,
                )
            )
            if origem:
                db.add(CorteSnapshot(id=f"s{numero}", corte_id=corte_id, origem_analise=origem))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    monkeypatch.setattr("app.routers.cortes_helpers.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def test_lista_do_projeto_diz_quem_propos_cada_corte(cliente):
    resposta = cliente.get("/api/cortes/projeto/p1")

    assert resposta.status_code == 200
    assert {c["id"]: c["origem_analise"] for c in resposta.json()} == _ORIGENS


def test_corte_avulso_tambem_diz_quem_o_propos(cliente):
    assert cliente.get("/api/cortes/c2").json()["origem_analise"] == "gemini"
    assert cliente.get("/api/cortes/c4").json()["origem_analise"] is None
