"""O que o fim do render diz quando o vídeo final não foi refeito (D-1057).

`done` é o que leva a tela à Revisão, então só vale para o render que publicou o
`video.mp4`. O arquivo no disco não prova nada: num render parcial ele continua
sendo o anterior, e depois de um reinício do backend não se sabe mais o que houve.
"""

from __future__ import annotations

import asyncio
import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.services.jobs_globais import JobsGlobais
from app.services.render import remotion_render, situacao_do_render
from app.services.render.render_progress import RenderProgressStore
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

CORTE_ID = "c1"


@pytest.fixture(autouse=True)
def _progresso_limpo():
    RenderProgressStore._progress.pop(CORTE_ID, None)
    yield
    RenderProgressStore._progress.pop(CORTE_ID, None)


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
    yield
    await engine.dispose()


async def _renderizar(monkeypatch, parar_em: str | None) -> None:
    async def pipeline_falso(_corte_id, **_opcoes):
        return {"status": "ok"}

    monkeypatch.setattr(remotion_render, "renderizar_pipeline_otimizado", pipeline_falso)
    tarefa = remotion_render.RemotionRenderService.iniciar_render_background(
        CORTE_ID, filtro="f", parar_em=parar_em
    )
    await tarefa
    # O desfecho é gravado no `add_done_callback`, que roda depois do `await`.
    await asyncio.sleep(0)


@pytest.mark.asyncio
@pytest.mark.parametrize("parar_em", ["grade", "overlays"])
async def test_render_que_parou_antes_do_video_nao_termina_em_done(monkeypatch, parar_em):
    await _renderizar(monkeypatch, parar_em)

    progresso = RenderProgressStore.get(CORTE_ID).to_dict()

    assert (progresso["state"], progresso["running"]) == ("parcial", False)
    assert parar_em in progresso["stage"]


@pytest.mark.asyncio
@pytest.mark.parametrize("parar_em", [None, "render_final"])
async def test_render_que_foi_ate_o_video_termina_em_done(monkeypatch, parar_em):
    await _renderizar(monkeypatch, parar_em)

    assert RenderProgressStore.get(CORTE_ID).state == "done"


@pytest.mark.asyncio
async def test_a_situacao_do_render_parcial_nao_vira_done_pelo_video_antigo(
    corte_com_video_antigo,
):
    RenderProgressStore.start(CORTE_ID)
    RenderProgressStore.parcial(CORTE_ID, "Render parcial concluído (parou em grade)")

    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert situacao["fases"]["encode"] is True
    assert (situacao["state"], situacao["running"]) == ("parcial", False)
    assert situacao["stage"] == "Render parcial concluído (parou em grade)"


@pytest.mark.asyncio
async def test_depois_de_reiniciar_o_video_antigo_nao_vira_render_concluido(
    corte_com_video_antigo,
):
    """O progresso mora em memória: o reinício o apaga e a tarefa morre junto."""
    RenderProgressStore.start(CORTE_ID)
    RenderProgressStore._progress.clear()

    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert situacao["fases"]["encode"] is True
    assert (situacao["state"], situacao["running"]) == ("idle", False)


@pytest.mark.asyncio
async def test_render_concluido_de_verdade_segue_done_com_o_video_no_disco(
    corte_com_video_antigo,
):
    RenderProgressStore.start(CORTE_ID)
    RenderProgressStore.done(CORTE_ID)

    situacao = await situacao_do_render.situacao_do_pipeline(CORTE_ID)

    assert situacao["state"] == "done"


def test_render_parcial_aparece_como_concluido_na_fila_global():
    JobsGlobais.resetar()
    RenderProgressStore.start(CORTE_ID)
    JobsGlobais.coletar(agora=1_000.0)
    RenderProgressStore.parcial(CORTE_ID, "Render parcial concluído (parou em grade)")

    jobs = {job.id: job for job in JobsGlobais.coletar(agora=1_001.0)}
    JobsGlobais.resetar()

    job = jobs[f"render:{CORTE_ID}"]
    assert job.estado == "concluido"
    assert job.etapa == "Render parcial concluído (parou em grade)"
