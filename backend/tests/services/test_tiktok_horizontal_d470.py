"""D-470: o corte horizontal no TikTok.

O TikTok aceita 16:9 e ainda dá impulso a landscape acima de 60s. Como o arquivo
já existe — é o mesmo que foi para o YouTube —, o custo de estar lá também é só
o upload. Expectativa calibrada: o ganho é presença e descoberta, não watch
time; vídeo deitado toca em janela pequena com tarjas.

O teste guarda o que faz isso ser barato: o MESMO contrato do short, mudando só
a origem do arquivo e o `vertical`.
"""

import pytest
import pytest_asyncio
from app.domain.publicacao.publicacao import Plataforma
from app.models import Base, Corte, Projeto
from app.services import publicacao_destinos as destinos
from app.services.destinos_shorts import DestinoManual
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
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

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="O corte inteiro",
                tema_central="Economia",
                resumo="do que se trata",
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                duracao_clip_seg=612.0,
            )
        )
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


@pytest.mark.asyncio
async def test_contexto_usa_o_mp4_que_foi_para_o_youtube(ambiente):
    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.arquivo.name == "video.mp4"
    assert contexto.vertical is False
    assert contexto.duracao_seg == 612.0


@pytest.mark.asyncio
async def test_corte_e_o_proprio_video_longo_entao_nao_ha_cta(ambiente):
    """Repetir o proprio link mandaria o espectador de volta para onde ele esta."""
    contexto = await destinos.montar_contexto_do_corte("c1")

    assert contexto.base.url_video_longo == ""


@pytest.mark.asyncio
async def test_sem_video_final_recusa_com_motivo_acionavel(ambiente):
    _, raiz = ambiente
    (raiz / "p1" / "cortes" / "c1" / "upload_ready" / "video.mp4").unlink()

    with pytest.raises(ValueError, match="upload_ready"):
        await destinos.montar_contexto_do_corte("c1")


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(ambiente):
    with pytest.raises(LookupError):
        await destinos.montar_contexto_do_corte("nao-existe")


@pytest.mark.asyncio
async def test_video_deitado_nao_gera_aviso_de_formato_no_tiktok(ambiente):
    """E o unico destino que aceita 16:9 — o aviso ali seria ruido."""
    contexto = await destinos.montar_contexto_do_corte("c1")

    pacote = await DestinoManual(Plataforma.TIKTOK_HORIZONTAL).preparar(contexto)

    assert pacote.avisos == []


@pytest.mark.asyncio
async def test_o_mesmo_video_no_tiktok_vertical_avisaria(ambiente):
    """A prova de que o aviso existe e so nao dispara no destino horizontal."""
    contexto = await destinos.montar_contexto_do_corte("c1")

    pacote = await DestinoManual(Plataforma.TIKTOK).preparar(contexto)

    assert any("vertical" in a for a in pacote.avisos)


@pytest.mark.asyncio
async def test_pacote_do_corte_sai_ao_lado_do_video(ambiente):
    contexto = await destinos.montar_contexto_do_corte("c1")
    destino = DestinoManual(Plataforma.TIKTOK_HORIZONTAL)

    resultado = await destino.publicar(await destino.preparar(contexto))

    assert "tiktok_horizontal" in resultado["pasta"]
    assert "O corte inteiro" in (
        contexto.arquivo.parent / "publicar" / "tiktok_horizontal" / "publicar.txt"
    ).read_text(encoding="utf-8")
