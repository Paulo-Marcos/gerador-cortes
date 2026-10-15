"""D-934: o escalonamento pela janela do público vale também para os horizontais.

A D-908 ligou a agenda só no lote de shorts; o lote do YouTube longo seguia com
15 minutos fixos a partir de um horário digitado. Aqui se guarda o combinado: N
cortes no destino `youtube` recebem as datas do motor (`escalonar`) — blocos,
teto por bloco e por dia, intervalo, transbordo —, partindo do último corte já
agendado ou publicado no canal, e o TikTok horizontal continua a fila da conta.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from app.domain.publicacao.escalonamento import PADRAO_DO_PUBLICO, PADRAO_POR_DESTINO
from app.domain.publicacao.publicacao import Plataforma
from app.models import Base, Corte, Projeto, YoutubeVideoStat
from app.services import escalonamento_do_lote as svc
from app.services import registro_do_lote
from app.services.canal import escalonamento_settings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

FUSO = timezone(timedelta(hours=-3))
SEGUNDA_10H = datetime(2030, 1, 7, 10, 0, tzinfo=FUSO)
DEZ_CORTES = [("corte", f"c{n}") for n in range(1, 11)]


@pytest.fixture
def canal(monkeypatch):
    """Os parâmetros PADRÃO de cada destino e a fila do canal que o teste montar."""
    filas: dict[str, datetime | None] = {}

    async def _ultimo_shorts(plataformas):
        return filas.get(plataformas[0])

    async def _ultimo_youtube():
        return filas.get("youtube")

    monkeypatch.setattr(registro_do_lote, "ultimo_agendado", _ultimo_shorts)
    monkeypatch.setattr(registro_do_lote, "ultimo_no_youtube", _ultimo_youtube, raising=False)
    monkeypatch.setattr(escalonamento_settings, "resolver_referencia", lambda: PADRAO_DO_PUBLICO)
    monkeypatch.setattr(
        escalonamento_settings, "resolver_parametros", lambda d: PADRAO_POR_DESTINO[d]
    )
    return filas


@pytest.mark.asyncio
async def test_lote_de_dez_cortes_no_youtube_segue_os_blocos_do_canal(canal):
    """12:00 e 18:00, quatro por bloco de 15 em 15, oito no dia; o resto transborda."""
    linhas = await svc.prever_youtube(DEZ_CORTES, agora=SEGUNDA_10H)

    assert [linha.alvo_id for linha in linhas] == [f"c{n}" for n in range(1, 11)]
    assert {linha.plataforma for linha in linhas} == {"youtube"}
    assert [linha.agendar_para for linha in linhas] == [
        "2030-01-07T12:00",
        "2030-01-07T12:15",
        "2030-01-07T12:30",
        "2030-01-07T12:45",
        "2030-01-07T18:00",
        "2030-01-07T18:15",
        "2030-01-07T18:30",
        "2030-01-07T18:45",
        "2030-01-08T12:00",
        "2030-01-08T12:15",
    ]


@pytest.mark.asyncio
async def test_segundo_lote_continua_depois_do_ultimo_corte_agendado(canal):
    canal["youtube"] = datetime(2030, 1, 7, 12, 30, tzinfo=FUSO)

    linhas = await svc.prever_youtube(DEZ_CORTES[:3], agora=SEGUNDA_10H)

    assert [linha.agendar_para for linha in linhas] == [
        "2030-01-07T12:45",
        "2030-01-07T18:00",
        "2030-01-07T18:15",
    ]


@pytest.mark.asyncio
async def test_um_corte_sozinho_recebe_o_proximo_horario_livre(canal):
    canal["youtube"] = datetime(2030, 1, 7, 18, 45, tzinfo=FUSO)

    linhas = await svc.prever_youtube(DEZ_CORTES[:1], agora=SEGUNDA_10H)

    assert linhas[0].agendar_para == "2030-01-08T12:00"


@pytest.mark.asyncio
async def test_tiktok_horizontal_continua_a_fila_dos_shorts_do_tiktok(canal):
    """Mesma conta, mesma fila: o horizontal não pisa no bloco que um short já ocupa."""
    canal["tiktok"] = datetime(2030, 1, 7, 16, 0, tzinfo=FUSO)

    linhas = await svc.prever(DEZ_CORTES[:2], [Plataforma.TIKTOK_HORIZONTAL], agora=SEGUNDA_10H)

    assert [linha.agendar_para for linha in linhas] == ["2030-01-07T19:00", "2030-01-07T22:00"]


@pytest_asyncio.fixture
async def banco(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(registro_do_lote, "AsyncSessionLocal", factory)
    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        await db.commit()
    yield factory
    await engine.dispose()


def _corte(numero: int, agendado: str) -> Corte:
    return Corte(id=f"c{numero}", projeto_id="p1", numero=numero, youtube_scheduled_at=agendado)


@pytest.mark.asyncio
async def test_ultimo_no_youtube_e_o_corte_agendado_mais_tarde(banco):
    async with banco() as db:
        db.add(_corte(1, "2030-01-07T15:00:00.000Z"))
        db.add(_corte(2, "2030-01-08T21:00:00Z"))
        db.add(_corte(3, ""))
        db.add(_corte(4, "não é data"))
        await db.commit()

    ultimo = await registro_do_lote.ultimo_no_youtube()

    assert ultimo == datetime(2030, 1, 8, 21, 0, tzinfo=UTC)
    assert ultimo.tzinfo is not None


@pytest.mark.asyncio
async def test_ultimo_no_youtube_conta_a_publicacao_imediata_de_um_corte(banco):
    """Publicado na hora não grava agendamento; a data vem da sincronização do canal."""
    async with banco() as db:
        db.add(_corte(1, "2030-01-07T15:00:00Z"))
        db.add(YoutubeVideoStat(id="v1", video_id="v1", corte_id="c1", publicado_em=None))
        db.add(
            YoutubeVideoStat(
                id="v2", video_id="v2", corte_id="c1", publicado_em=datetime(2030, 1, 7, 20, 0)
            )
        )
        # Vídeo do canal sem corte local (um Short, uma live): não é desta fila.
        db.add(YoutubeVideoStat(id="v3", video_id="v3", publicado_em=datetime(2030, 1, 9, 9, 0)))
        await db.commit()

    assert await registro_do_lote.ultimo_no_youtube() == datetime(2030, 1, 7, 20, 0, tzinfo=UTC)


@pytest.mark.asyncio
async def test_ultimo_no_youtube_sem_nada_no_canal(banco):
    assert await registro_do_lote.ultimo_no_youtube() is None
