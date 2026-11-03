"""D-1018: banco travado na sincronia não apaga o que outra sessão gravou nas cenas."""

import json

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


def _cena(inicio: float, texto: str) -> dict:
    return {"tipo": "enfase", "texto": texto, "inicio": inicio, "fim": inicio + 5}


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
    yield f


async def _gravar(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


async def _cenas(fabrica) -> list[dict]:
    async with fabrica() as db:
        return json.loads((await db.get(Corte, "c1")).cenas_remotion)


@pytest.mark.parametrize("cena_inicial", [30.0, 5.0], ids=["cena_movida", "cena_parada"])
@pytest.mark.asyncio
async def test_a_nova_tentativa_parte_do_que_a_outra_sessao_gravou(
    fabrica, monkeypatch, cena_inicial
):
    await _gravar(
        fabrica,
        cenas_remotion=json.dumps([_cena(cena_inicial, "antes")]),
        desvios=json.dumps([{"inicio_seg": 110.0, "fim_seg": 120.0, "tipo": "desvio"}]),
    )
    original = AsyncSession.commit
    falhas = {"restantes": 1}

    async def commit_travado(sessao):
        if falhas["restantes"]:
            falhas["restantes"] -= 1
            raise RuntimeError("database is locked")
        await original(sessao)

    async def outra_sessao_grava_durante_a_espera(_segundos):
        monkeypatch.setattr(AsyncSession, "commit", original)
        await _gravar(fabrica, cenas_remotion=json.dumps([_cena(cena_inicial, "editada")]))
        monkeypatch.setattr(AsyncSession, "commit", commit_travado)

    monkeypatch.setattr(AsyncSession, "commit", commit_travado)
    monkeypatch.setattr(corte_module.asyncio, "sleep", outra_sessao_grava_durante_a_espera)
    await CorteService.sincronizar_transcricao_corte("c1")
    monkeypatch.setattr(AsyncSession, "commit", original)

    cenas = await _cenas(fabrica)
    assert cenas[0]["texto"] == "editada"
    assert cenas[0]["inicio"] == (20.0 if cena_inicial == 30.0 else 5.0)
