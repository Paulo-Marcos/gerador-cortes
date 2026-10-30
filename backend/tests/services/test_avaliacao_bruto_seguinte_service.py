"""D-996: `montar_contexto` anexa o trecho seguinte ao fim do último segmento exibido."""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import avaliacao_bruto as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", f)
    yield f
    await engine.dispose()


async def _seed(factory, transcricao_raw):
    async with factory() as db:
        db.add(Projeto(id="p", youtube_url="http://x", transcricao_raw=json.dumps(transcricao_raw)))
        db.add(
            Corte(
                id="c",
                projeto_id="p",
                numero=1,
                titulo_proposto="T",
                tema_central="Tema",
                inicio_seg=0.0,
                fim_seg=100.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                desvios="[]",
                transcricao_final=json.dumps([{"start": 0.0, "texto": "fala do corte"}]),
            )
        )
        await db.commit()


@pytest.mark.asyncio
async def test_contexto_traz_o_que_vem_depois_do_fim(factory):
    await _seed(
        factory,
        [{"start": 50.0, "texto": "dentro"}, {"start": 102.0, "texto": "depois do fim"}],
    )

    texto = (await servico.montar_contexto("c")).texto_avaliado

    assert "FORA DO CORTE" in texto
    assert "[+00:02] depois do fim" in texto


@pytest.mark.asyncio
async def test_fim_da_live_e_dito_no_contexto(factory):
    await _seed(factory, [{"start": 50.0, "texto": "dentro"}])

    assert "a live termina aqui" in (await servico.montar_contexto("c")).texto_avaliado


@pytest.mark.asyncio
async def test_projeto_sem_transcricao_da_live_nao_ganha_secao(factory):
    await _seed(factory, [])

    assert "FORA DO CORTE" not in (await servico.montar_contexto("c")).texto_avaliado
