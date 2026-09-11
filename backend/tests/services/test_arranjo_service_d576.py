"""D-576: o serviço que grava a ordem dos blocos.

Banco SQLite em memória real — mesmo molde de `test_avaliacao_cortes_router.py`.
O que se testa aqui é a costura: carregar, aplicar a operação pura, reconciliar,
validar e gravar. A regra em si já está coberta em `tests/domain`.
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, StatusProjeto
from app.services import arranjo as arranjo_service
from app.services import corte as corte_service
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

CORTE_ID = "corte-1"


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(arranjo_service, "AsyncSessionLocal", factory)
    # A sincronização da transcrição abre a PRÓPRIA sessão: sem este patch ela
    # iria ao banco de verdade quando a ordem mudasse.
    monkeypatch.setattr(corte_service, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def corte_de_8min(session_factory) -> str:
    """O corte do enunciado: 8 minutos, com um silêncio de 50s no primeiro terço."""
    async with session_factory() as db:
        db.add(
            Projeto(
                id="proj-1",
                youtube_url="https://www.youtube.com/watch?v=abc123",
                canal_origem="Canal",
                status=StatusProjeto.PRONTO,
                duracao_segundos=7200.0,
            )
        )
        db.add(
            Corte(
                id=CORTE_ID,
                projeto_id="proj-1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:08:00",
                inicio_seg=0.0,
                fim_seg=480.0,
                desvios=json.dumps([{"inicio_seg": 100.0, "fim_seg": 150.0, "motivo": "silêncio"}]),
            )
        )
        await db.commit()
    return CORTE_ID


async def _arranjo_gravado(session_factory) -> list[dict]:
    async with session_factory() as db:
        corte = await db.get(Corte, CORTE_ID)
        return json.loads(corte.arranjo_blocos or "[]")


@pytest.mark.asyncio
async def test_corte_novo_aparece_como_um_bloco_cronologico(corte_de_8min):
    resposta = await arranjo_service.obter(corte_de_8min)

    assert resposta["cronologico"] is True
    assert len(resposta["blocos"]) == 1
    assert resposta["blocos"][0]["duracao_seg"] == 480.0
    # 480s de span, 50s de silêncio removido.
    assert resposta["blocos"][0]["duracao_liquida_seg"] == 430.0


@pytest.mark.asyncio
async def test_dividir_cria_a_junta_sem_baguncar_a_ordem(corte_de_8min, session_factory):
    resposta = await arranjo_service.dividir(corte_de_8min, 180.0)

    assert [b["inicio_seg"] for b in resposta["blocos"]] == [0.0, 180.0]
    assert resposta["cronologico"] is True
    assert len(await _arranjo_gravado(session_factory)) == 2


@pytest.mark.asyncio
async def test_o_caso_do_paulo_ponta_a_ponta(corte_de_8min, session_factory):
    """[A][B][C] → [C][A][B], gravado e refletido na resposta."""
    await arranjo_service.dividir(corte_de_8min, 180.0)
    await arranjo_service.dividir(corte_de_8min, 300.0)
    resposta = await arranjo_service.mover(corte_de_8min, 2, 0)

    assert [b["inicio_seg"] for b in resposta["blocos"]] == [300.0, 0.0, 180.0]
    assert resposta["cronologico"] is False
    assert [b["inicio_seg"] for b in await _arranjo_gravado(session_factory)] == [300.0, 0.0, 180.0]


@pytest.mark.asyncio
async def test_reordenar_nao_muda_a_duracao_total(corte_de_8min):
    await arranjo_service.dividir(corte_de_8min, 180.0)
    antes = sum(
        b["duracao_liquida_seg"] for b in (await arranjo_service.obter(corte_de_8min))["blocos"]
    )
    depois_resposta = await arranjo_service.mover(corte_de_8min, 1, 0)
    depois = sum(b["duracao_liquida_seg"] for b in depois_resposta["blocos"])

    assert antes == depois == 430.0


@pytest.mark.asyncio
async def test_fundir_desfaz_a_divisao(corte_de_8min):
    await arranjo_service.dividir(corte_de_8min, 180.0)
    resposta = await arranjo_service.fundir(corte_de_8min, 0)

    assert [(b["inicio_seg"], b["fim_seg"]) for b in resposta["blocos"]] == [(0.0, 480.0)]


@pytest.mark.asyncio
async def test_restaurar_esquece_blocos_e_ordem(corte_de_8min, session_factory):
    await arranjo_service.dividir(corte_de_8min, 180.0)
    await arranjo_service.mover(corte_de_8min, 1, 0)

    resposta = await arranjo_service.restaurar(corte_de_8min)

    assert resposta["cronologico"] is True
    assert len(resposta["blocos"]) == 1
    assert await _arranjo_gravado(session_factory) == []


@pytest.mark.asyncio
async def test_dividir_fora_de_qualquer_bloco_nao_quebra(corte_de_8min):
    resposta = await arranjo_service.dividir(corte_de_8min, 9000.0)
    assert len(resposta["blocos"]) == 1


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_erro_de_valor(session_factory):
    with pytest.raises(ValueError, match="não encontrado"):
        await arranjo_service.obter("nao-existe")
