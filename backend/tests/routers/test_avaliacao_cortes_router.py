"""D-419: endpoints da avaliação de qualidade por corte.

Banco SQLite em memória real, montando só este router numa app FastAPI nova —
mesmo molde de `test_ranking_lives_voto_qualidade.py`.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, StatusProjeto
from app.routers import avaliacao_cortes as router_mod
from app.services import avaliacao_corte as service_mod
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
    app.include_router(router_mod.router, prefix="/api/avaliacao-cortes")
    return TestClient(app)


@pytest_asyncio.fixture
async def corte_id(session_factory) -> str:
    async with session_factory() as db:
        db.add(
            Projeto(
                id="proj-1",
                youtube_url="https://www.youtube.com/watch?v=abc123",
                canal_origem="Canal",
                status=StatusProjeto.PRONTO,
            )
        )
        db.add(
            Corte(
                id="corte-1",
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="Um corte",
                arquivo_clip_path="cortes/corte-1/clip_raw.mp4",
            )
        )
        await db.commit()
    return "corte-1"


def test_motivos_expoem_o_vocabulario_fechado(client: TestClient):
    body = client.get("/api/avaliacao-cortes/motivos").json()
    slugs = [motivo["slug"] for motivo in body["motivos"]]
    assert "borda_inicio" in slugs
    assert all(motivo["rotulo"] for motivo in body["motivos"])


def test_corte_nunca_avaliado_vem_com_voto_nulo(client: TestClient, corte_id: str):
    resp = client.get(f"/api/avaliacao-cortes/corte/{corte_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["voto"] is None
    assert body["motivos"] == []
    assert body["comentario"] == ""
    assert body["avaliado_em"] is None


def test_salvar_avaliacao_reflete_na_leitura(client: TestClient, corte_id: str):
    resp = client.put(
        f"/api/avaliacao-cortes/corte/{corte_id}",
        json={"voto": 2, "motivos": ["borda_fim", "contexto"], "comentario": "  cortou cedo  "},
    )
    assert resp.status_code == 200

    depois = client.get(f"/api/avaliacao-cortes/corte/{corte_id}").json()
    assert depois["voto"] == 2
    assert depois["motivos"] == ["borda_fim", "contexto"]
    assert depois["comentario"] == "cortou cedo"
    assert depois["avaliado_em"] is not None


def test_reavaliar_sobrescreve_a_nota_anterior(client: TestClient, corte_id: str):
    client.put(
        f"/api/avaliacao-cortes/corte/{corte_id}",
        json={"voto": 2, "motivos": ["borda_fim"], "comentario": "ruim"},
    )
    client.put(
        f"/api/avaliacao-cortes/corte/{corte_id}",
        json={"voto": 5, "motivos": [], "comentario": ""},
    )

    depois = client.get(f"/api/avaliacao-cortes/corte/{corte_id}").json()
    assert depois["voto"] == 5
    assert depois["motivos"] == []
    assert depois["comentario"] == ""


def test_motivo_desconhecido_nao_derruba_a_avaliacao(client: TestClient, corte_id: str):
    resp = client.put(
        f"/api/avaliacao-cortes/corte/{corte_id}",
        json={"voto": 3, "motivos": ["slug_inventado", "titulo"]},
    )
    assert resp.status_code == 200
    assert resp.json()["motivos"] == ["titulo"]


@pytest.mark.parametrize("voto", [0, 6, -1])
def test_voto_fora_da_faixa_da_422(client: TestClient, corte_id: str, voto: int):
    resp = client.put(f"/api/avaliacao-cortes/corte/{corte_id}", json={"voto": voto})
    assert resp.status_code == 422


def test_corte_inexistente_da_404(client: TestClient):
    assert client.get("/api/avaliacao-cortes/corte/nao-existe").status_code == 404
    assert client.put("/api/avaliacao-cortes/corte/nao-existe", json={"voto": 3}).status_code == 404
