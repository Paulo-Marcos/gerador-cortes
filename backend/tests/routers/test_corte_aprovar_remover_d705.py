"""Aprovar e remover um corte, pela porta HTTP (D-705).

Teste de caracterização, antes de as duas regras saírem do router para o
`CorteService`. Aprovar é um pedido do operador e segue o ciclo do corte
(RN-04); remover apaga a linha e a pasta do corte no disco. Troca só as bordas:
banco em memória (toda sessão do app é desviada para ele) e a pasta dos
projetos. As referências que o movimento troca ficam no topo.
"""

from __future__ import annotations

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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Onde a remoção lê a pasta dos projetos.
_PROJETOS_DIR_LIDO_EM = ["app.services.corte"]


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
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


async def _cortes(fabrica) -> list[Corte]:
    async with fabrica() as db:
        return (await db.execute(select(Corte))).scalars().all()


@pytest.mark.asyncio
async def test_aprovar_um_corte_proposto(cliente, fabrica):
    resposta = cliente.post("/api/cortes/c1/aprovar")

    assert resposta.json() == {"message": "Corte aprovado", "corte_id": "c1"}
    (corte,) = await _cortes(fabrica)
    assert corte.status == StatusCorte.APROVADO


@pytest.mark.asyncio
async def test_aprovar_fora_do_ciclo_da_400_e_nao_muda_nada(cliente, fabrica):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).status = StatusCorte.PROCESSADO
        await db.commit()

    resposta = cliente.post("/api/cortes/c1/aprovar")

    assert resposta.status_code == 400
    assert "processado" in resposta.json()["detail"]
    (corte,) = await _cortes(fabrica)
    assert corte.status == StatusCorte.PROCESSADO


def test_aprovar_corte_inexistente_da_404(cliente):
    resposta = cliente.post("/api/cortes/nao-tem/aprovar")

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Corte não encontrado")


@pytest.mark.asyncio
async def test_remover_apaga_o_corte_e_a_pasta_dele(cliente, fabrica, tmp_path):
    pasta = tmp_path / "p1" / "cortes" / "c1"
    (pasta / "bruto").mkdir(parents=True)
    (pasta / "bruto" / "video.mp4").write_bytes(b"mp4")

    resposta = cliente.delete("/api/cortes/c1")

    assert resposta.json() == {"message": "Corte deletado com sucesso", "corte_id": "c1"}
    assert await _cortes(fabrica) == []
    assert not pasta.exists()


@pytest.mark.asyncio
async def test_remover_corte_sem_pasta_so_apaga_a_linha(cliente, fabrica):
    resposta = cliente.delete("/api/cortes/c1")

    assert resposta.status_code == 200
    assert await _cortes(fabrica) == []


def test_remover_corte_inexistente_da_404(cliente):
    resposta = cliente.delete("/api/cortes/nao-tem")

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Corte não encontrado")
