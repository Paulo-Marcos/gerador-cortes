"""D-140: versionamento de schema do SQLite + runner de migrations no boot.

Exercita o runner `aplicar_migrations` contra um SQLite real (in-memory) para
garantir as invariantes que sustentam a "atualização sem quebra":

  - banco NOVO (user_version=0) recebe a versão final do schema;
  - banco EXISTENTE com dados é apenas carimbado, sem perda de dados (baseline);
  - rerodar é idempotente — migrations já aplicadas não reexecutam;
  - migrations pendentes rodam em ordem crescente, carimbando cada passo.
"""

from datetime import datetime

import app.migrations as migrations_module
import pytest
import pytest_asyncio
from app.migrations import (
    MIGRATIONS,
    Migration,
    _ler_versao_schema,
    aplicar_migrations,
    reconciliacao,
)
from app.models import Base
from sqlalchemy import Column, DateTime, String, text
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


# ── Reconciliação declarativa (D-403): modelo × schema real ─────────────────


async def _criar_tabelas_so_com_pk(conn) -> None:
    """Banco no pior caso: toda tabela do modelo existe, mas só com a PK.

    Reproduz o vão que `create_all` não fecha — a tabela já existe, então nenhuma
    coluna nova do modelo entra nela.
    """
    for tabela in Base.metadata.sorted_tables:
        pk = next(iter(tabela.primary_key.columns)).name
        await conn.execute(text(f"CREATE TABLE {tabela.name} ({pk} VARCHAR(36) PRIMARY KEY)"))


@pytest.mark.asyncio
async def test_reconciliacao_adiciona_is_fire_em_metadados_antigo(conn):
    """Regressão D-403: banco cuja `metadados_cortes` nasceu sem `is_fire` ganha a
    coluna — era o que fazia `GET /api/cortes/projeto/{id}` responder 500."""
    await conn.execute(text("CREATE TABLE metadados_cortes (id VARCHAR(36) PRIMARY KEY)"))

    await reconciliacao.reconciliar_schema(conn)

    assert "is_fire" in await _colunas(conn, "metadados_cortes")


@pytest.mark.asyncio
async def test_reconciliacao_cobre_toda_coluna_de_todo_modelo(conn):
    """O verificador de fato: nenhuma coluna declarada em `models.py` fica de fora,
    em nenhuma tabela. Uma coluna nova que ninguém migrou cai aqui, não em produção."""
    await _criar_tabelas_so_com_pk(conn)

    await reconciliacao.reconciliar_schema(conn)

    for tabela in Base.metadata.sorted_tables:
        esperadas = {coluna.name for coluna in tabela.columns}
        assert esperadas <= await _colunas(conn, tabela.name), f"drift em {tabela.name}"


@pytest.mark.asyncio
async def test_reconciliacao_e_idempotente(conn):
    """Rodar de novo é no-op: o segundo boot não repara nada."""
    await _criar_tabelas_so_com_pk(conn)

    await reconciliacao.reconciliar_schema(conn)

    assert await reconciliacao.reconciliar_schema(conn) == {}


@pytest.mark.asyncio
async def test_reconciliacao_preserva_coluna_extra_legada(conn):
    """Coluna que só existe no banco (legado que o ORM ignora, ex. `filtro_padrao`)
    não é dropada — reparo só adiciona."""
    await conn.execute(
        text("CREATE TABLE projetos (id VARCHAR(36) PRIMARY KEY, filtro_padrao TEXT)")
    )

    await reconciliacao.reconciliar_schema(conn)

    assert "filtro_padrao" in await _colunas(conn, "projetos")


@pytest.mark.asyncio
async def test_reconciliacao_ignora_tabela_ausente(conn):
    """Banco cru (antes do `create_all`) atravessa sem erro: criar tabela é papel
    do `create_all`, que já a cria completa."""
    assert await reconciliacao.reconciliar_schema(conn) == {}


@pytest.mark.asyncio
async def test_runner_reconcilia_antes_das_migrations(conn):
    """A reconciliação está de fato no caminho do boot — `init_db` chama o runner."""
    await conn.execute(text("CREATE TABLE metadados_cortes (id VARCHAR(36) PRIMARY KEY)"))

    await aplicar_migrations(conn)

    assert "is_fire" in await _colunas(conn, "metadados_cortes")


def test_colunas_faltantes_preserva_ordem_do_modelo():
    assert reconciliacao.colunas_faltantes(["id", "titulo", "is_fire"], {"id"}) == [
        "titulo",
        "is_fire",
    ]


def test_ddl_usa_default_literal_do_modelo():
    coluna = Base.metadata.tables["metadados_cortes"].columns["is_fire"]

    assert reconciliacao.ddl_add_column("metadados_cortes", coluna).endswith("DEFAULT 0")


def test_ddl_usa_o_valor_do_enum_e_nao_seu_repr():
    """`default=StatusProjeto.PENDENTE` precisa virar `'pendente'` — o `repr` de um
    str-enum ('StatusProjeto.PENDENTE') entraria como lixo na coluna."""
    coluna = Base.metadata.tables["projetos"].columns["status"]

    assert reconciliacao.ddl_add_column("projetos", coluna).endswith("DEFAULT 'pendente'")


def test_ddl_escapa_aspas_do_default():
    coluna = Column("credito", String(200), default="d'Ávila")

    assert reconciliacao.ddl_add_column("metadados_cortes", coluna).endswith("DEFAULT 'd''Ávila'")


def test_ddl_omite_default_calculado_em_python():
    """`datetime.utcnow` não tem equivalente estático: a coluna nasce nula e o ORM
    a preenche na escrita seguinte."""
    coluna = Column("criado_em", DateTime, default=datetime.utcnow)

    assert "DEFAULT" not in reconciliacao.ddl_add_column("cortes", coluna)
