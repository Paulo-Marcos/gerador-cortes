"""D-1096: "Gerar trechos de todos os cortes" pula os riscados; "Refazer transcrição" não.

Riscar (D-1088) deixa o corte no banco como `rejeitado`, com a proposta e o
trabalho, e solta a mídia. O lote do Workspace rodava a `trechos-expert` em
todos os cortes do projeto, riscados inclusive: IA paga por um corte que saiu.
Já a sincronia da transcrição é barata e inclui o riscado, para o corte trazido
de volta não ficar com a legenda velha (decisão do Paulo: "Gerar pula, Refazer
inclui").
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.services.corte import CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

STATUS = {
    "c1": StatusCorte.PROPOSTO,
    "c2": StatusCorte.REJEITADO,
    "c3": StatusCorte.APROVADO,
    "c4": StatusCorte.PROCESSADO,
}


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
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(Projeto(id="p2", youtube_url="u2"))
        for numero, (corte_id, status) in enumerate(STATUS.items(), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=status,
                )
            )
        db.add(Corte(id="outro", projeto_id="p2", numero=1, inicio_seg=0.0, fim_seg=60.0))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def chamados(monkeypatch) -> list[tuple[str, str]]:
    feitos: list[tuple[str, str]] = []

    async def gerar(corte_id, provider="claude"):
        feitos.append((corte_id, provider))
        return {}

    async def sem_espera(_segundos):
        return None

    monkeypatch.setattr(CorteService, "gerar_trechos_via_claude", staticmethod(gerar))
    monkeypatch.setattr("asyncio.sleep", sem_espera)
    return feitos


@pytest.mark.asyncio
async def test_gerar_trechos_de_todos_pula_o_corte_riscado(fabrica, chamados):
    await CorteService.analisar_desvios_todos_impl("p1", "gemini")

    assert sorted(corte_id for corte_id, _ in chamados) == ["c1", "c3", "c4"]
    assert {provider for _, provider in chamados} == {"gemini"}


@pytest.mark.asyncio
async def test_projeto_so_com_riscados_nao_chama_a_ia(fabrica, chamados):
    async with fabrica() as db:
        for corte_id in ("c1", "c3", "c4"):
            (await db.get(Corte, corte_id)).status = StatusCorte.REJEITADO
        await db.commit()

    await CorteService.analisar_desvios_todos_impl("p1")

    assert chamados == []


@pytest.mark.asyncio
async def test_refazer_transcricao_sincroniza_tambem_o_riscado(fabrica, monkeypatch):
    sincronizados: list[str] = []

    async def sincronizar(corte_id, _db, *, trans_raw=None):
        sincronizados.append(corte_id)

    monkeypatch.setattr(CorteService, "_exec_sincronia", staticmethod(sincronizar))
    async with fabrica() as db:
        (await db.get(Projeto, "p1")).transcricao_raw = json.dumps([{"start": 0, "end": 4}])
        await db.commit()
        total = await CorteService.sincronizar_transcricao_do_projeto("p1", db)

    assert sorted(sincronizados) == ["c1", "c2", "c3", "c4"]
    assert total == 4
