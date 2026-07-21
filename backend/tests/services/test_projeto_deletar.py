"""D-387: `deletar_projeto` deve remover tambem a pasta do projeto em disco.

Antes so apagava o registro no banco, deixando os arquivos (video, cortes,
overlays) orfaos no disco para sempre.
"""

import pytest
import pytest_asyncio
from app.models import Base, Projeto
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


@pytest.mark.asyncio
async def test_deletar_projeto_remove_registro_e_pasta_em_disco(
    monkeypatch, tmp_path, session_factory
):
    monkeypatch.setattr(projeto_module, "projetos_dir", lambda: tmp_path)

    projeto_dir = tmp_path / "p1"
    (projeto_dir / "cortes").mkdir(parents=True)
    (projeto_dir / "video.mkv").write_bytes(b"x")

    async with session_factory() as db:
        db.add(Projeto(id="p1", youtube_url="u", titulo_live="t", canal_origem="c"))
        await db.commit()

        sucesso = await ProjetoService.deletar_projeto("p1", db)

        assert sucesso is True
        assert await db.get(Projeto, "p1") is None
    assert not projeto_dir.exists()


@pytest.mark.asyncio
async def test_deletar_projeto_inexistente_retorna_falso(session_factory):
    async with session_factory() as db:
        sucesso = await ProjetoService.deletar_projeto("nao-existe", db)

    assert sucesso is False
