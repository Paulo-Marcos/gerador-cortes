"""D-078: handlers de mutação migrados do router para `CorteService`.

Cobre os 5 métodos extraídos (criar_manual, reordenar, criar_corte_do_desvio,
adicionar_desvio, remover_desvio) sobre um SQLite em memória real — eles
renumeram cortes e mexem na lista de desvios, então vale ter persistência de
verdade em vez de mocks. A re-sincronização de transcrição é neutralizada
(tem cobertura própria).
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.routers import cortes as cortes_router
from app.routers.cortes import CriarCorteManualRequest
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
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
def sem_resync(monkeypatch):
    """Neutraliza a re-sincronização da transcrição disparada por criar_manual."""

    async def _fake(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))


async def _seed_projeto(factory, *, duracao_segundos=1000.0):
    async with factory() as db:
        if await db.get(Projeto, "proj-1") is None:
            db.add(
                Projeto(
                    id="proj-1",
                    youtube_url="http://x",
                    transcricao_raw="[]",
                    duracao_segundos=duracao_segundos,
                )
            )
            await db.commit()


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
):
    async with factory() as db:
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
            )
        )
        await db.commit()


# ─── criar_manual ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_criar_manual_primeiro_corte(session_factory, sem_resync):
    await _seed_projeto(session_factory)

    async with session_factory() as db:
        corte = await CorteService.criar_manual(db, "proj-1", "00:00:10.000", "00:00:40.000")

    assert corte.numero == 1
    assert corte.status == "proposto"
    assert corte.inicio_seg == 10.0
    assert corte.fim_seg == 40.0
    assert corte.titulo_proposto == "Corte manual #1"


@pytest.mark.asyncio
async def test_criar_manual_insere_na_posicao_cronologica_e_renumera(session_factory, sem_resync):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=100.0)
    await _seed_corte(
        session_factory,
        corte_id="c2",
        numero=2,
        inicio_seg=200.0,
        fim_seg=300.0,
        inicio_hms="00:03:20.000",
        fim_hms="00:05:00.000",
    )

    async with session_factory() as db:
        novo = await CorteService.criar_manual(db, "proj-1", "00:01:40.000", "00:02:30.000")

    # Novo começa em 100s → entra como #2; o antigo #2 (inicio 200s) vira #3.
    assert novo.numero == 2
    async with session_factory() as db:
        assert (await db.get(Corte, "c1")).numero == 1
        assert (await db.get(Corte, "c2")).numero == 3


@pytest.mark.asyncio
async def test_criar_manual_fim_menor_que_inicio_levanta(session_factory, sem_resync):
    await _seed_projeto(session_factory)

    async with session_factory() as db:
        with pytest.raises(ValueError):
            await CorteService.criar_manual(db, "proj-1", "00:00:40.000", "00:00:10.000")


@pytest.mark.asyncio
async def test_criar_manual_projeto_inexistente_levanta(session_factory, sem_resync):
    async with session_factory() as db:
        with pytest.raises(ValueError, match="não encontrado"):
            await CorteService.criar_manual(db, "nao-existe", "00:00:10.000", "00:00:40.000")


# ─── reordenar ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reordenar_aplica_nova_ordem(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, corte_id="c1", numero=1)
    await _seed_corte(session_factory, corte_id="c2", numero=2)
    await _seed_corte(session_factory, corte_id="c3", numero=3)

    async with session_factory() as db:
        cortes = await CorteService.reordenar(db, "proj-1", ["c3", "c1", "c2"])

    assert [c.id for c in cortes] == ["c3", "c1", "c2"]
    assert [c.numero for c in cortes] == [1, 2, 3]


@pytest.mark.asyncio
async def test_reordenar_conjunto_de_ids_invalido_levanta(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, corte_id="c1", numero=1)
    await _seed_corte(session_factory, corte_id="c2", numero=2)

    async with session_factory() as db:
        with pytest.raises(ValueError):
            await CorteService.reordenar(db, "proj-1", ["c1"])  # falta c2


# ─── criar_corte_do_desvio ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_criar_corte_do_desvio_promove_e_remove(session_factory):
    await _seed_projeto(session_factory)
    desvios = [{"inicio_hms": "00:00:30.000", "fim_hms": "00:00:45.000", "motivo": "tangente"}]
    await _seed_corte(session_factory, desvios=desvios)

    async with session_factory() as db:
        novo = await CorteService.criar_corte_do_desvio(db, "corte-1", 0)

    assert novo.inicio_hms == "00:00:30.000"
    assert novo.fim_hms == "00:00:45.000"
    assert novo.numero == 2

    async with session_factory() as db:
        original = await db.get(Corte, "corte-1")
        assert json.loads(original.desvios) == []


@pytest.mark.asyncio
async def test_criar_corte_do_desvio_indice_invalido_levanta(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, desvios=[])

    async with session_factory() as db:
        with pytest.raises(ValueError):
            await CorteService.criar_corte_do_desvio(db, "corte-1", 0)


# ─── adicionar_desvio / remover_desvio ───────────────────────────────────────


@pytest.mark.asyncio
async def test_adicionar_desvio_ordena_por_inicio(session_factory):
    await _seed_projeto(session_factory)
    existente = [
        {"inicio_hms": "00:00:50.000", "fim_hms": "00:00:55.000", "inicio_seg": 50.0, "motivo": "a"}
    ]
    await _seed_corte(session_factory, desvios=existente)

    async with session_factory() as db:
        corte = await CorteService.adicionar_desvio(
            db, "corte-1", "00:00:10.000", "00:00:15.000", "manual novo"
        )

    desvios = json.loads(corte.desvios)
    assert [d["inicio_seg"] for d in desvios] == [10.0, 50.0]
    assert desvios[0]["origem"] == "manual"


@pytest.mark.asyncio
async def test_remover_desvio_remove_pelo_indice(session_factory):
    await _seed_projeto(session_factory)
    desvios = [
        {"inicio_hms": "00:00:10.000", "fim_hms": "00:00:15.000", "motivo": "a"},
        {"inicio_hms": "00:00:50.000", "fim_hms": "00:00:55.000", "motivo": "b"},
    ]
    await _seed_corte(session_factory, desvios=desvios)

    async with session_factory() as db:
        corte = await CorteService.remover_desvio(db, "corte-1", 0)

    restantes = json.loads(corte.desvios)
    assert len(restantes) == 1
    assert restantes[0]["motivo"] == "b"


@pytest.mark.asyncio
async def test_remover_desvio_indice_invalido_levanta(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, desvios=[])

    async with session_factory() as db:
        with pytest.raises(ValueError):
            await CorteService.remover_desvio(db, "corte-1", 5)


# ─── Endpoint: mapeamento ValueError → HTTPException ──────────────────────────


@pytest.mark.asyncio
async def test_endpoint_criar_manual_400_intervalo_invalido(session_factory, sem_resync):
    await _seed_projeto(session_factory)

    async with session_factory() as db:
        with pytest.raises(HTTPException) as exc:
            await cortes_router.criar_corte_manual(
                "proj-1",
                CriarCorteManualRequest(inicio_hms="00:00:40.000", fim_hms="00:00:10.000"),
                db=db,
            )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_endpoint_criar_manual_404_projeto_inexistente(session_factory, sem_resync):
    async with session_factory() as db:
        with pytest.raises(HTTPException) as exc:
            await cortes_router.criar_corte_manual(
                "nao-existe",
                CriarCorteManualRequest(inicio_hms="00:00:10.000", fim_hms="00:00:40.000"),
                db=db,
            )
    assert exc.value.status_code == 404
