"""D-158: caminhos de artefato relativos ao projeto + migração dos legados.

Cobre:
- (a) o helper `para_relativo_ao_projeto` normaliza absoluto-antigo, Docker
  `/app/...` e valor já-relativo para o MESMO sub-caminho relativo;
- (b) `migration_002` reescreve valores absolutos → relativos e é idempotente;
- (c) a ESCRITA (`ThumbnailService.upload_manual`) passa a persistir relativo;
- (d) a LEITURA (`resolver_do_projeto`) reancora o relativo pela raiz vigente.
"""

import os

import pytest
import pytest_asyncio
from app import channel_paths
from app.channel_paths import para_relativo_ao_projeto, resolver_do_projeto
from app.migrations import migration_002_paths_relativos
from app.models import AvaliacaoThumbnail, Base, Corte, MetadadoCorte, Projeto
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# --------------------------------------------------------------------------- #
# (a) helper — normaliza os três formatos para o mesmo relativo
# --------------------------------------------------------------------------- #

RELATIVO_ESPERADO = "cortes/c1/clip_raw.mkv"


@pytest.mark.parametrize(
    "valor",
    [
        r"C:\Users\x\backend\projetos\proj-1\cortes\c1\clip_raw.mkv",  # absoluto antigo
        "/app/projetos/proj-1/cortes/c1/clip_raw.mkv",  # Docker
        "C:/repo/instance/channels/sapo/projetos/proj-1/cortes/c1/clip_raw.mkv",  # canal
        "cortes/c1/clip_raw.mkv",  # já relativo
        "proj-1/cortes/c1/clip_raw.mkv",  # relativo à raiz de dados (com id)
    ],
)
def test_para_relativo_normaliza_todos_os_formatos(valor):
    assert para_relativo_ao_projeto(valor, "proj-1") == RELATIVO_ESPERADO


def test_para_relativo_vazio_e_sem_id():
    assert para_relativo_ao_projeto("", "proj-1") == ""
    # Sem o id no caminho: devolve o próprio valor normalizado (não inventa nada).
    assert para_relativo_ao_projeto("thumbnails/thumb.jpg", "proj-1") == "thumbnails/thumb.jpg"


# --------------------------------------------------------------------------- #
# (d) leitura — resolver reancora o relativo pela raiz de dados vigente
# --------------------------------------------------------------------------- #


def test_resolver_do_projeto_reancora(tmp_path, monkeypatch):
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    esperado = tmp_path / "proj-1" / "cortes" / "c1" / "clip_raw.mkv"

    # Aceita relativo (novo padrão) E absoluto/Docker legado — mesmo destino.
    assert resolver_do_projeto("cortes/c1/clip_raw.mkv", "proj-1") == esperado
    assert resolver_do_projeto("/app/projetos/proj-1/cortes/c1/clip_raw.mkv", "proj-1") == esperado


# --------------------------------------------------------------------------- #
# (b) migração — reescreve legados e é idempotente
# --------------------------------------------------------------------------- #


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


@pytest.mark.asyncio
async def test_migration_002_reescreve_e_idempotente(engine):
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with sf() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id="corte-1",
                projeto_id="proj-1",
                numero=1,
                arquivo_clip_path=r"C:\old\backend\projetos\proj-1\cortes\corte-1\clip_raw.mkv",
            )
        )
        db.add(
            MetadadoCorte(
                id="meta-1",
                corte_id="corte-1",
                thumbnail_path="/app/projetos/proj-1/thumbnails/thumb_corte001.jpg",
            )
        )
        db.add(
            AvaliacaoThumbnail(
                id="av-1",
                corte_id="corte-1",
                thumbnail_path_snapshot=(
                    r"C:\old\backend\projetos\proj-1\thumbnails\avaliacoes\av-1.jpg"
                ),
            )
        )
        # Linha já-relativa: deve permanecer intacta (no-op).
        db.add(
            Corte(
                id="corte-2",
                projeto_id="proj-1",
                numero=2,
                arquivo_clip_path="cortes/corte-2/clip_raw.mkv",
            )
        )
        await db.commit()

    async with engine.begin() as conn:
        await migration_002_paths_relativos.upgrade(conn)

    async with sf() as db:
        c1 = await db.get(Corte, "corte-1")
        c2 = await db.get(Corte, "corte-2")
        m1 = await db.get(MetadadoCorte, "meta-1")
        av1 = await db.get(AvaliacaoThumbnail, "av-1")
        assert c1.arquivo_clip_path == "cortes/corte-1/clip_raw.mkv"
        assert c2.arquivo_clip_path == "cortes/corte-2/clip_raw.mkv"
        assert m1.thumbnail_path == "thumbnails/thumb_corte001.jpg"
        assert av1.thumbnail_path_snapshot == "thumbnails/avaliacoes/av-1.jpg"

    # Segunda passagem não altera mais nada (idempotência).
    async with engine.begin() as conn:
        await migration_002_paths_relativos.upgrade(conn)

    async with sf() as db:
        c1 = await db.get(Corte, "corte-1")
        assert c1.arquivo_clip_path == "cortes/corte-1/clip_raw.mkv"


# --------------------------------------------------------------------------- #
# (c) escrita — upload_manual passa a persistir relativo
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_upload_manual_persiste_relativo(tmp_path, monkeypatch):
    from app.services import thumbnail as thumb_module

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
        db.add(Corte(id="corte-1", projeto_id="proj-1", numero=1))
        db.add(MetadadoCorte(id="meta-1", corte_id="corte-1"))
        await db.commit()

    monkeypatch.setattr(thumb_module, "AsyncSessionLocal", sf)
    monkeypatch.setattr(thumb_module, "projetos_dir", lambda: tmp_path)

    await thumb_module.ThumbnailService.upload_manual("corte-1", b"fake-jpeg", "capa.jpg")

    async with sf() as db:
        result = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == "corte-1")
        )
        meta = result.scalar_one()

    # Persistido RELATIVO ao projeto; o arquivo físico existe sob a raiz de dados.
    assert not os.path.isabs(meta.thumbnail_path)
    assert meta.thumbnail_path == "thumbnails/thumb_corte-1.jpg"
    assert os.path.exists(tmp_path / "proj-1" / meta.thumbnail_path)

    await engine.dispose()
