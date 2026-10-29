"""D-987: as redes do horizontal que a listagem entrega ao card da Biblioteca.

O domínio decide quando a rede acende (test_redes_do_projeto_d987); aqui o que
está em jogo é a POPULAÇÃO que a listagem monta — quais cortes entram no
denominador e qual coluna conta cada rede. É onde o sinal erra na prática: um
numerador fora da população acende a live inteira com corte ainda por subir.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, StatusCorte
from app.services import listagem_de_projetos
from app.services.listagem_de_projetos import listar_projetos
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def banco(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(listagem_de_projetos, "AsyncSessionLocal", f)
    monkeypatch.setattr(listagem_de_projetos, "projetos_dir", lambda: tmp_path)
    yield f, tmp_path
    await engine.dispose()


def _corte(cid, *, yt="", tiktok_em=None, status=StatusCorte.APROVADO) -> Corte:
    return Corte(
        id=cid,
        projeto_id="p1",
        numero=1,
        inicio_seg=0.0,
        fim_seg=60.0,
        status=status,
        youtube_video_id=yt,
        youtube_scheduled_at="",
        tiktok_publicado_em=tiktok_em,
    )


async def _gravar(fabrica, *objetos):
    async with fabrica() as db:
        db.add_all(objetos)
        await db.commit()


def _mp4_pronto(pasta, corte_id: str) -> None:
    destino = pasta / "p1" / "cortes" / corte_id / "upload_ready"
    destino.mkdir(parents=True)
    (destino / "video.mp4").write_bytes(b"mp4")


async def _redes(fabrica) -> dict[str, dict]:
    (projeto,) = await listar_projetos()
    return {rede["plataforma"]: rede for rede in projeto["redes_do_horizontal"]}


@pytest.mark.asyncio
async def test_live_toda_no_youtube_e_fora_do_tiktok_acende_so_o_youtube(banco):
    fabrica, _ = banco
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", yt="yt1"),
        _corte("c2", yt="yt2", tiktok_em=datetime(2026, 10, 20, tzinfo=UTC)),
    )

    redes = await _redes(fabrica)

    assert redes["youtube"] == {"plataforma": "youtube", "publicados": 2, "completa": True}
    assert redes["tiktok_horizontal"] == {
        "plataforma": "tiktok_horizontal",
        "publicados": 1,
        "completa": False,
    }


@pytest.mark.asyncio
async def test_o_mp4_no_disco_entra_no_denominador_e_apaga_o_youtube(banco):
    """Corte renderizado e ainda não enviado é trabalho pendente, não ausência."""
    fabrica, pasta = banco
    await _gravar(fabrica, Projeto(id="p1", youtube_url="u1"), _corte("c1", yt="yt1"), _corte("c2"))
    _mp4_pronto(pasta, "c2")

    redes = await _redes(fabrica)

    assert (redes["youtube"]["publicados"], redes["youtube"]["completa"]) == (1, False)


@pytest.mark.asyncio
async def test_corte_marcado_no_tiktok_sem_video_pronto_fica_fora_da_conta(banco):
    """Numerador é subconjunto da população: sem MP4 nem id, o corte não existe aqui."""
    fabrica, _ = banco
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", yt="yt1", tiktok_em=datetime(2026, 10, 20, tzinfo=UTC)),
        _corte("c2", tiktok_em=datetime(2026, 10, 21, tzinfo=UTC)),
    )

    redes = await _redes(fabrica)

    assert redes["tiktok_horizontal"] == {
        "plataforma": "tiktok_horizontal",
        "publicados": 1,
        "completa": True,
    }


@pytest.mark.asyncio
async def test_corte_so_proposto_nao_entra_e_a_live_sem_pronto_nao_acende(banco):
    fabrica, _ = banco
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", yt="yt1", status=StatusCorte.PROPOSTO),
    )

    redes = await _redes(fabrica)

    assert [r["completa"] for r in redes.values()] == [False, False]
    assert [r["publicados"] for r in redes.values()] == [0, 0]


@pytest.mark.asyncio
async def test_corte_processado_pelo_render_final_continua_na_populacao(banco):
    """D-992: terminar o render tirava a live dos chips.

    O ciclo do corte move APROVADO -> PROCESSADO quando o render final acaba
    (`ciclo_corte._PELO_SISTEMA`). A listagem só contava APROVADO, então a live
    já pronta e publicada zerava o denominador e o card não mostrava rede
    nenhuma — 129 das 186 lives com corte publicado na PROD em 29/10/2026.
    """
    fabrica, _ = banco
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u1"),
        _corte(
            "c1",
            yt="yt1",
            tiktok_em=datetime(2026, 10, 25, tzinfo=UTC),
            status=StatusCorte.PROCESSADO,
        ),
    )

    (projeto,) = await listar_projetos()
    redes = {rede["plataforma"]: rede for rede in projeto["redes_do_horizontal"]}

    # Zero aqui é o que fazia `RedesDoProjeto` devolver null antes de olhar a rede.
    assert projeto["total_video_pronto"] == 1
    assert redes["youtube"] == {"plataforma": "youtube", "publicados": 1, "completa": True}
    assert redes["tiktok_horizontal"] == {
        "plataforma": "tiktok_horizontal",
        "publicados": 1,
        "completa": True,
    }
