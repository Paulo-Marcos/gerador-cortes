"""D-999: a telemetria soma "o que você mudou" por origem, e o voto saiu do app.

Banco SQLite em memória; o service lê cortes e snapshots (vivos e apagados)
como a tela de Análises e o export cross-projeto leem.
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest
import pytest_asyncio
from app.main import app
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.services.telemetria_cortes import TelemetriaCortesService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def fabrica():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", titulo_live="Live"))
        # c1: proposto pelo Claude, começo puxado 15 s para trás.
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=85.0,
                fim_seg=700.0,
                status=StatusCorte.APROVADO,
                desvios="[]",
            )
        )
        db.add(
            CorteSnapshot(
                id="s1",
                corte_id="c1",
                projeto_id="p1",
                inicio_seg=100.0,
                fim_seg=700.0,
                desvios="[]",
                origem_analise="claude",
            )
        )
        # c2: proposto pelo Gemini e mantido como veio.
        db.add(
            Corte(
                id="c2",
                projeto_id="p1",
                numero=2,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
                desvios="[]",
            )
        )
        db.add(
            CorteSnapshot(
                id="s2",
                corte_id="c2",
                projeto_id="p1",
                inicio_seg=0.0,
                fim_seg=60.0,
                desvios="[]",
                origem_analise="gemini",
            )
        )
        # Proposta do Claude que o operador apagou com motivo (D-993).
        db.add(
            CorteSnapshot(
                id="s3",
                corte_id="c-apagado",
                projeto_id="p1",
                origem_analise="claude",
                apagado_em=datetime(2026, 10, 1),
                motivo_apagado="repetido",
                desvios=json.dumps([]),
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.mark.asyncio
async def test_telemetria_do_projeto_traz_mudancas_por_corte_e_por_origem(fabrica):
    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    por_corte = {corte["corte_id"]: corte["mudancas"] for corte in telemetria["cortes"]}
    assert [m["descricao"] for m in por_corte["c1"]] == ["Começo esticado em 15 s"]
    assert por_corte["c2"] == []

    por_origem = {grupo["origem"]: grupo for grupo in telemetria["mudancas_por_origem"]}
    assert por_origem["claude"]["por_tipo"]["inicio_esticado"] == 1
    assert por_origem["claude"]["apagados"]["por_motivo"]["repetido"] == 1
    assert por_origem["gemini"]["sem_mudanca"] == 1


@pytest.mark.asyncio
async def test_export_agregado_soma_as_mudancas_de_todas_as_lives(fabrica):
    async with fabrica() as db:
        linhas = await TelemetriaCortesService.telemetria_agregada(db)
        resumo = (await TelemetriaCortesService.exportacao_json(db, linhas))["mudancas_por_origem"]

    assert {grupo["origem"]: grupo["cortes"] for grupo in resumo} == {"claude": 1, "gemini": 1}
    assert next(g for g in resumo if g["origem"] == "claude")["apagados"]["total"] == 1


def test_as_rotas_do_voto_sairam_do_app():
    caminhos = [getattr(rota, "path", "") for rota in app.routes]

    assert not any(caminho.startswith("/api/avaliacao-cortes") for caminho in caminhos)
    assert not any(caminho.endswith("/voto-qualidade") for caminho in caminhos)
