"""Índices nos filtros quentes (D-650).

Sem eles o SQLite varria a tabela inteira nas três consultas mais repetidas do
app. Índice não muda dado nem resultado — só o caminho até ele — então o que
estes testes protegem é o contorno: o banco MIGRADO tem que ficar igual ao banco
recém-criado (senão um índice duplicado nasce com outro nome), rodar a migração
duas vezes não pode mudar nada, e nenhuma linha pode sumir no caminho.
"""

import sqlite3

import pytest
import pytest_asyncio
from app.migrations import aplicar_migrations
from app.models import Base, Projeto
from app.services import llm_calls_store
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

INDICES_D650 = {"ix_cortes_projeto_id", "ix_shorts_corte_id", "ix_projetos_youtube_url"}

_SQL_INDICES = "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"


async def _indices(conn) -> set[str]:
    resultado = await conn.execute(text(_SQL_INDICES))
    return {linha[0] for linha in resultado.fetchall()}


@pytest_asyncio.fixture
async def banco(tmp_path):
    """Banco no disco (não `:memory:`): a migração precisa de arquivo de verdade."""
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'projetos.db').as_posix()}")
    yield engine
    await engine.dispose()


@pytest.mark.asyncio
async def test_banco_novo_e_banco_migrado_tem_os_mesmos_indices(banco, tmp_path):
    # Banco "novo": nasce do modelo declarativo, como na primeira execução.
    async with banco.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        do_modelo = await _indices(conn)

    # Banco "antigo": só as tabelas, sem os índices — e então migrado.
    velho = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'velho.db').as_posix()}")
    async with velho.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for indice in INDICES_D650:
            await conn.execute(text(f"DROP INDEX IF EXISTS {indice}"))
        await conn.execute(text("PRAGMA user_version = 5"))
    async with velho.begin() as conn:
        await aplicar_migrations(conn)
        do_migrado = await _indices(conn)
    await velho.dispose()

    assert INDICES_D650 <= do_modelo, "banco novo precisa nascer com os índices"
    assert do_migrado == do_modelo, "migrado e recém-criado não podem divergir"


@pytest.mark.asyncio
async def test_migracao_nao_perde_linha_e_roda_duas_vezes(banco):
    async with banco.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("PRAGMA user_version = 5"))

    # Pelo modelo, não por SQL cru: os defaults do `Projeto` preenchem sozinhos
    # as colunas obrigatórias, e o teste não precisa saber quais são.
    async with AsyncSession(banco) as sessao:
        sessao.add(Projeto(id="p1", youtube_url="https://youtu.be/abc"))
        await sessao.commit()

    async with banco.begin() as conn:
        versao = await aplicar_migrations(conn)
        linhas = (await conn.execute(text("SELECT count(*) FROM projetos"))).scalar_one()

    async with banco.begin() as conn:
        versao_de_novo = await aplicar_migrations(conn)
        linhas_de_novo = (await conn.execute(text("SELECT count(*) FROM projetos"))).scalar_one()
        indices = await _indices(conn)

    assert versao == versao_de_novo >= 6
    assert linhas == linhas_de_novo == 1
    assert INDICES_D650 <= indices


def test_telemetria_de_ia_nasce_indexada(tmp_path):
    caminho = tmp_path / "llm_calls.db"
    llm_calls_store.inicializar(caminho)
    llm_calls_store.inicializar(caminho)  # abrir de novo não pode duplicar

    conn = sqlite3.connect(caminho)
    indices = {linha[0] for linha in conn.execute(_SQL_INDICES)}
    conn.close()

    assert {
        "ix_llm_calls_corte_ts",
        "ix_llm_calls_short_ts",
        "ix_llm_calls_etapa_ts",
        "ix_llm_calls_projeto_ts",
    } <= indices


def test_consulta_da_telemetria_usa_o_indice(tmp_path):
    """O ganho medido vem daqui: sem isto, o plano volta a ser varredura."""
    caminho = tmp_path / "llm_calls.db"
    llm_calls_store.gravar_llm_call(db_path=caminho, etapa="cortes", corte_id="c1", prompt="oi")

    conn = sqlite3.connect(caminho)
    plano = " ".join(
        str(linha[-1])
        for linha in conn.execute(
            "EXPLAIN QUERY PLAN "
            "SELECT * FROM llm_calls WHERE corte_id = ? ORDER BY ts DESC LIMIT 1",
            ("c1",),
        )
    )
    conn.close()

    assert "USING INDEX" in plano, plano
    assert "TEMP B-TREE" not in plano, "a ordenação deveria vir do índice"
