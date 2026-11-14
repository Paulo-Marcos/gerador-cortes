"""D-1031 (RN-42/RN-43): o atalho do bruto mexe no trecho e a transcrição acompanha na hora.

`adicionar_desvio` gravava o desvio e parava: a cena não se movia e a marca de validadas
ficava até a próxima sincronia. `remover_desvio` já sincronizava; o teste o mantém assim.
"""

import json
from datetime import datetime

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]
_TRANSCRICAO = [
    {
        "start": 100.0 + i,
        "end": 100.0 + i + 4,
        "texto": " ".join(_PALAVRAS[i : i + 4]),
        "palavras": [
            {"texto": palavra, "inicio_seg": 100.0 + i + j}
            for j, palavra in enumerate(_PALAVRAS[i : i + 4])
        ],
    }
    for i in range(0, len(_PALAVRAS), 4)
]
_CENA = {"tipo": "enfase", "texto": "Tese", "inicio": 30.0, "fim": 35.0}


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_TRANSCRICAO)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=100.0,
                fim_seg=160.0,
                status="proposto",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with f() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps([_CENA])
        corte.cenas_validadas = 1
        corte.cenas_validadas_em = datetime(2026, 11, 3, 10, 0)
        await db.commit()
    yield f


async def _adicionar(fabrica, inicio: str, fim: str) -> Corte:
    async with fabrica() as db:
        await CorteService.adicionar_desvio(db, "c1", inicio, fim)
    async with fabrica() as db:
        return await db.get(Corte, "c1")


@pytest.mark.asyncio
async def test_adicionar_desvio_sobre_a_cena_desfaz_a_marca_na_hora(fabrica):
    corte = await _adicionar(fabrica, "00:02:05.000", "00:02:25.000")
    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None
    assert json.loads(corte.cenas_remotion)[0]["ancora_perdida"] is True


@pytest.mark.asyncio
async def test_adicionar_desvio_antes_da_cena_move_a_cena_e_mantem_a_marca(fabrica):
    corte = await _adicionar(fabrica, "00:01:50.000", "00:02:00.000")
    assert json.loads(corte.cenas_remotion)[0]["inicio"] == 20.0
    assert corte.cenas_validadas == 1


@pytest.mark.asyncio
async def test_adicionar_desvio_atualiza_a_transcricao_final(fabrica):
    antes = await _adicionar(fabrica, "00:01:50.000", "00:02:00.000")
    texto = antes.transcricao_final_texto
    assert "palavra10" not in texto.split()
    assert "palavra0" in texto.split()


@pytest.mark.asyncio
async def test_remover_desvio_continua_sincronizando(fabrica):
    await _adicionar(fabrica, "00:01:50.000", "00:02:00.000")
    async with fabrica() as db:
        await CorteService.remover_desvio(db, "c1", 0)
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
    assert json.loads(corte.cenas_remotion)[0]["inicio"] == 30.0
