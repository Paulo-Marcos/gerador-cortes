"""D-566: liberar um corte publicado para que ele possa subir de novo.

Contra SQLite real: o ponto do serviço é o que fica GRAVADO depois — mock de
sessão provaria só que chamamos `setattr`.
"""

from datetime import datetime

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import liberacao_publicacao as servico
from app.services.liberacao_publicacao import liberar_publicacao
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)
    # A pasta dos projetos é consultada só para dizer se o MP4 final ainda existe.
    monkeypatch.setattr(servico, "projetos_dir", lambda: tmp_path)
    yield factory
    await engine.dispose()


async def _seed_corte_publicado(factory, **campos) -> str:
    async with factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="https://youtu.be/live", titulo_live="Live"))
        corte = Corte(
            id="corte-1",
            projeto_id="proj-1",
            numero=1,
            inicio_hms="00:00:00",
            fim_hms="00:05:00",
            youtube_video_id="ZcvZLOResPc",
            youtube_url_publicado="https://youtu.be/ZcvZLOResPc",
            youtube_scheduled_at="",
            **campos,
        )
        db.add(corte)
        await db.commit()
    return "corte-1"


@pytest.mark.asyncio
async def test_liberar_youtube_apaga_as_marcas_e_devolve_o_corte_para_a_fila(session_factory):
    corte_id = await _seed_corte_publicado(session_factory)

    resultado = await liberar_publicacao(corte_id, "youtube")

    assert resultado["status"] == "ok"
    assert resultado["liberado"] is True
    assert resultado["campos_limpos"] == ["youtube_video_id", "youtube_url_publicado"]

    async with session_factory() as db:
        corte = await db.get(Corte, corte_id)
        # É esta leitura que o upload faz para se declarar idempotente.
        assert corte.youtube_video_id == ""
        assert corte.youtube_url_publicado == ""


@pytest.mark.asyncio
async def test_liberar_tiktok_nao_toca_no_youtube(session_factory):
    """Destinos são independentes — o TikTok é publicação manual do operador."""
    corte_id = await _seed_corte_publicado(
        session_factory, tiktok_publicado_em=datetime(2026, 9, 1)
    )

    resultado = await liberar_publicacao(corte_id, "tiktok")

    assert resultado["liberado"] is True
    async with session_factory() as db:
        corte = await db.get(Corte, corte_id)
        assert corte.tiktok_publicado_em is None
        assert corte.youtube_video_id == "ZcvZLOResPc"


@pytest.mark.asyncio
async def test_liberar_destino_sem_marca_e_no_op_e_nao_erro(session_factory):
    """Clicar duas vezes não é engano do operador; não vira 4xx."""
    corte_id = await _seed_corte_publicado(session_factory)

    await liberar_publicacao(corte_id, "youtube")
    segunda = await liberar_publicacao(corte_id, "youtube")

    assert segunda["status"] == "ok"
    assert segunda["liberado"] is False
    assert "já não constava" in segunda["mensagem"]


@pytest.mark.asyncio
async def test_avisa_quando_o_mp4_final_nao_esta_mais_no_disco(session_factory, tmp_path):
    """Sem `upload_ready/video.mp4` o botão de enviar não volta (D-512)."""
    corte_id = await _seed_corte_publicado(session_factory)

    resultado = await liberar_publicacao(corte_id, "youtube")

    assert resultado["video_pronto"] is False
    assert "render" in resultado["mensagem"].lower()

    upload_ready = tmp_path / "proj-1" / "cortes" / corte_id / "upload_ready"
    upload_ready.mkdir(parents=True)
    (upload_ready / "video.mp4").write_bytes(b"x")

    de_novo = await liberar_publicacao(corte_id, "youtube")
    assert de_novo["video_pronto"] is True


@pytest.mark.asyncio
async def test_destino_desconhecido_e_corte_inexistente_sao_erro(session_factory):
    corte_id = await _seed_corte_publicado(session_factory)

    desconhecido = await liberar_publicacao(corte_id, "instagram")
    assert desconhecido["status"] == "erro"
    assert "youtube" in desconhecido["mensagem"]

    inexistente = await liberar_publicacao("corte-fantasma", "youtube")
    assert inexistente["status"] == "erro"
    assert "não encontrado" in inexistente["mensagem"]
