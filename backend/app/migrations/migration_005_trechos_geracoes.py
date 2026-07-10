"""Migration 005 — contador de invocações da skill de trechos por corte (D-334).

D-332 tornou `gerar_trechos_via_claude` aditivo puro: o total de desvios
`origem='claude'` num corte deixou de indicar quantos cliques em "gerar
trechos" produziram esses desvios (7 desvios pode ser 1 clique ou 4). As
colunas novas registram a contagem e um log por invocação para a telemetria
(D-303). `create_all` só cria tabelas novas — bancos já em produção
precisam do ``ALTER TABLE`` aqui.

Idempotente por construção, no mesmo molde da migration 004: cada coluna só
é adicionada se ainda não existir (``PRAGMA table_info``).
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_COLUNAS_TRECHOS_GERACOES = (
    ("trechos_geracoes", "INTEGER DEFAULT 0"),
    ("trechos_geracoes_log", "TEXT DEFAULT '[]'"),
)


async def _tabela_existe(conn: AsyncConnection, nome: str) -> bool:
    resultado = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name = :nome"),
        {"nome": nome},
    )
    return resultado.first() is not None


async def _colunas_da_tabela(conn: AsyncConnection, tabela: str) -> set[str]:
    resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
    return {linha[1] for linha in resultado.fetchall()}


async def upgrade(conn: AsyncConnection) -> None:
    if not await _tabela_existe(conn, "cortes"):
        return
    existentes = await _colunas_da_tabela(conn, "cortes")
    for coluna, ddl_tipo in _COLUNAS_TRECHOS_GERACOES:
        if coluna in existentes:
            continue
        await conn.execute(text(f"ALTER TABLE cortes ADD COLUMN {coluna} {ddl_tipo}"))
