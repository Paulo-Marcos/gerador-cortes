"""D-901: o preset de gancho padrão do canal — onde mora e como se muda.

A herança em si (o corte sem escolha usa o do canal) está em
`test_palco_shorts_d487.py::TestGanchoPadraoDoCanal`, ao lado da do corte.
"""

from __future__ import annotations

import json

import pytest_asyncio
from app.infrastructure import gancho_padrao_store
from app.models import Base, LayoutPreset
from app.routers import presets as rota_presets
from app.routers.errors import registrar_tratadores
from app.services import gancho_padrao_do_canal
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


class TestStore:
    def test_canal_novo_nao_tem_padrao(self, tmp_path):
        assert gancho_padrao_store.ler(tmp_path / "s.db", "meu") == ""

    def test_grava_por_canal_e_vazio_tira(self, tmp_path):
        banco = tmp_path / "s.db"
        gancho_padrao_store.gravar(banco, "meu", "g1")
        gancho_padrao_store.gravar(banco, "outro", "g2")

        assert gancho_padrao_store.ler(banco, "meu") == "g1"
        assert gancho_padrao_store.ler(banco, "outro") == "g2"

        gancho_padrao_store.gravar(banco, "meu", "")
        assert gancho_padrao_store.ler(banco, "meu") == ""


class TestEfetivo:
    def test_o_do_corte_vence_e_vazio_herda_o_do_canal(self, monkeypatch):
        monkeypatch.setattr(gancho_padrao_do_canal, "ler", lambda: "do-canal")

        assert gancho_padrao_do_canal.gancho_efetivo("do-corte") == "do-corte"
        assert gancho_padrao_do_canal.gancho_efetivo("") == "do-canal"


@pytest_asyncio.fixture
async def cliente(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with fabrica() as db:
        db.add(LayoutPreset(id="g1", nome="Amarelo", tipo="gancho_short", payload=json.dumps({})))
        db.add(LayoutPreset(id="p1", nome="Palco", tipo="palco_short", payload="{}"))
        await db.commit()

    async def get_db():
        async with fabrica() as db:
            yield db
            await db.commit()

    monkeypatch.setattr(gancho_padrao_do_canal, "AsyncSessionLocal", fabrica)
    monkeypatch.setattr(
        gancho_padrao_do_canal, "_banco_e_canal", lambda: (tmp_path / "settings.db", "meu")
    )
    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(rota_presets.router, prefix="/api/presets")
    app.dependency_overrides[rota_presets.get_db] = get_db
    yield TestClient(app)
    await engine.dispose()


URL = "/api/presets/gancho/padrao-do-canal"


class TestRotas:
    def test_escolher_e_ler_o_padrao_do_canal(self, cliente):
        assert cliente.get(URL).json() == {"preset_id": ""}

        assert cliente.put(URL, json={"preset_id": "g1"}).json() == {"preset_id": "g1"}
        assert cliente.get(URL).json() == {"preset_id": "g1"}

    def test_preset_que_nao_e_de_gancho_e_recusado(self, cliente):
        assert cliente.put(URL, json={"preset_id": "p1"}).status_code == 404
        assert cliente.get(URL).json() == {"preset_id": ""}

    def test_apagar_o_preset_do_canal_tira_o_padrao(self, cliente):
        cliente.put(URL, json={"preset_id": "g1"})

        assert cliente.delete("/api/presets/layout/g1").status_code == 204
        assert cliente.get(URL).json() == {"preset_id": ""}
