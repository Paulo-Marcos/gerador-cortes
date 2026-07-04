"""F-061: divisão de um corte em dois preservando trechos a remover e tempos.

Cobre o serviço `CorteService.dividir_corte` e o endpoint
`POST /cortes/{id}/dividir`, exercitando um banco SQLite em memória real
(o split renumera cortes e fatia desvios — vale a pena ter persistência de
verdade em vez de mocks).
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.routers import cortes as cortes_router
from app.routers.cortes import DividirCorteRequest
from app.services import corte as corte_module
from app.services.corte import CorteService
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    """Banco em memória real; aponta o AsyncSessionLocal do serviço para ele."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    # dividir_corte e sincronizar_transcricao_corte usam o AsyncSessionLocal
    # importado no namespace do módulo `corte`.
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
def sem_resync(monkeypatch):
    """Neutraliza a re-sincronização da transcrição e registra os ids chamados.

    A sincronização real já tem cobertura própria; aqui só queremos confirmar
    que o split a dispara para os dois cortes resultantes.
    """
    chamados: list[str] = []

    async def _fake(corte_id, db=None):
        chamados.append(corte_id)

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))
    return chamados


async def _seed_corte(
    factory,
    *,
    corte_id="corte-1",
    numero=1,
    inicio_seg=0.0,
    fim_seg=100.0,
    inicio_hms="00:00:00.000",
    fim_hms="00:01:40.000",
    desvios=None,
    titulo="Tema A",
    is_leitura=0,
):
    async with factory() as db:
        if await db.get(Projeto, "proj-1") is None:
            db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="proj-1",
                numero=numero,
                titulo_proposto=titulo,
                inicio_hms=inicio_hms,
                fim_hms=fim_hms,
                inicio_seg=inicio_seg,
                fim_seg=fim_seg,
                desvios=json.dumps(desvios or []),
                is_leitura=is_leitura,
            )
        )
        await db.commit()


# ─── Serviço ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_encolhe_original_e_cria_segundo_corte(session_factory, sem_resync):
    await _seed_corte(session_factory)

    original_id, novo_id = await CorteService.dividir_corte("corte-1", 50.0)

    assert original_id == "corte-1"
    assert novo_id != "corte-1"

    async with session_factory() as db:
        original = await db.get(Corte, original_id)
        novo = await db.get(Corte, novo_id)

    assert original.fim_seg == 50.0
    assert original.fim_hms == "00:00:50.000"
    # O início do original não muda.
    assert original.inicio_seg == 0.0

    assert novo.projeto_id == "proj-1"
    assert novo.numero == 2
    assert novo.inicio_seg == 50.0
    assert novo.inicio_hms == "00:00:50.000"
    assert novo.fim_seg == 100.0
    assert novo.fim_hms == "00:01:40.000"
    assert novo.status == "proposto"


@pytest.mark.asyncio
async def test_particiona_desvios_sem_perder_nenhum(session_factory, sem_resync):
    desvios = [
        {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "antes"},
        {"inicio_seg": 45.0, "fim_seg": 55.0, "motivo": "cruza"},
        {"inicio_seg": 80.0, "fim_seg": 90.0, "motivo": "depois"},
    ]
    await _seed_corte(session_factory, desvios=desvios)

    original_id, novo_id = await CorteService.dividir_corte("corte-1", 50.0)

    async with session_factory() as db:
        esq = json.loads((await db.get(Corte, original_id)).desvios)
        dir = json.loads((await db.get(Corte, novo_id)).desvios)

    # antes + metade-esquerda de 'cruza' / metade-direita de 'cruza' + depois
    assert len(esq) == 2
    assert len(dir) == 2

    dur_original = sum(d["fim_seg"] - d["inicio_seg"] for d in desvios)
    dur_apos = sum(d["fim_seg"] - d["inicio_seg"] for d in esq + dir)
    assert dur_apos == pytest.approx(dur_original)

    # A fatia do desvio que cruza encaixa exatamente no ponto.
    assert esq[-1]["fim_seg"] == pytest.approx(50.0)
    assert dir[0]["inicio_seg"] == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_renumera_cortes_posteriores(session_factory, sem_resync):
    await _seed_corte(session_factory, corte_id="c1", numero=1)
    await _seed_corte(
        session_factory,
        corte_id="c2",
        numero=2,
        inicio_seg=100.0,
        fim_seg=200.0,
        inicio_hms="00:01:40.000",
        fim_hms="00:03:20.000",
    )
    await _seed_corte(
        session_factory,
        corte_id="c3",
        numero=3,
        inicio_seg=200.0,
        fim_seg=300.0,
        inicio_hms="00:03:20.000",
        fim_hms="00:05:00.000",
    )

    _, novo_id = await CorteService.dividir_corte("c1", 50.0)

    async with session_factory() as db:
        c1 = await db.get(Corte, "c1")
        c2 = await db.get(Corte, "c2")
        c3 = await db.get(Corte, "c3")
        novo = await db.get(Corte, novo_id)

    assert c1.numero == 1
    assert novo.numero == 2
    assert c2.numero == 3
    assert c3.numero == 4


