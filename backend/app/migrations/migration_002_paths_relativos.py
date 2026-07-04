"""Migration 002 — caminhos de artefato RELATIVOS ao projeto (D-158).

O banco guardava caminhos ABSOLUTOS de artefatos que quebram quando a pasta do
canal é relocada (move de dados do D-155, split PROD/DEV, paths de container
Docker `/app/...`). A cura de raiz é guardar o sub-caminho RELATIVO ao projeto e
reancorá-lo pela raiz de dados vigente na leitura (ver `channel_paths`).

Esta migration reescreve os VALORES já existentes das três colunas afetadas:

- ``cortes.arquivo_clip_path``
- ``metadados_cortes.thumbnail_path``
- ``avaliacoes_thumbnail.thumbnail_path_snapshot``

Para cada linha, extrai o trecho após o segmento ``<projeto_id>/`` via
``para_relativo_ao_projeto`` (o mesmo helper usado na escrita/leitura). Valores
já relativos ou vazios ficam intactos; valores que não podem ser normalizados
(``<projeto_id>`` ausente e sem trecho útil) são deixados como estão — a leitura
robusta (`resolver_do_projeto`, glob do bruto) cobre esses casos.

NUNCA toca arquivos em disco: só reescreve strings no banco. É idempotente — na
segunda passagem o valor já-relativo não muda, então nada é reescrito.
"""

from __future__ import annotations

from app.channel_paths import para_relativo_ao_projeto
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def _tabela_existe(conn: AsyncConnection, nome: str) -> bool:
    """Se a tabela existe no banco. No boot real o schema já foi criado antes das
    migrations; num banco cru (ex.: teste do runner) as tabelas ainda não existem
    e a reescrita simplesmente não tem o que fazer."""
    resultado = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name = :nome"),
        {"nome": nome},
    )
    return resultado.first() is not None


async def _migrar_coluna(conn: AsyncConnection, *, select_sql: str, update_sql: str) -> None:
    """Reescreve uma coluna de caminho para o relativo-ao-projeto (só se mudar)."""
    resultado = await conn.execute(text(select_sql))
    for pk, projeto_id, valor in resultado.fetchall():
        if not valor or not projeto_id:
            continue
        novo = para_relativo_ao_projeto(valor, projeto_id)
        # Só reescreve quando há mudança real e sobra um sub-caminho útil.
        # `novo == valor` é o no-op da idempotência (2ª rodada já-relativa).
        if not novo or novo == valor:
            continue
        await conn.execute(text(update_sql), {"valor": novo, "pk": pk})


async def upgrade(conn: AsyncConnection) -> None:
    # Todas as três colunas dependem de `cortes` (direta ou via JOIN para o
    # projeto_id). Sem a tabela base, não há legado a reescrever.
    if not await _tabela_existe(conn, "cortes"):
        return

    await _migrar_coluna(
        conn,
        select_sql=(
            "SELECT id, projeto_id, arquivo_clip_path FROM cortes "
            "WHERE arquivo_clip_path IS NOT NULL AND arquivo_clip_path != ''"
        ),
        update_sql="UPDATE cortes SET arquivo_clip_path = :valor WHERE id = :pk",
    )
    await _migrar_coluna(
        conn,
        select_sql=(
            "SELECT m.id, c.projeto_id, m.thumbnail_path "
            "FROM metadados_cortes m JOIN cortes c ON c.id = m.corte_id "
            "WHERE m.thumbnail_path IS NOT NULL AND m.thumbnail_path != ''"
        ),
        update_sql="UPDATE metadados_cortes SET thumbnail_path = :valor WHERE id = :pk",
    )
    await _migrar_coluna(
        conn,
        select_sql=(
            "SELECT a.id, c.projeto_id, a.thumbnail_path_snapshot "
            "FROM avaliacoes_thumbnail a JOIN cortes c ON c.id = a.corte_id "
            "WHERE a.thumbnail_path_snapshot IS NOT NULL AND a.thumbnail_path_snapshot != ''"
        ),
        update_sql=(
            "UPDATE avaliacoes_thumbnail SET thumbnail_path_snapshot = :valor WHERE id = :pk"
        ),
    )
