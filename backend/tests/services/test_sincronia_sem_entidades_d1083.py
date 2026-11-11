"""D-1083: a sincronia grava as três colunas do corte sem as entidades HTML do VTT.

A `transcricao_raw` de um projeto ingerido pelo VTT antes da correção tem a máscara
de palavrão como `[&nbsp;__&nbsp;]`. A sincronia é o único produtor da
`transcricao_corte`, da `transcricao_final` e da `transcricao_final_texto`, e é delas
que a IA de metadados e a de cenas leem.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LIVE_ESCAPADA = [
    {"start": 100.0, "end": 104.0, "texto": "não é [&nbsp;__&nbsp;] velho"},
    {"start": 104.0, "end": 108.0, "texto": "&gt;&gt; P&amp;D de verdade"},
]
_TEXTOS_LIMPOS = ["não é [ __ ] velho", ">> P&D de verdade"]


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
        raw = json.dumps(_LIVE_ESCAPADA, ensure_ascii=False)
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=raw))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=100.0,
                fim_seg=108.0,
                status="proposto",
            )
        )
        await db.commit()
    yield f


@pytest.mark.asyncio
async def test_sincronia_grava_as_tres_colunas_decodificadas(fabrica):
    await CorteService.sincronizar_transcricao_corte("c1")

    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
    corte_bruto = [linha["texto"] for linha in json.loads(corte.transcricao_corte)]
    final = [linha["texto"] for linha in json.loads(corte.transcricao_final)]
    assert corte_bruto == _TEXTOS_LIMPOS
    assert final == _TEXTOS_LIMPOS
    assert corte.transcricao_final_texto == " ".join(_TEXTOS_LIMPOS)
