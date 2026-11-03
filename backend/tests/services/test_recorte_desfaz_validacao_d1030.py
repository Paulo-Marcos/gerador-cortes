"""D-1030 (RN-36): recorte que tira a frase de uma cena desfaz a marca de cenas validadas.

Decisão do dono: "Sim, desfazer". O operador validou aquela cena sobre aquela fala; sem a
fala, a validação não vale mais. Mover a cena junto com a frase não muda o que foi validado.
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
_ANTES_DA_CENA = [{"inicio_seg": 110.0, "fim_seg": 120.0, "tipo": "desvio"}]
_SOBRE_A_CENA = [{"inicio_seg": 125.0, "fim_seg": 145.0, "tipo": "desvio"}]


def _cena(inicio: float, **campos) -> dict:
    return {"tipo": "enfase", "texto": "Tese", "inicio": inicio, "fim": inicio + 5, **campos}


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


async def _validar_e_recortar(fabrica, cenas: list[dict], desvios: list[dict]) -> Corte:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps(cenas)
        corte.cenas_validadas = 1
        corte.cenas_validadas_em = datetime(2026, 11, 3, 10, 0)
        corte.desvios = json.dumps(desvios)
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with fabrica() as db:
        return await db.get(Corte, "c1")


@pytest.mark.asyncio
async def test_recorte_que_tira_a_frase_desfaz_a_marca(fabrica):
    corte = await _validar_e_recortar(fabrica, [_cena(30.0)], _SOBRE_A_CENA)
    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None
    assert json.loads(corte.cenas_remotion)[0]["ancora_perdida"] is True


@pytest.mark.asyncio
async def test_recorte_que_so_move_a_cena_mantem_a_marca(fabrica):
    corte = await _validar_e_recortar(fabrica, [_cena(30.0)], _ANTES_DA_CENA)
    assert json.loads(corte.cenas_remotion)[0]["inicio"] == 20.0
    assert corte.cenas_validadas == 1
    assert corte.cenas_validadas_em is not None


@pytest.mark.asyncio
async def test_sincronizar_sem_mudar_a_fala_mantem_a_marca(fabrica):
    corte = await _validar_e_recortar(fabrica, [_cena(30.0)], [])
    assert corte.cenas_validadas == 1


@pytest.mark.asyncio
async def test_cena_que_ja_tinha_perdido_a_frase_nao_desfaz_de_novo(fabrica):
    # O operador validou sabendo do aviso: um recorte que não tira mais nenhuma frase mantém.
    ja_perdida = _cena(50.0, ancora_perdida=True, frase_ancora="uma frase que saiu antes")
    corte = await _validar_e_recortar(fabrica, [_cena(30.0), ja_perdida], _ANTES_DA_CENA)
    assert corte.cenas_validadas == 1


@pytest.mark.asyncio
async def test_a_frase_que_volta_nao_devolve_a_marca(fabrica):
    corte = await _validar_e_recortar(fabrica, [_cena(30.0)], _SOBRE_A_CENA)
    assert corte.cenas_validadas == 0
    async with fabrica() as db:
        registro = await db.get(Corte, "c1")
        registro.desvios = "[]"
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    async with fabrica() as db:
        volta = await db.get(Corte, "c1")
    assert "ancora_perdida" not in json.loads(volta.cenas_remotion)[0]
    assert volta.cenas_validadas == 0


@pytest.mark.asyncio
async def test_banco_travado_nao_perde_o_desfazer(fabrica, monkeypatch):
    original = AsyncSession.commit
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps([_cena(30.0)])
        corte.cenas_validadas = 1
        corte.desvios = json.dumps(_SOBRE_A_CENA)
        await db.commit()
    falhas = {"restantes": 1}

    async def commit_travado(sessao):
        if falhas["restantes"]:
            falhas["restantes"] -= 1
            raise RuntimeError("database is locked")
        await original(sessao)

    async def sem_espera(_segundos):
        return None

    monkeypatch.setattr(AsyncSession, "commit", commit_travado)
    monkeypatch.setattr(corte_module.asyncio, "sleep", sem_espera)
    await CorteService.sincronizar_transcricao_corte("c1")
    monkeypatch.setattr(AsyncSession, "commit", original)
    async with fabrica() as db:
        assert (await db.get(Corte, "c1")).cenas_validadas == 0
