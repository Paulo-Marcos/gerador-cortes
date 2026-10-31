"""Apagar um corte proposto por mais de um motivo (D-1005).

Pela porta HTTP, como a tela apaga: `?motivo=` leva os slugs separados por "|",
o snapshot guarda a lista na ordem do vocabulário, e a telemetria do projeto
soma cada motivo marcado. Mesmo banco em memória da D-993.
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
from app.services.telemetria_cortes import TelemetriaCortesService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _corte(corte_id: str, numero: int) -> Corte:
    return Corte(
        id=corte_id,
        projeto_id="p1",
        numero=numero,
        inicio_seg=0.0,
        fim_seg=60.0,
        status=StatusCorte.PROPOSTO,
    )


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
        # c1 e c2: propostos pela IA (têm snapshot); c3: criado na mão.
        for numero, corte_id in enumerate(("c1", "c2", "c3"), start=1):
            db.add(_corte(corte_id, numero))
        for corte_id in ("c1", "c2"):
            db.add(CorteSnapshot(id=f"s-{corte_id}", corte_id=corte_id, projeto_id="p1"))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    monkeypatch.setattr("app.services.corte.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


async def _snapshot(fabrica, corte_id: str) -> CorteSnapshot | None:
    async with fabrica() as db:
        return (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == corte_id))
        ).scalar_one_or_none()


async def _corte_existe(fabrica, corte_id: str) -> bool:
    async with fabrica() as db:
        return await db.get(Corte, corte_id) is not None


@pytest.mark.asyncio
async def test_apagar_com_dois_motivos_guarda_os_dois(cliente, fabrica):
    resposta = cliente.delete("/api/cortes/c1", params={"motivo": "repetido|tema_fraco"})

    assert resposta.status_code == 200
    assert not await _corte_existe(fabrica, "c1")
    assert (await _snapshot(fabrica, "c1")).motivo_apagado == "tema_fraco|repetido"


@pytest.mark.asyncio
async def test_slug_desconhecido_sai_da_lista_e_o_apagar_segue(cliente, fabrica):
    resposta = cliente.delete("/api/cortes/c1", params={"motivo": "slug_velho|curto_demais"})

    assert resposta.status_code == 200
    assert (await _snapshot(fabrica, "c1")).motivo_apagado == "curto_demais"


@pytest.mark.asyncio
async def test_telemetria_soma_cada_motivo_marcado_e_le_o_registro_antigo(cliente, fabrica):
    cliente.delete("/api/cortes/c1", params={"motivo": "repetido|tema_fraco"})
    cliente.delete("/api/cortes/c2")
    # Registro gravado antes da D-1005: um motivo só, no mesmo campo.
    async with fabrica() as db:
        snapshot = await db.get(CorteSnapshot, "s-c2")
        snapshot.motivo_apagado = "repetido"
        await db.commit()

    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    apagados = telemetria["apagados"]
    assert apagados["total"] == 2
    assert apagados["por_motivo"]["repetido"] == 2
    assert apagados["por_motivo"]["tema_fraco"] == 1
    assert apagados["por_motivo"]["sem_motivo"] == 0
