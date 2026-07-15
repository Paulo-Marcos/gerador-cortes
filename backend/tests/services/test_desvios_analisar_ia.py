"""D-376: `analisar_ia` não pode devolver "sucesso, 0 trechos" quando a IA
nunca rodou de fato (ex.: GEMINI_API_KEY inválida) — isso mascarava o erro e
fazia a criação manual de corte parecer travada/silenciosamente vazia.
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from app.infrastructure import gemini_client
from app.models import Base, Corte, Projeto
from app.services import corte as corte_service_module
from app.services import desvios as desvios_module
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
    monkeypatch.setattr(desvios_module, "AsyncSessionLocal", factory)
    monkeypatch.setattr(corte_service_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


async def _seed_corte(session_factory, transcricao: list) -> str:
    async with session_factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="https://www.youtube.com/watch?v=abc"))
        db.add(
            Corte(
                id="corte-1",
                projeto_id="proj-1",
                numero=1,
                inicio_seg=300.0,
                fim_seg=320.0,
                transcricao_corte=json.dumps(transcricao, ensure_ascii=False),
            )
        )
        await db.commit()
    return "corte-1"


@pytest.mark.asyncio
async def test_analisar_ia_levanta_erro_quando_todas_as_partes_falham(session_factory, monkeypatch):
    corte_id = await _seed_corte(
        session_factory, [{"start": 300.0, "end": 302.0, "texto": "ola mundo"}]
    )

    async def _falha(*args, **kwargs):
        raise RuntimeError("400 INVALID_ARGUMENT: API key not valid")

    monkeypatch.setattr(gemini_client, "generate_json", _falha)

    with pytest.raises(RuntimeError, match="API key not valid"):
        await desvios_module.DesviosService.analisar_ia(corte_id)

    # Nao deve ter alterado os desvios do corte (falha real, nao "0 trechos").
    async with session_factory() as db:
        corte = await db.get(Corte, corte_id)
        assert json.loads(corte.desvios) == []


@pytest.mark.asyncio
async def test_analisar_ia_importa_trechos_quando_gemini_responde(session_factory, monkeypatch):
    corte_id = await _seed_corte(
        session_factory, [{"start": 300.0, "end": 302.0, "texto": "ola mundo"}]
    )

    async def _ok(*args, **kwargs):
        return {
            "trechos": [
                {
                    "inicio_hms": "00:05:00",
                    "fim_hms": "00:05:01",
                    "tipo": "DESVIO",
                    "motivo": "teste",
                }
            ]
        }

    monkeypatch.setattr(gemini_client, "generate_json", _ok)

    corte = await desvios_module.DesviosService.analisar_ia(corte_id)

    desvios = json.loads(corte.desvios)
    assert len(desvios) == 1
    assert desvios[0]["origem"] == "gemini"
