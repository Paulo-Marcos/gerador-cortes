"""Migration 009: o snapshot da proposta sobrevive ao corte (D-993).

Banco antigo, como a PROD: `corte_snapshots.corte_id` é FK para `cortes.id`, há
um snapshot de corte vivo e um já órfão (corte apagado antes desta demanda).
A migration solta a FK sem perder linha e preenche o projeto de quem ainda tem
corte.
"""

import pytest
import pytest_asyncio
from app.migrations import migration_009_snapshot_sobrevive_ao_corte, reconciliacao
from app.migrations.migration_009_snapshot_sobrevive_ao_corte import ddl_sem_fk
from app.models import CorteSnapshot
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def conn():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conexao:
        yield conexao
    await engine.dispose()


async def _banco_antigo(conn) -> None:
    await conn.execute(
        text("CREATE TABLE cortes (id VARCHAR(36) PRIMARY KEY, projeto_id VARCHAR(36))")
    )
    await conn.execute(
        text(
            "CREATE TABLE corte_snapshots (id VARCHAR(36) NOT NULL, "
            "corte_id VARCHAR(36) NOT NULL, titulo_proposto VARCHAR(500) NOT NULL, "
            "PRIMARY KEY (id), FOREIGN KEY(corte_id) REFERENCES cortes (id))"
        )
    )
    await conn.execute(
        text("CREATE UNIQUE INDEX ix_corte_snapshots_corte_id ON corte_snapshots (corte_id)")
    )
    await conn.execute(text("INSERT INTO cortes (id, projeto_id) VALUES ('vivo', 'p1')"))
    await conn.execute(
        text(
            "INSERT INTO corte_snapshots (id, corte_id, titulo_proposto) "
            "VALUES ('s1', 'vivo', 'Fica'), ('s2', 'orfao', 'Já órfão')"
        )
    )
    # Como no boot: a reconciliação acrescenta as colunas novas antes das migrations.
    await reconciliacao.reconciliar_schema(conn)


async def _migrar(conn) -> None:
    await migration_009_snapshot_sobrevive_ao_corte.upgrade(conn)


async def _fks(conn) -> list:
    return (await conn.execute(text("PRAGMA foreign_key_list(corte_snapshots)"))).fetchall()


@pytest.mark.asyncio
async def test_solta_a_fk_sem_perder_linha(conn):
    await _banco_antigo(conn)

    await _migrar(conn)

    assert await _fks(conn) == []
    linhas = await conn.execute(
        text("SELECT id, corte_id, titulo_proposto FROM corte_snapshots ORDER BY id")
    )
    assert [tuple(linha) for linha in linhas] == [
        ("s1", "vivo", "Fica"),
        ("s2", "orfao", "Já órfão"),
    ]


@pytest.mark.asyncio
async def test_preenche_o_projeto_de_quem_ainda_tem_corte(conn):
    await _banco_antigo(conn)

    await _migrar(conn)

    linhas = await conn.execute(text("SELECT id, projeto_id FROM corte_snapshots ORDER BY id"))
    assert [tuple(linha) for linha in linhas] == [("s1", "p1"), ("s2", None)]


@pytest.mark.asyncio
async def test_colunas_e_indices_continuam_os_do_banco(conn):
    await _banco_antigo(conn)

    await _migrar(conn)

    colunas = await conn.execute(text("PRAGMA table_info(corte_snapshots)"))
    assert {linha[1] for linha in colunas} == set(CorteSnapshot.__table__.columns.keys())
    indices = await conn.execute(text("PRAGMA index_list(corte_snapshots)"))
    unicos = {linha[1]: linha[2] for linha in indices}
    assert unicos["ix_corte_snapshots_corte_id"] == 1
    assert "ix_corte_snapshots_projeto_id" in unicos


@pytest.mark.asyncio
async def test_rodar_de_novo_nao_muda_nada(conn):
    await _banco_antigo(conn)
    await _migrar(conn)

    await _migrar(conn)

    total = await conn.execute(text("SELECT COUNT(*) FROM corte_snapshots"))
    assert total.scalar_one() == 2
    assert await _fks(conn) == []


@pytest.mark.asyncio
async def test_sem_tabela_e_noop(conn):
    await _migrar(conn)  # não deve lançar


def test_fk_declarada_na_coluna_tambem_sai():
    ddl = "CREATE TABLE corte_snapshots (id TEXT PRIMARY KEY, corte_id TEXT REFERENCES cortes(id))"

    assert ddl_sem_fk(ddl) == (
        "CREATE TABLE corte_snapshots_d993 (id TEXT PRIMARY KEY, corte_id TEXT)"
    )
