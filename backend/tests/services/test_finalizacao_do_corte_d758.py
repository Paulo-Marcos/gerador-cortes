"""O fim do render: o corte fica pronto para publicar (D-758).

Teste de caracterização, antes de a finalização sair do remotion_render para um
módulo próprio. Fixa o que ela faz: gera o metadados.txt na pasta de upload,
copia a thumbnail quando ela existe e marca o corte como processado, com a
pós-produção fechada. Troca só as bordas: banco em memória, a pasta de dados e
a escrita do metadados.txt. A referência que o movimento troca fica no topo.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app import channel_paths
from app.models import Base, Corte, MetadadoCorte, Projeto, StatusCorte
from app.services.export import ExportService
from app.services.remotion_render import RemotionRenderService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

finalizar = RemotionRenderService.finalizar_corte_com_sucesso


@pytest_asyncio.fixture
async def fabrica():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="http://x"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def pastas(tmp_path, monkeypatch):
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    upload = tmp_path / "p1" / "cortes" / "c1" / "upload_ready"
    upload.mkdir(parents=True)
    return tmp_path, upload


@pytest.fixture
def metadados(monkeypatch):
    gerados = []

    async def gerar(corte_id, pasta):
        gerados.append((corte_id, pasta))

    monkeypatch.setattr(ExportService, "_gerar_metadados_txt", staticmethod(gerar))
    return gerados


async def _finalizar(fabrica, upload):
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        await finalizar(db, corte, upload)
    async with fabrica() as db:
        return await db.get(Corte, "c1")


@pytest.mark.asyncio
async def test_com_thumbnail_copia_a_capa_e_marca_o_corte_pronto(fabrica, pastas, metadados):
    raiz, upload = pastas
    (raiz / "p1" / "thumbnails").mkdir(parents=True)
    (raiz / "p1" / "thumbnails" / "capa.jpg").write_bytes(b"jpeg-da-capa")
    async with fabrica() as db:
        db.add(MetadadoCorte(id="m1", corte_id="c1", thumbnail_path="thumbnails/capa.jpg"))
        await db.commit()

    corte = await _finalizar(fabrica, upload)

    assert metadados == [("c1", upload)]
    assert (upload / "thumbnail.jpg").read_bytes() == b"jpeg-da-capa"
    assert (corte.status, corte.is_pos_producao) == (StatusCorte.PROCESSADO, 1)


@pytest.mark.asyncio
async def test_sem_thumbnail_so_marca_o_corte_pronto(fabrica, pastas, metadados):
    _, upload = pastas

    corte = await _finalizar(fabrica, upload)

    assert metadados == [("c1", upload)]
    assert not (upload / "thumbnail.jpg").exists()
    assert (corte.status, corte.is_pos_producao) == (StatusCorte.PROCESSADO, 1)
