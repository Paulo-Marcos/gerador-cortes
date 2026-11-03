"""Um corte que falha na ressincronia do projeto não derruba os demais (D-1029).

O `rollback` do retry de "database is locked" expira TODOS os objetos da
sessão, inclusive os outros cortes que o laço ainda vai visitar; ler `corte.id`
de um deles pedia ao banco, fora do contexto assíncrono, e estourava
`MissingGreenlet` — o erro real (o lock) sumia atrás dele.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import CorteService
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

FALAS = [{"inicio": float(i), "fim": float(i) + 1.0, "texto": f"fala {i}"} for i in range(0, 200)]


@pytest_asyncio.fixture
async def sessao(tmp_path, monkeypatch):
    async def sem_espera(_segundos):
        return None

    monkeypatch.setattr(corte_module.asyncio, "sleep", sem_espera)
    motor = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with motor.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Sessao = async_sessionmaker(motor, expire_on_commit=False)
    async with Sessao() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="https://youtu.be/p1",
                titulo_live="Live",
                transcricao_raw=json.dumps(FALAS),
            )
        )
        for i in range(3):
            db.add(
                Corte(
                    id=f"c{i}",
                    projeto_id="p1",
                    numero=i + 1,
                    titulo_proposto=f"Corte {i}",
                    inicio_hms="00:00:10",
                    fim_hms="00:01:00",
                    inicio_seg=10.0 + i,
                    fim_seg=60.0 + i,
                )
            )
        await db.commit()
    yield Sessao
    await motor.dispose()


def _falhar_o_commit(db, mensagem: str, vezes: int):
    """Faz os próximos `vezes` commits falharem, como o SQLite sob escrita concorrente."""
    commit_real = db.commit
    restantes = {"n": vezes}

    async def commit():
        if restantes["n"] > 0:
            restantes["n"] -= 1
            raise OperationalError("COMMIT", {}, Exception(mensagem))
        await commit_real()

    db.commit = commit


async def _sincronizados(Sessao) -> list[bool]:
    async with Sessao() as db:
        return [bool((await db.get(Corte, f"c{i}")).transcricao_final_texto) for i in range(3)]


@pytest.mark.asyncio
async def test_lock_transitorio_num_corte_nao_derruba_os_outros(sessao):
    async with sessao() as db:
        _falhar_o_commit(db, "database is locked", vezes=1)

        total = await CorteService.sincronizar_transcricao_do_projeto("p1", db)

    assert total == 3
    assert await _sincronizados(sessao) == [True, True, True]


@pytest.mark.asyncio
async def test_corte_que_falha_de_vez_nao_impede_os_demais_nem_esconde_o_erro(sessao):
    async with sessao() as db:
        # Só o primeiro corte falha: erro que não é lock não tem retry.
        _falhar_o_commit(db, "disk I/O error", vezes=1)

        with pytest.raises(OperationalError, match="disk I/O error"):
            await CorteService.sincronizar_transcricao_do_projeto("p1", db)

    assert await _sincronizados(sessao) == [False, True, True]
