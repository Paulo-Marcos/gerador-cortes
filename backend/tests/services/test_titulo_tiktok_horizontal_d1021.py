"""D-1021: o que vai para o TikTok é o título gerado, não a etiqueta da curadoria.

O bug apareceu num corte manual, publicado como "Corte manual #3" enquanto o
título gerado estava gravado no metadado. Valia para todo corte: nos da IA a
etiqueta parece um título, e por isso ninguém reclamava.
"""

import pytest
import pytest_asyncio
from app.domain.publicacao.publicacao import Plataforma
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import publicacao_destinos as destinos
from app.services.destinos_shorts import DestinoManual
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

TITULO_GERADO = "Por que Marx diz que Hegel está de CABEÇA PARA BAIXO?"


@pytest_asyncio.fixture
async def novo_corte(monkeypatch, tmp_path):
    """Grava um corte com o MP4 pronto e, se pedido, o título de publicação."""
    monkeypatch.setattr(destinos, "projetos_dir", lambda: tmp_path)
    upload_dir = tmp_path / "p1" / "cortes" / "c1" / "upload_ready"
    upload_dir.mkdir(parents=True)
    (upload_dir / "video.mp4").write_bytes(b"video horizontal")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(destinos, "AsyncSessionLocal", factory)

    async def _gravar(titulo_proposto: str, titulo_youtube: str | None = None) -> None:
        async with factory() as db:
            db.add(Projeto(id="p1", youtube_url="u"))
            db.add(
                Corte(
                    id="c1",
                    projeto_id="p1",
                    numero=3,
                    titulo_proposto=titulo_proposto,
                    inicio_seg=0.0,
                    fim_seg=600.0,
                    inicio_hms="00:00:00.000",
                    fim_hms="00:10:00.000",
                    duracao_clip_seg=612.0,
                )
            )
            if titulo_youtube is not None:
                db.add(MetadadoCorte(id="m1", corte_id="c1", titulo_youtube=titulo_youtube))
            await db.commit()

    yield _gravar
    await engine.dispose()


@pytest.mark.asyncio
async def test_corte_manual_publica_o_titulo_gerado(novo_corte):
    """O caso relatado: etiqueta 'Corte manual #3', título gerado no metadado."""
    await novo_corte("Corte manual #3", TITULO_GERADO)

    contexto = await destinos.montar_contexto_do_corte("c1")
    pacote = await DestinoManual(Plataforma.TIKTOK_HORIZONTAL).preparar(contexto)

    assert pacote.metadados.titulo == TITULO_GERADO


@pytest.mark.asyncio
async def test_corte_da_ia_tambem_publica_o_titulo_gerado(novo_corte):
    """A mesma regra para todo corte: a etiqueta da curadoria nunca vence o gerado."""
    await novo_corte("Wu Wei não é ficar parado", "Por que o WU WEI foi escrito para GOVERNANTES?")

    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.base.titulo == "Por que o WU WEI foi escrito para GOVERNANTES?"


@pytest.mark.asyncio
async def test_o_fire_nao_vai_para_a_legenda(novo_corte):
    """O 🔥 do título é marca interna; o YouTube também o tira antes de enviar."""
    await novo_corte("Corte manual #3", f"🔥 {TITULO_GERADO}")

    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.base.titulo == TITULO_GERADO


@pytest.mark.asyncio
async def test_sem_metadado_usa_o_titulo_digitado_no_modal(novo_corte):
    await novo_corte("Hegel de cabeça para baixo")

    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.base.titulo == "Hegel de cabeça para baixo"


@pytest.mark.parametrize(
    ("titulo_proposto", "titulo_youtube"),
    [
        pytest.param("Corte manual #3", None, id="sem-metadado"),
        pytest.param("Corte manual #3", "", id="metadado-sem-titulo"),
        pytest.param("Corte manual #2 (2)", None, id="corte-duplicado"),
        # Ligar o Fire antes de gerar copia a etiqueta para o metadado.
        pytest.param("Corte manual #3", "🔥 Corte manual #3", id="fire-antes-de-gerar"),
    ],
)
@pytest.mark.asyncio
async def test_so_com_o_rotulo_provisorio_recusa_com_motivo_acionavel(
    novo_corte, titulo_proposto, titulo_youtube
):
    await novo_corte(titulo_proposto, titulo_youtube)

    with pytest.raises(ValueError, match="gere os metadados"):
        await destinos.montar_contexto_do_corte("c1")
