"""D-448: a lista de cortes segue a live, não a ordem de criação.

Cobre os pontos onde a desordem nascia — corte criado a partir de um desvio,
análise aditiva, edição do início — e o novo contrato do gesto manual: mover um
corte GRAVA um pin, e soltar o pin devolve a lista ao tempo.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


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
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
def sem_resync(monkeypatch):
    async def _fake(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))


async def _seed_projeto(factory):
    async with factory() as db:
        db.add(
            Projeto(
                id="proj-1", youtube_url="http://x", transcricao_raw="[]", duracao_segundos=5000.0
            )
        )
        await db.commit()


async def _seed_corte(factory, corte_id, numero, inicio_seg, fim_seg, desvios=None):
    async with factory() as db:
        db.add(
            Corte(
                id=corte_id,
                projeto_id="proj-1",
                numero=numero,
                inicio_hms="00:00:00.000",
                fim_hms="00:00:00.000",
                inicio_seg=inicio_seg,
                fim_seg=fim_seg,
                desvios=json.dumps(desvios or []),
            )
        )
        await db.commit()


async def _ordem(factory) -> list[str]:
    async with factory() as db:
        result = await db.execute(
            select(Corte).where(Corte.projeto_id == "proj-1").order_by(Corte.numero)
        )
        return [c.id for c in result.scalars().all()]


@pytest.mark.asyncio
async def test_renumerar_corrige_lista_desordenada(session_factory):
    await _seed_projeto(session_factory)
    # Estado que o banco acumulou: numeração pela ordem de criação.
    await _seed_corte(session_factory, "tarde", 1, 900.0, 1000.0)
    await _seed_corte(session_factory, "cedo", 2, 10.0, 100.0)
    await _seed_corte(session_factory, "meio", 3, 400.0, 500.0)

    async with session_factory() as db:
        await CorteService.renumerar_por_tempo(db, "proj-1")

    assert await _ordem(session_factory) == ["cedo", "meio", "tarde"]


@pytest.mark.asyncio
async def test_corte_do_desvio_entra_na_posicao_cronologica(session_factory):
    await _seed_projeto(session_factory)
    # O desvio está no primeiro corte, aos 30s — o corte gerado dele começa
    # ANTES do segundo corte, e antes do D-448 ia parar no fim da lista.
    await _seed_corte(
        session_factory,
        "c1",
        1,
        0.0,
        100.0,
        desvios=[{"inicio_hms": "00:00:30.000", "fim_hms": "00:00:45.000", "motivo": "tangente"}],
    )
    await _seed_corte(session_factory, "c2", 2, 200.0, 300.0)

    async with session_factory() as db:
        novo = await CorteService.criar_corte_do_desvio(db, "c1", 0)

    assert await _ordem(session_factory) == ["c1", novo.id, "c2"]


@pytest.mark.asyncio
async def test_mover_o_corte_na_mao_grava_o_pin_so_de_quem_moveu(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)
    await _seed_corte(session_factory, "c", 3, 200.0, 250.0)

    async with session_factory() as db:
        await CorteService.reordenar(db, "proj-1", ["c", "a", "b"])

    async with session_factory() as db:
        assert (await db.get(Corte, "c")).posicao_fixada == 1
        # a e b só foram empurrados — continuam seguindo o tempo.
        assert (await db.get(Corte, "a")).posicao_fixada is None
        assert (await db.get(Corte, "b")).posicao_fixada is None


@pytest.mark.asyncio
async def test_corte_novo_entra_na_cronologia_sem_desfazer_o_pin(session_factory, sem_resync):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)

    async with session_factory() as db:
        await CorteService.reordenar(db, "proj-1", ["b", "a"])
        # Corte manual bem no começo da live: entra antes de "a" (cronologia
        # entre os livres), enquanto "b" permanece onde o editor o fixou.
        novo = await CorteService.criar_manual(db, "proj-1", "00:00:01.000", "00:00:05.000")

    assert await _ordem(session_factory) == ["b", novo.id, "a"]


@pytest.mark.asyncio
async def test_normalizar_solta_todos_os_pins(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)

    async with session_factory() as db:
        await CorteService.reordenar(db, "proj-1", ["b", "a"])
        await CorteService.normalizar_ordem(db, "proj-1")

    assert await _ordem(session_factory) == ["a", "b"]
    async with session_factory() as db:
        assert (await db.get(Corte, "b")).posicao_fixada is None


@pytest.mark.asyncio
async def test_fixar_posicao_de_um_corte_so(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)
    await _seed_corte(session_factory, "c", 3, 200.0, 250.0)

    async with session_factory() as db:
        await CorteService.fixar_posicao(db, "c", 1)

    assert await _ordem(session_factory) == ["c", "a", "b"]


@pytest.mark.asyncio
async def test_fixar_posicao_fora_da_lista_e_recusada(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)

    async with session_factory() as db:
        with pytest.raises(ValueError, match="entre 1 e 1"):
            await CorteService.fixar_posicao(db, "a", 4)


@pytest.mark.asyncio
async def test_soltar_o_pin_de_um_corte_devolve_ao_tempo(session_factory):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)

    async with session_factory() as db:
        await CorteService.fixar_posicao(db, "b", 1)
        await CorteService.fixar_posicao(db, "b", None)

    assert await _ordem(session_factory) == ["a", "b"]


@pytest.mark.asyncio
async def test_mudar_o_inicio_do_corte_reordena_a_lista(session_factory, sem_resync):
    await _seed_projeto(session_factory)
    await _seed_corte(session_factory, "a", 1, 10.0, 50.0)
    await _seed_corte(session_factory, "b", 2, 100.0, 150.0)

    async with session_factory() as db:
        await CorteService.atualizar(
            db, "a", corte_module.AtualizarCorteDTO(inicio_seg=500.0, fim_seg=600.0)
        )

    assert await _ordem(session_factory) == ["b", "a"]
