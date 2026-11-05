"""O id da URL não chega perto do disco antes de o banco confirmar o projeto (D-1039)."""

import pytest
from app.domain.compartilhado.erros import NaoEncontrado
from app.models import Base
from app.services import projeto as projeto_module
from app.services.ingestao import IngestaoService
from app.services.projeto import ProjetoService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_pasta_sem_projeto_no_banco_da_404_sem_baixar_a_legenda(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(projeto_module, "AsyncSessionLocal", fabrica)
    monkeypatch.setattr(projeto_module, "projetos_dir", lambda: tmp_path)
    (tmp_path / "so-na-pasta").mkdir()
    chamadas = []

    async def extrair_legenda(*args, **_kwargs):
        chamadas.append(args)
        return []

    monkeypatch.setattr(IngestaoService, "_extrair_legenda", staticmethod(extrair_legenda))

    with pytest.raises(NaoEncontrado, match="Projeto não encontrado"):
        await ProjetoService.atualizar_sincronia_da_legenda("so-na-pasta", 1500)

    assert chamadas == []
    await engine.dispose()
