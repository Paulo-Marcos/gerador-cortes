"""D-172: `arquivo_video_path` e `arquivo_short_path` relativos ao projeto.

Follow-up da D-158. Cobre:
- (a) `migration_003` reescreve os legados absolutos (Windows-antigo, Docker) das
  colunas `projetos.arquivo_video_path` e `shorts.arquivo_short_path` para o
  sub-caminho relativo ao projeto, preservando valores já-relativos, e é idempotente;
- (b) a ESCRITA (`IngestaoService._salvar_transcricao`) passa a persistir relativo.
"""

import pytest
import pytest_asyncio
from app import channel_paths
from app.migrations import migration_003_paths_video_short
from app.models import Base, Corte, Projeto, Short
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


# --------------------------------------------------------------------------- #
# (a) migração — reescreve legados das duas colunas e é idempotente
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_migration_003_reescreve_e_idempotente(engine):
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sf() as db:
        # Projeto com vídeo em caminho absoluto Windows-antigo.
        db.add(
            Projeto(
                id="proj-1",
                youtube_url="http://x",
                transcricao_raw="[]",
                arquivo_video_path=r"C:\old\backend\projetos\proj-1\video.mkv",
            )
        )
        # Projeto já-relativo: no-op.
        db.add(
            Projeto(
                id="proj-2",
                youtube_url="http://y",
                transcricao_raw="[]",
                arquivo_video_path="video.webm",
            )
        )
        db.add(Corte(id="corte-1", projeto_id="proj-1", numero=1))
        # Short com caminho Docker.
        db.add(
            Short(
                id="short-1",
                corte_id="corte-1",
                numero=1,
                arquivo_short_path="/app/projetos/proj-1/shorts/short-1/short_final.mp4",
            )
        )
        await db.commit()

    async with engine.begin() as conn:
        await migration_003_paths_video_short.upgrade(conn)

    async with sf() as db:
        p1 = await db.get(Projeto, "proj-1")
        p2 = await db.get(Projeto, "proj-2")
        s1 = await db.get(Short, "short-1")
        assert p1.arquivo_video_path == "video.mkv"
        assert p2.arquivo_video_path == "video.webm"
        assert s1.arquivo_short_path == "shorts/short-1/short_final.mp4"

    # Segunda passagem não altera mais nada (idempotência).
    async with engine.begin() as conn:
        await migration_003_paths_video_short.upgrade(conn)

    async with sf() as db:
        p1 = await db.get(Projeto, "proj-1")
        s1 = await db.get(Short, "short-1")
        assert p1.arquivo_video_path == "video.mkv"
        assert s1.arquivo_short_path == "shorts/short-1/short_final.mp4"


# --------------------------------------------------------------------------- #
# (b) escrita — _salvar_transcricao persiste relativo
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_salvar_transcricao_persiste_video_relativo(tmp_path, monkeypatch):
    from app.services import ingestao as ingestao_module

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with sf() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        await db.commit()

    monkeypatch.setattr(ingestao_module, "AsyncSessionLocal", sf)

    # Caminho absoluto sob a raiz de dados vigente (como o downloader entrega hoje).
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    video_abs = str(tmp_path / "proj-1" / "video.mkv")

    await ingestao_module.IngestaoService._salvar_transcricao(
        "proj-1", [{"start": 0.0, "end": 1.0, "texto": "oi"}], video_abs
    )

    async with sf() as db:
        projeto = await db.get(Projeto, "proj-1")
        assert projeto.arquivo_video_path == "video.mkv"

    await engine.dispose()