@pytest.mark.asyncio
async def test_resync_disparado_para_os_dois_cortes(session_factory, sem_resync):
    await _seed_corte(session_factory)

    original_id, novo_id = await CorteService.dividir_corte("corte-1", 50.0)

    assert set(sem_resync) == {original_id, novo_id}


@pytest.mark.asyncio
async def test_herda_marca_de_leitura(session_factory, sem_resync):
    await _seed_corte(session_factory, is_leitura=1)

    _, novo_id = await CorteService.dividir_corte("corte-1", 50.0)

    async with session_factory() as db:
        novo = await db.get(Corte, novo_id)
    assert novo.is_leitura == 1
    assert novo.parte_leitura == 2


@pytest.mark.asyncio
async def test_ponto_fora_do_intervalo_levanta(session_factory, sem_resync):
    await _seed_corte(session_factory)

    with pytest.raises(ValueError):
        await CorteService.dividir_corte("corte-1", 100.0)  # == fim, sem margem
    with pytest.raises(ValueError):
        await CorteService.dividir_corte("corte-1", 0.0)  # == início, sem margem


@pytest.mark.asyncio
async def test_corte_inexistente_levanta(session_factory, sem_resync):
    with pytest.raises(ValueError):
        await CorteService.dividir_corte("nao-existe", 10.0)


# ─── Endpoint ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_retorna_original_e_novo(session_factory, sem_resync):
    await _seed_corte(session_factory)

    async with session_factory() as db:
        resposta = await cortes_router.dividir_corte(
            "corte-1", DividirCorteRequest(ponto_seg=50.0), db=db
        )

    assert len(resposta) == 2
    original, novo = resposta
    assert original["id"] == "corte-1"
    assert original["fim_seg"] == 50.0
    assert novo["inicio_seg"] == 50.0
    assert novo["numero"] == 2


@pytest.mark.asyncio
async def test_endpoint_aceita_ponto_hms(session_factory, sem_resync):
    await _seed_corte(session_factory)

    async with session_factory() as db:
        resposta = await cortes_router.dividir_corte(
            "corte-1", DividirCorteRequest(ponto_hms="00:00:50.000"), db=db
        )

    assert resposta[1]["inicio_seg"] == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_endpoint_400_sem_ponto(session_factory, sem_resync):
    await _seed_corte(session_factory)

    async with session_factory() as db:
        with pytest.raises(HTTPException) as exc:
            await cortes_router.dividir_corte("corte-1", DividirCorteRequest(), db=db)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_endpoint_404_corte_inexistente(session_factory, sem_resync):
    async with session_factory() as db:
        with pytest.raises(HTTPException) as exc:
            await cortes_router.dividir_corte(
                "nao-existe", DividirCorteRequest(ponto_seg=10.0), db=db
            )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_400_ponto_fora_do_intervalo(session_factory, sem_resync):
    await _seed_corte(session_factory)

    async with session_factory() as db:
        with pytest.raises(HTTPException) as exc:
            await cortes_router.dividir_corte(
                "corte-1", DividirCorteRequest(ponto_seg=999.0), db=db
            )
    assert exc.value.status_code == 400
