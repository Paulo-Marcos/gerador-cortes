"""D-076: extração de `CorteService.atualizar` do handler PATCH /cortes/{id}.

Exercita o serviço contra um SQLite em memória real (a atualização grava no
banco, normaliza cenas e invalida a marca `cenas_validadas` — vale ter
persistência de verdade em vez de mocks).
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import AtualizarCorteDTO, CorteService
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
    # sincronizar_transcricao_corte usa o AsyncSessionLocal do módulo `corte`.
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
def sem_resync(monkeypatch):
    """Neutraliza a re-sincronização da transcrição e registra os ids chamados.

    A sincronização real tem cobertura própria; aqui só queremos confirmar
    quando `atualizar` a dispara (mudança de desvios/início/fim).
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
    cenas_remotion="[]",
    cenas_validadas=0,
):
    async with factory() as db:
        if await db.get(Projeto, "proj-1") is None:
            db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="Tema A",
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                inicio_seg=0.0,
                fim_seg=100.0,
                desvios="[]",
                status="proposto",
                cenas_remotion=cenas_remotion,
                cenas_validadas=cenas_validadas,
            )
        )
        await db.commit()


@pytest.mark.asyncio
async def test_atualiza_campos_escalares(session_factory, sem_resync):
    await _seed_corte(session_factory)

    async with session_factory() as db:
        corte = await CorteService.atualizar(
            db,
            "corte-1",
            AtualizarCorteDTO(titulo_proposto="Novo Título", status="aprovado"),
        )
        assert corte.titulo_proposto == "Novo Título"

    async with session_factory() as db:
        salvo = await db.get(Corte, "corte-1")
    assert salvo.titulo_proposto == "Novo Título"
    assert salvo.status == "aprovado"
    # Sem mexer em desvios/início/fim, não dispara re-sincronização.
    assert sem_resync == []


@pytest.mark.asyncio
async def test_corte_inexistente_levanta(session_factory, sem_resync):
    async with session_factory() as db:
        with pytest.raises(ValueError, match="não encontrado"):
            await CorteService.atualizar(db, "nao-existe", AtualizarCorteDTO())


@pytest.mark.asyncio
async def test_colapso_de_cenas_bloqueia_salvamento(session_factory, sem_resync):
    await _seed_corte(session_factory)

    cenas_colapsadas = [{"tipo": "card", "inicio_seg": 10.0, "fim_seg": 20.0} for _ in range(3)]
    with pytest.raises(ValueError, match="Salvamento bloqueado"):
        async with session_factory() as db:
            await CorteService.atualizar(
                db, "corte-1", AtualizarCorteDTO(cenas_remotion=cenas_colapsadas)
            )


@pytest.mark.asyncio
async def test_mudanca_de_cenas_invalida_marca_validada(session_factory, sem_resync):
    await _seed_corte(
        session_factory,
        cenas_remotion=json.dumps([{"tipo": "card", "inicio_seg": 0.0, "fim_seg": 5.0}]),
        cenas_validadas=1,
    )

    nova_cena = [{"tipo": "card", "inicio_seg": 30.0, "fim_seg": 40.0}]
    async with session_factory() as db:
        await CorteService.atualizar(db, "corte-1", AtualizarCorteDTO(cenas_remotion=nova_cena))

    async with session_factory() as db:
        salvo = await db.get(Corte, "corte-1")
    assert salvo.cenas_validadas == 0
    assert salvo.cenas_validadas_em is None


@pytest.mark.asyncio
async def test_cenas_iguais_preservam_marca_validada(session_factory, sem_resync):
    cena = {"tipo": "card", "inicio": 10.0, "fim": 20.0, "inicio_seg": 10.0, "fim_seg": 20.0}
    await _seed_corte(
        session_factory,
        cenas_remotion=json.dumps([cena]),
        cenas_validadas=1,
    )

    # Reenvia exatamente o mesmo payload (normalização é idempotente).
    async with session_factory() as db:
        await CorteService.atualizar(db, "corte-1", AtualizarCorteDTO(cenas_remotion=[cena]))

    async with session_factory() as db:
        salvo = await db.get(Corte, "corte-1")
    assert salvo.cenas_validadas == 1


@pytest.mark.asyncio
async def test_mudanca_de_desvios_dispara_resync(session_factory, sem_resync):
    await _seed_corte(session_factory)

    desvios = [{"inicio_hms": "00:00:10.000", "fim_hms": "00:00:20.000", "motivo": "x"}]
    async with session_factory() as db:
        await CorteService.atualizar(db, "corte-1", AtualizarCorteDTO(desvios=desvios))

    assert sem_resync == ["corte-1"]
