"""D-457: a previa da limpeza e o opt-in de apagar os brutos dos Fires.

A previa existe para que a pergunta na tela nao seja no escuro: sem saber
quantos brutos existem e quanto disco seguram, "quer limpar tambem?" pede uma
decisao sem informacao. E o opt-in tem de ser mesmo opt-in — o teste do
`limpar_brutos_fire=True` guarda contra a inversao silenciosa do default.
"""

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import media_retention as media_retention_module
from app.services import projeto as projeto_module
from app.services.projeto import ProjetoService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest.fixture
def raiz(monkeypatch, tmp_path):
    """Raiz de dados dublê nos dois módulos que a resolvem."""
    from app import channel_paths

    monkeypatch.setattr(projeto_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(media_retention_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    return tmp_path


async def _semear(factory, raiz, *, fire: bool, shorts_finalizados: bool = False):
    corte_dir = raiz / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True)
    bruto = corte_dir / "clip_raw_1.mkv"
    bruto.write_bytes(b"x" * (2 * 1024 * 1024))

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u", titulo_live="t", canal_origem="c"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                shorts_finalizados_em=datetime.now(UTC) if shorts_finalizados else None,
            )
        )
        db.add(MetadadoCorte(id="m1", corte_id="c1", is_fire=fire))
        await db.commit()
    return bruto


@pytest.mark.asyncio
async def test_previa_conta_os_brutos_de_fire_e_o_disco_que_seguram(session_factory, raiz):
    await _semear(session_factory, raiz, fire=True)

    async with session_factory() as db:
        previa = await ProjetoService.previa_limpeza("p1", db)

    assert previa == {"brutos_fire": 1, "retido_mb": 2.1}


@pytest.mark.asyncio
async def test_previa_de_live_sem_fire_nao_tem_nada_a_perguntar(session_factory, raiz):
    await _semear(session_factory, raiz, fire=False)

    async with session_factory() as db:
        previa = await ProjetoService.previa_limpeza("p1", db)

    assert previa == {"brutos_fire": 0, "retido_mb": 0.0}


@pytest.mark.asyncio
async def test_previa_de_projeto_inexistente_e_none(session_factory, raiz):
    async with session_factory() as db:
        assert await ProjetoService.previa_limpeza("nao-existe", db) is None


@pytest.mark.asyncio
async def test_limpeza_padrao_preserva_o_bruto_do_fire(session_factory, raiz):
    bruto = await _semear(session_factory, raiz, fire=True)

    async with session_factory() as db:
        resultado = await ProjetoService.limpar_arquivos_projeto("p1", db)

    assert bruto.exists()
    assert resultado["retido_mb"] > 0


@pytest.mark.asyncio
async def test_limpeza_padrao_remove_o_bruto_do_fire_finalizado(session_factory, raiz):
    bruto = await _semear(session_factory, raiz, fire=True, shorts_finalizados=True)

    async with session_factory() as db:
        resultado = await ProjetoService.limpar_arquivos_projeto("p1", db)

    assert not bruto.exists()
    assert resultado["retido_mb"] == 0


@pytest.mark.asyncio
async def test_opt_in_explicito_apaga_o_bruto_do_fire(session_factory, raiz):
    """Se este teste inverter, o operador perde a materia-prima sem pedir."""
    bruto = await _semear(session_factory, raiz, fire=True)

    async with session_factory() as db:
        resultado = await ProjetoService.limpar_arquivos_projeto("p1", db, limpar_brutos_fire=True)

    assert not bruto.exists()
    assert resultado["retido_mb"] == 0
