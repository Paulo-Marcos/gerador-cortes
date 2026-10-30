"""D-992: quais cortes entram nas contagens do card da Biblioteca.

A listagem contava só `aprovado`, mas o render final move o corte para
`processado` (`ciclo_corte._PELO_SISTEMA`) — o corte saía da conta justamente
por ter terminado. A tela do projeto nunca teve esse erro: `routers/export.py`
sempre pediu os dois status. Aqui o que está em jogo é a POPULAÇÃO de cada uma
das quatro contagens, não o que o card faz com elas.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, StatusCorte
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
    yield f
    await engine.dispose()


def _corte(cid: str, status, *, clip: str = "") -> Corte:
    return Corte(
        id=cid,
        projeto_id="p1",
        numero=1,
        inicio_seg=0.0,
        fim_seg=60.0,
        status=status,
        arquivo_clip_path=clip,
    )


def _metadado(cid: str) -> MetadadoCorte:
    return MetadadoCorte(id=f"m-{cid}", corte_id=cid, titulo_youtube="Título do corte")


async def _gravar(fabrica, *objetos):
    async with fabrica() as db:
        db.add_all(objetos)
        await db.commit()


@pytest.mark.parametrize("status", [StatusCorte.APROVADO, StatusCorte.PROCESSADO])
@pytest.mark.asyncio
async def test_aprovado_e_processado_contam_nas_tres_colunas(banco, status):
    """Render final terminado não pode encolher a contagem do card."""
    await _gravar(
        banco,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", status, clip="C:/raw/c1.mp4"),
        _metadado("c1"),
    )

    (projeto,) = await listar_projetos()

    assert (
        projeto["total_aprovados"],
        projeto["total_com_raw"],
        projeto["total_com_meta"],
    ) == (1, 1, 1)


@pytest.mark.parametrize("status", [StatusCorte.PROPOSTO, StatusCorte.REJEITADO])
@pytest.mark.asyncio
async def test_proposto_e_rejeitado_ficam_de_fora(banco, status):
    """Só conta quem o operador aceitou: proposto ainda espera curadoria e
    rejeitado é o legado que nenhuma tela trata como trabalho entregue."""
    await _gravar(
        banco,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", status, clip="C:/raw/c1.mp4"),
        _metadado("c1"),
    )

    (projeto,) = await listar_projetos()

    assert (
        projeto["total_aprovados"],
        projeto["total_com_raw"],
        projeto["total_com_meta"],
    ) == (0, 0, 0)


@pytest.mark.asyncio
async def test_o_bruto_apagado_pela_limpeza_sai_do_com_raw(banco):
    """`com_raw` continua sendo sobre o ARQUIVO: a D-992 mexeu só no status."""
    await _gravar(
        banco,
        Projeto(id="p1", youtube_url="u1"),
        _corte("c1", StatusCorte.PROCESSADO, clip=""),
    )

    (projeto,) = await listar_projetos()

    assert (projeto["total_aprovados"], projeto["total_com_raw"]) == (1, 0)
