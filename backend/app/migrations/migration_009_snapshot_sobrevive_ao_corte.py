"""Migration 009 — o snapshot da proposta sobrevive ao corte (D-993).

Apagar um corte deixava o `CorteSnapshot` (D-303) órfão: sem projeto, sem data,
sem motivo. Na D-989, a origem de 177 propostas apagadas só saiu por
reconstrução. Agora o apagar grava `projeto_id`, `apagado_em` e o motivo no
snapshot, e a linha fica.

Para a linha ficar, `corte_snapshots.corte_id` deixa de ser FK para `cortes.id`:
o snapshot guarda o id de um corte que pode não existir mais. O app não liga
`PRAGMA foreign_keys`, então a FK nunca barrou nada — mas ela mentia sobre o
dado e quebraria no dia em que alguém ligasse a verificação.

O SQLite não solta uma FK com ALTER: a tabela é recriada (o procedimento da
documentação do SQLite) a partir do DDL GUARDADO NO PRÓPRIO BANCO, menos a FK.
Não do DDL do modelo: as colunas que a reconciliação acrescentou ao longo do
tempo aceitam NULL no banco antigo, e o `NOT NULL` do modelo recusaria a cópia
e derrubaria o boot.

As colunas novas já chegam pela reconciliação, que roda antes. Aqui também se
preenche o `projeto_id` dos snapshots cujo corte ainda existe; os já órfãos
ficam sem projeto — essa informação se perdeu.

Idempotente: sem a FK, não recria; o preenchimento só toca `projeto_id` nulo.
"""

from __future__ import annotations

import re

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_TABELA = "corte_snapshots"
_NOVA = "corte_snapshots_d993"

# As duas formas de declarar a FK: a de tabela (a que o SQLAlchemy gera) e a de coluna.
_FK_DE_TABELA = re.compile(
    r',\s*(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(\s*"?corte_id"?\s*\)'
    r'\s*REFERENCES\s+"?cortes"?\s*\([^)]*\)',
    re.IGNORECASE,
)
_FK_DE_COLUNA = re.compile(r'\s+REFERENCES\s+"?cortes"?\s*\([^)]*\)', re.IGNORECASE)
_NOME_DA_TABELA = re.compile(r'^\s*CREATE\s+TABLE\s+"?corte_snapshots"?', re.IGNORECASE)


def ddl_sem_fk(ddl: str) -> str:
    """O `CREATE TABLE` guardado, sem a FK para `cortes` e com o nome provisório."""
    sem_fk = _FK_DE_COLUNA.sub("", _FK_DE_TABELA.sub("", ddl))
    return _NOME_DA_TABELA.sub(f"CREATE TABLE {_NOVA}", sem_fk, count=1)


async def _colunas(conn: AsyncConnection, tabela: str) -> list[str]:
    linhas = (await conn.execute(text(f"PRAGMA table_info({tabela})"))).fetchall()
    return [linha[1] for linha in linhas]


async def _tem_fk_para_cortes(conn: AsyncConnection) -> bool:
    linhas = (await conn.execute(text(f"PRAGMA foreign_key_list({_TABELA})"))).fetchall()
    return any(linha[2] == "cortes" for linha in linhas)


async def _sql_guardado(conn: AsyncConnection, tipo: str) -> list[str]:
    linhas = await conn.execute(
        text(
            "SELECT sql FROM sqlite_master WHERE type = :tipo AND tbl_name = :tabela "
            "AND sql IS NOT NULL"
        ),
        {"tipo": tipo, "tabela": _TABELA},
    )
    return [linha[0] for linha in linhas.fetchall()]


async def _recriar_sem_fk(conn: AsyncConnection) -> None:
    (ddl,) = await _sql_guardado(conn, "table")
    indices = await _sql_guardado(conn, "index")
    await conn.execute(text(ddl_sem_fk(ddl)))
    await conn.execute(text(f"INSERT INTO {_NOVA} SELECT * FROM {_TABELA}"))
    await conn.execute(text(f"DROP TABLE {_TABELA}"))
    await conn.execute(text(f"ALTER TABLE {_NOVA} RENAME TO {_TABELA}"))
    for sql in indices:
        await conn.execute(text(sql))
    if await _tem_fk_para_cortes(conn):
        raise RuntimeError("migration 009: a FK de corte_snapshots para cortes não saiu")


async def _preencher_projeto(conn: AsyncConnection) -> None:
    await conn.execute(
        text(f"CREATE INDEX IF NOT EXISTS ix_{_TABELA}_projeto_id ON {_TABELA} (projeto_id)")
    )
    if "projeto_id" not in await _colunas(conn, "cortes"):
        return
    await conn.execute(
        text(
            f"UPDATE {_TABELA} SET projeto_id = "
            f"(SELECT cortes.projeto_id FROM cortes WHERE cortes.id = {_TABELA}.corte_id) "
            "WHERE projeto_id IS NULL"
        )
    )


async def upgrade(conn: AsyncConnection) -> None:
    if not await _colunas(conn, _TABELA):
        return
    if await _tem_fk_para_cortes(conn):
        await _recriar_sem_fk(conn)
    if "projeto_id" in await _colunas(conn, _TABELA):
        await _preencher_projeto(conn)
