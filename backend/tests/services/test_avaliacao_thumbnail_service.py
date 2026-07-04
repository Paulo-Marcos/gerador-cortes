"""D-066: serviço de avaliação de thumbnail (registro + histórico + snapshot).

Exercita um SQLite em memória real e um diretório de projetos temporário, para
verificar de verdade a cópia da imagem avaliada para a pasta de histórico.
"""

import os

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import avaliacao_thumbnail as avaliacao_module
from app.services.avaliacao_thumbnail import AvaliacaoThumbnailService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def factory(tmp_path, monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(avaliacao_module, "AsyncSessionLocal", sf)
    monkeypatch.setattr(avaliacao_module, "projetos_dir", lambda: tmp_path)
    yield sf
    await engine.dispose()


async def _seed(sf, tmp_path, *, com_imagem=True, com_prompt=True):
    thumb_path = ""
    if com_imagem:
        thumb_dir = tmp_path / "proj-1" / "thumbnails"
        thumb_dir.mkdir(parents=True, exist_ok=True)
        thumb_path = str(thumb_dir / "thumb_corte001.jpg")
        with open(thumb_path, "wb") as fp:
            fp.write(b"fake-jpeg-bytes")

    async with sf() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(Corte(id="corte-1", projeto_id="proj-1", numero=1))
        db.add(
            MetadadoCorte(
                id="meta-1",
                corte_id="corte-1",
                titulo_youtube="Título de teste",
                texto_capa="JUSTICA",
                prompt_thumbnail="[VARIATION_TAGS] ...\n\nA cinematic editorial scene"
                if com_prompt
                else "",
                thumbnail_path=thumb_path,
            )
        )
        await db.commit()


@pytest.mark.asyncio
async def test_registrar_veredito_rapido_e_snapshot_da_imagem(factory, tmp_path):
    await _seed(factory, tmp_path)

    dto = await AvaliacaoThumbnailService.registrar("corte-1", veredito="bom")

    assert dto["veredito"] == "bom"
    assert dto["titulo_youtube_snapshot"] == "Título de teste"
    assert dto["prompt_snapshot"].startswith("[VARIATION_TAGS]")
    # D-158: o snapshot é guardado RELATIVO ao projeto (reancorável pelo canal);
    # a imagem foi copiada para a pasta de histórico e existe no disco.
    snapshot_rel = dto["thumbnail_path_snapshot"]
    assert not os.path.isabs(snapshot_rel)
    assert "avaliacoes" in snapshot_rel
    assert os.path.exists(tmp_path / "proj-1" / snapshot_rel)
    # Critérios não informados ficam nulos.
    assert dto["nota_beleza"] is None


@pytest.mark.asyncio
async def test_registrar_com_criterios_e_comentario(factory, tmp_path):
    await _seed(factory, tmp_path)

    dto = await AvaliacaoThumbnailService.registrar(
        "corte-1",
        veredito="otimo",
        notas={"beleza": 5, "honestidade": 4},
        comentario="  Ficou exatamente como eu queria  ",
    )

    assert dto["nota_beleza"] == 5
    assert dto["nota_honestidade"] == 4
    assert dto["nota_clareza"] is None
    assert dto["comentario"] == "Ficou exatamente como eu queria"


@pytest.mark.asyncio
async def test_registrar_sem_prompt_falha(factory, tmp_path):
    await _seed(factory, tmp_path, com_prompt=False)

    with pytest.raises(ValueError, match="prompt"):
        await AvaliacaoThumbnailService.registrar("corte-1", veredito="bom")


@pytest.mark.asyncio
async def test_registrar_veredito_invalido_falha(factory, tmp_path):
    await _seed(factory, tmp_path)

    with pytest.raises(ValueError):
        await AvaliacaoThumbnailService.registrar("corte-1", veredito="perfeito")


@pytest.mark.asyncio
async def test_registrar_sem_imagem_deixa_snapshot_vazio(factory, tmp_path):
    await _seed(factory, tmp_path, com_imagem=False)

    dto = await AvaliacaoThumbnailService.registrar("corte-1", veredito="regular")

    assert dto["thumbnail_path_snapshot"] == ""


@pytest.mark.asyncio
async def test_listar_por_corte_traz_historico_e_resumo(factory, tmp_path):
    await _seed(factory, tmp_path)
    await AvaliacaoThumbnailService.registrar("corte-1", veredito="otimo")
    await AvaliacaoThumbnailService.registrar("corte-1", veredito="ruim")

    historico = await AvaliacaoThumbnailService.listar_por_corte("corte-1")

    assert len(historico["avaliacoes"]) == 2
    assert historico["resumo"]["total"] == 2
    assert historico["resumo"]["positivos"] == 1
