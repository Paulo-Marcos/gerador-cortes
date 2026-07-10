"""D-140: versionamento de schema do SQLite + runner de migrations no boot.

Exercita o runner `aplicar_migrations` contra um SQLite real (in-memory) para
garantir as invariantes que sustentam a "atualização sem quebra":

  - banco NOVO (user_version=0) recebe a versão final do schema;
  - banco EXISTENTE com dados é apenas carimbado, sem perda de dados (baseline);
  - rerodar é idempotente — migrations já aplicadas não reexecutam;
  - migrations pendentes rodam em ordem crescente, carimbando cada passo.
"""

import app.migrations as migrations_module
import pytest
import pytest_asyncio
from app.migrations import (
    MIGRATIONS,
    Migration,
    _ler_versao_schema,
    aplicar_migrations,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def conn():
    """Conexão SQLite in-memory real (StaticPool mantém o mesmo banco no pool)."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conexao:
        yield conexao
    await engine.dispose()


def _migration_espia(version: int, registro: list[int]) -> Migration:
    async def upgrade(_conn):
        registro.append(version)

    return Migration(version=version, description=f"espia-{version}", upgrade=upgrade)


@pytest.mark.asyncio
async def test_banco_novo_recebe_versao_final(conn):
    assert await _ler_versao_schema(conn) == 0

    versao = await aplicar_migrations(conn)

    assert versao == MIGRATIONS[-1].version
    assert await _ler_versao_schema(conn) == MIGRATIONS[-1].version


@pytest.mark.asyncio
async def test_baseline_preserva_dados_de_banco_existente(conn):
    # Simula um banco já populado por uma versão anterior do app (user_version=0).
    await conn.execute(text("CREATE TABLE projetos_legado (id INTEGER PRIMARY KEY, nome TEXT)"))
    await conn.execute(text("INSERT INTO projetos_legado (id, nome) VALUES (1, 'manter')"))

    await aplicar_migrations(conn)

    linhas = (await conn.execute(text("SELECT nome FROM projetos_legado"))).scalars().all()
    assert linhas == ["manter"]  # baseline não dropa nem altera dados
    assert await _ler_versao_schema(conn) == MIGRATIONS[-1].version


@pytest.mark.asyncio
async def test_idempotente_nao_reexecuta(conn, monkeypatch):
    chamadas: list[int] = []
    monkeypatch.setattr(
        migrations_module,
        "MIGRATIONS",
        (_migration_espia(1, chamadas),),
    )

    await migrations_module.aplicar_migrations(conn)
    await migrations_module.aplicar_migrations(conn)

    assert chamadas == [1]  # rodou só na primeira passagem


@pytest.mark.asyncio
async def test_aplica_pendentes_em_ordem_carimbando_cada_passo(conn, monkeypatch):
    ordem: list[int] = []
    monkeypatch.setattr(
        migrations_module,
        "MIGRATIONS",
        (
            _migration_espia(1, ordem),
            _migration_espia(2, ordem),
            _migration_espia(3, ordem),
        ),
    )

    versao = await migrations_module.aplicar_migrations(conn)

    assert ordem == [1, 2, 3]
    assert versao == 3
    assert await _ler_versao_schema(conn) == 3


@pytest.mark.asyncio
async def test_pula_migrations_ja_aplicadas(conn, monkeypatch):
    chamadas: list[int] = []
    monkeypatch.setattr(
        migrations_module,
        "MIGRATIONS",
        (
            _migration_espia(1, chamadas),
            _migration_espia(2, chamadas),
        ),
    )
    # Banco já está na versão 1 — só a 2 deve rodar.
    await migrations_module._carimbar_versao_schema(conn, 1)

    versao = await migrations_module.aplicar_migrations(conn)

    assert chamadas == [2]
    assert versao == 2


# ── Migration 004 (D-302): campos v2 em cortes/corte_snapshots ──────────────


async def _colunas(conn, tabela: str) -> set[str]:
    resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
    return {linha[1] for linha in resultado.fetchall()}


@pytest.mark.asyncio
async def test_migration_004_adiciona_colunas_v2_em_banco_antigo(conn):
    """Banco pré-D-302 (tabelas sem os campos v2) ganha as 4 colunas novas em
    `cortes` e `corte_snapshots`; rodar de novo é no-op (idempotente)."""
    from app.migrations import migration_004_campos_v2_cortes

    await conn.execute(text("CREATE TABLE cortes (id VARCHAR(36) PRIMARY KEY)"))
    await conn.execute(text("CREATE TABLE corte_snapshots (id VARCHAR(36) PRIMARY KEY)"))

    await migration_004_campos_v2_cortes.upgrade(conn)
    await migration_004_campos_v2_cortes.upgrade(conn)  # idempotência

    esperadas = {"frase_gancho_hms", "frase_gancho_texto", "contextualizacao", "score_json"}
    assert esperadas <= await _colunas(conn, "cortes")
    assert esperadas <= await _colunas(conn, "corte_snapshots")


@pytest.mark.asyncio
async def test_migration_004_sem_tabelas_e_noop(conn):
    """Banco cru (runner antes do create_all) atravessa a migration sem erro."""
    from app.migrations import migration_004_campos_v2_cortes

    await migration_004_campos_v2_cortes.upgrade(conn)  # não deve lançar


# ── Migration 005 (D-334): contador de gerações de trechos em cortes ────────


@pytest.mark.asyncio
async def test_migration_005_adiciona_colunas_trechos_geracoes_em_banco_antigo(conn):
    """Banco pré-D-334 (tabela `cortes` sem os campos novos) ganha as 2
    colunas novas; rodar de novo é no-op (idempotente)."""
    from app.migrations import migration_005_trechos_geracoes

    await conn.execute(text("CREATE TABLE cortes (id VARCHAR(36) PRIMARY KEY)"))

    await migration_005_trechos_geracoes.upgrade(conn)
    await migration_005_trechos_geracoes.upgrade(conn)  # idempotência

    esperadas = {"trechos_geracoes", "trechos_geracoes_log"}
    assert esperadas <= await _colunas(conn, "cortes")


@pytest.mark.asyncio
async def test_migration_005_sem_tabela_e_noop(conn):
    """Banco cru (runner antes do create_all) atravessa a migration sem erro."""
    from app.migrations import migration_005_trechos_geracoes

    await migration_005_trechos_geracoes.upgrade(conn)  # não deve lançar
