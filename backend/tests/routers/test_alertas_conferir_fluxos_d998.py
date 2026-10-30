"""D-998, auditoria do PR #279: dividir, juntar e o modo manual levam o alerta.

Juntar apagava o segundo corte com os alertas dele; dividir deixava todos na
metade original; o modo manual removia a imprecisão como desvio. Banco em
memória, mesma fixture dos testes da D-998.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.services.corte import CorteService
from app.services.desvios import DesviosService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_TRANSCRICAO = [
    {"start": 0.0, "end": 30.0, "texto": "abertura"},
    {"start": 30.0, "end": 40.0, "texto": "repete a tese"},
    {"start": 60.0, "end": 70.0, "texto": "quarenta por cento dos casos"},
    {"start": 70.0, "end": 120.0, "texto": "fechamento"},
]


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
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_TRANSCRICAO)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:02:00",
                inicio_seg=0.0,
                fim_seg=120.0,
                transcricao_corte=json.dumps(_TRANSCRICAO),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


def _alerta(inicio: float, fim: float, motivo: str) -> dict:
    return {
        "id": f"{round(inicio * 1000)}-{round(fim * 1000)}",
        "inicio_seg": inicio,
        "fim_seg": fim,
        "motivo": motivo,
        "origem": "claude",
        "conferido": False,
    }


async def _gravar_alertas(fabrica, corte_id: str, alertas: list) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, corte_id)
        corte.alertas_conferir = json.dumps(alertas)
        await db.commit()


@pytest.mark.asyncio
async def test_dividir_o_corte_leva_cada_alerta_para_a_sua_metade(fabrica):
    await _gravar_alertas(fabrica, "c1", [_alerta(60, 70, "antes"), _alerta(100, 110, "depois")])

    original_id, novo_id = await CorteService.dividir_corte("c1", 80.0)

    async with fabrica() as db:
        original = await db.get(Corte, original_id)
        novo = await db.get(Corte, novo_id)
    assert [a["motivo"] for a in json.loads(original.alertas_conferir)] == ["antes"]
    assert [a["motivo"] for a in json.loads(novo.alertas_conferir)] == ["depois"]


@pytest.mark.asyncio
async def test_juntar_os_cortes_mantem_os_alertas_do_corte_apagado(fabrica):
    await CorteService.dividir_corte("c1", 80.0)
    async with fabrica() as db:
        cortes = (await db.execute(select(Corte).order_by(Corte.inicio_seg))).scalars().all()
        primeiro_id, segundo_id = cortes[0].id, cortes[1].id
    await _gravar_alertas(fabrica, primeiro_id, [_alerta(60, 70, "do primeiro")])
    await _gravar_alertas(fabrica, segundo_id, [_alerta(100, 110, "do segundo")])

    sobrevivente = await CorteService.juntar_cortes(primeiro_id, segundo_id)

    async with fabrica() as db:
        corte = await db.get(Corte, sobrevivente)
    assert [a["motivo"] for a in json.loads(corte.alertas_conferir)] == [
        "do primeiro",
        "do segundo",
    ]


@pytest.mark.asyncio
async def test_imprecisao_importada_no_modo_manual_vira_alerta_e_fica_no_corte(fabrica):
    trechos = [
        {"inicio_hms": "00:00:30", "fim_hms": "00:00:40", "tipo": "REPETICAO", "motivo": "repete"},
        {
            "inicio_hms": "00:01:00",
            "fim_hms": "00:01:10",
            "tipo": "IMPRECISAO",
            "motivo": "Possível imprecisão — cita 40% sem fonte",
        },
    ]

    await DesviosService.importar_resultado("c1", trechos, origem="manual")

    corte = await _corte(fabrica)
    assert [d["motivo"] for d in json.loads(corte.desvios)] == ["repete"]
    assert [a["motivo"] for a in json.loads(corte.alertas_conferir)] == [
        "Possível imprecisão — cita 40% sem fonte"
    ]
