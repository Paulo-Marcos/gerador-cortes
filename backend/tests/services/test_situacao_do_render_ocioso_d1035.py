"""A situação do render com o vídeo antigo no disco (D-1035).

O `video.mp4` do render anterior fica publicado durante o render novo. A tela só
conclui no `state == "done"` e não olha o arquivo, e o backend também não: o `done`
vem só do render que terminou neste processo (D-1057). Com o arquivo valendo como
`done`, o reinício no meio de um `Renderizar de novo` abria a Revisão com o vídeo
velho.
"""

from __future__ import annotations

import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.services.render import situacao_do_render
from app.services.render.render_progress import RenderProgressStore
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

CORTE_ID = "c1"


@pytest_asyncio.fixture
async def corte_com_video_antigo(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", fabrica)
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id=CORTE_ID,
                projeto_id="p1",
                numero=1,
                status=StatusCorte.PROPOSTO,
                inicio_seg=0.0,
                fim_seg=60.0,
            )
        )
        await db.commit()
    monkeypatch.setattr(situacao_do_render, "projetos_dir", lambda: tmp_path)
    video = tmp_path / "p1" / "cortes" / CORTE_ID / "upload_ready" / "video.mp4"
    video.parent.mkdir(parents=True)
    video.write_bytes(b"\0" * (2 * 1024 * 1024))
    RenderProgressStore._progress.pop(CORTE_ID, None)
    yield
    RenderProgressStore._progress.pop(CORTE_ID, None)
    await engine.dispose()


@pytest.mark.asyncio
async def test_ocioso_com_o_video_no_disco_responde_idle(corte_com_video_antigo):
    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert situacao["fases"]["encode"] is True
    assert (situacao["state"], situacao["running"]) == ("idle", False)


@pytest.mark.asyncio
async def test_render_novo_rodando_com_o_video_antigo_responde_running(corte_com_video_antigo):
    RenderProgressStore.start(CORTE_ID)

    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert situacao["fases"]["encode"] is True
    assert (situacao["state"], situacao["running"]) == ("running", True)


@pytest.mark.asyncio
async def test_cancelado_com_o_video_antigo_continua_cancelado(corte_com_video_antigo):
    RenderProgressStore.start(CORTE_ID)
    RenderProgressStore.cancelled(CORTE_ID)

    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert (situacao["state"], situacao["running"]) == ("cancelled", False)
