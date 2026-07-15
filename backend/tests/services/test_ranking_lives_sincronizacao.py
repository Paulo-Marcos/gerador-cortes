"""D-373: candidata PENDENTE cujo vídeo já virou Projeto por outra via (ex.:
"novo projeto" colando a URL manualmente, sem passar pelo endpoint
`/ranking-lives/{id}/enfileirar") não pode continuar aparecendo no ranking.

`_sincronizar_promovidas_por_projeto` casa `LiveCandidata.video_id` contra
`Projeto.youtube_url` e promove a candidata órfã antes de qualquer leitura
que a UI consome.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.models import Base, LiveCandidata, Projeto, StatusLiveCandidata, StatusProjeto
from app.services import ranking_lives
from sqlalchemy import select
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
    monkeypatch.setattr(ranking_lives, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


def _candidata(video_id: str) -> LiveCandidata:
    return LiveCandidata(
        id=f"cand-{video_id}",
        video_id=video_id,
        titulo="Live de teste",
        status=StatusLiveCandidata.PENDENTE,
    )


def _projeto(projeto_id: str, video_id: str) -> Projeto:
    return Projeto(
        id=projeto_id,
        youtube_url=f"https://www.youtube.com/watch?v={video_id}",
        canal_origem="Canal",
        status=StatusProjeto.PENDENTE,
    )


@pytest.mark.asyncio
async def test_promove_candidata_orfa_com_projeto_ja_existente(session_factory):
    async with session_factory() as db:
        db.add(_candidata("abc123"))
        db.add(_projeto("proj-1", "abc123"))
        await db.commit()

    async with session_factory() as db:
        await ranking_lives._sincronizar_promovidas_por_projeto(db)

    async with session_factory() as db:
        res = await db.execute(select(LiveCandidata).where(LiveCandidata.video_id == "abc123"))
        candidata = res.scalar_one()
        assert candidata.status == StatusLiveCandidata.PROMOVIDA
        assert candidata.projeto_id == "proj-1"


@pytest.mark.asyncio
async def test_nao_mexe_em_candidata_sem_projeto_correspondente(session_factory):
    async with session_factory() as db:
        db.add(_candidata("sem-projeto"))
        await db.commit()

    async with session_factory() as db:
        await ranking_lives._sincronizar_promovidas_por_projeto(db)

    async with session_factory() as db:
        res = await db.execute(select(LiveCandidata).where(LiveCandidata.video_id == "sem-projeto"))
        candidata = res.scalar_one()
        assert candidata.status == StatusLiveCandidata.PENDENTE
        assert candidata.projeto_id is None
