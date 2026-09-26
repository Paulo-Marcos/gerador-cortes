"""Migration 007 — o Fire e a indicação para shorts passam do metadado para o corte (D-713).

`is_fire` e `candidato_shorts` moravam em `metadados_cortes`, mas são julgamentos
sobre o CORTE (governam a limpeza e a fábrica de shorts). O modelo passou a
declará-los em `Corte`; a reconciliação já criou as colunas vazias em `cortes`
antes desta migration rodar. Aqui só os VALORES vêm do metadado.

As colunas antigas ficam em `metadados_cortes`, sem uso: a migration não apaga
nada. Banco novo (tabelas criadas já sem as colunas no metadado) atravessa como
no-op. Corte sem metadado fica com 0, o mesmo default de antes.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_MARCAS = ("is_fire", "candidato_shorts")


async def _colunas_da_tabela(conn: AsyncConnection, tabela: str) -> set[str]:
    resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
    return {linha[1] for linha in resultado.fetchall()}


async def upgrade(conn: AsyncConnection) -> None:
    no_metadado = await _colunas_da_tabela(conn, "metadados_cortes")
    no_corte = await _colunas_da_tabela(conn, "cortes")
    for marca in _MARCAS:
        if marca not in no_metadado or marca not in no_corte:
            continue
        await conn.execute(
            text(
                f"UPDATE cortes SET {marca} = COALESCE("
                f"(SELECT m.{marca} FROM metadados_cortes m WHERE m.corte_id = cortes.id), 0)"
            )
        )
