"""Migration 004 — campos da proposta v2 nos cortes e snapshots (D-302).

A skill cortador-expert v2 devolve, além dos campos clássicos, a frase-gancho
(ponto de entrada mais forte do argumento), a contextualização de abertura e o
score de priorização {hook, flow, value, total}. `create_all` só cria tabelas
novas — não adiciona colunas a tabelas existentes no SQLite — então bancos já
em produção precisam do ``ALTER TABLE`` aqui.

Idempotente por construção: cada coluna só é adicionada se ainda não existir
(``PRAGMA table_info``). Banco novo (tabelas criadas pelo ``create_all`` já com
as colunas) atravessa a migration como no-op.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# Colunas v2, iguais nas duas tabelas: o Corte carrega o valor vivo (editável
# no futuro pela UI) e o CorteSnapshot congela a proposta para a telemetria.
_COLUNAS_V2 = (
    ("frase_gancho_hms", "VARCHAR(20) DEFAULT ''"),
    ("frase_gancho_texto", "TEXT DEFAULT ''"),
    ("contextualizacao", "TEXT DEFAULT ''"),
    ("score_json", "TEXT DEFAULT '{}'"),
)

_TABELAS = ("cortes", "corte_snapshots")


async def _tabela_existe(conn: AsyncConnection, nome: str) -> bool:
    """Se a tabela existe no banco. Num banco cru (ex.: teste do runner) as
    tabelas ainda não existem e não há o que alterar."""
    resultado = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name = :nome"),
        {"nome": nome},
    )
    return resultado.first() is not None


async def _colunas_da_tabela(conn: AsyncConnection, tabela: str) -> set[str]:
    resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
    return {linha[1] for linha in resultado.fetchall()}


async def upgrade(conn: AsyncConnection) -> None:
    for tabela in _TABELAS:
        if not await _tabela_existe(conn, tabela):
            continue
        existentes = await _colunas_da_tabela(conn, tabela)
        for coluna, ddl_tipo in _COLUNAS_V2:
            if coluna in existentes:
                continue
            await conn.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {ddl_tipo}"))
