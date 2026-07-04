"""Migration 003 — caminhos de vídeo original e short RELATIVOS ao projeto (D-172).

Follow-up da D-158 (migration 002): aquela migração normalizou apenas três
colunas de artefato (``cortes.arquivo_clip_path``, ``metadados_cortes.thumbnail_path``
e ``avaliacoes_thumbnail.thumbnail_path_snapshot``), deixando de fora duas outras
que também guardam caminho ABSOLUTO e quebram após relocação do canal
(move de dados do D-155, split PROD/DEV, paths de container Docker ``/app/...``):

- ``projetos.arquivo_video_path``  (vídeo original baixado)
- ``shorts.arquivo_short_path``     (short renderizado)

Sintoma real que motivou esta migração: a análise via Claude estourava
``FileNotFoundError`` ao derivar a pasta ``subtitles`` de um ``arquivo_video_path``
apontando para o ``backend/projetos`` antigo.

Reescreve os VALORES já existentes das duas colunas para o sub-caminho relativo ao
projeto via ``para_relativo_ao_projeto`` (o mesmo helper da escrita/leitura). Valores
já relativos ou vazios ficam intactos; valores não normalizáveis são deixados como
estão — a leitura robusta (``resolver_do_projeto``) cobre esses casos.

NUNCA toca arquivos em disco: só reescreve strings no banco. É idempotente — na
segunda passagem o valor já-relativo não muda, então nada é reescrito.
"""

from __future__ import annotations

from app.channel_paths import para_relativo_ao_projeto
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection


async def _tabela_existe(conn: AsyncConnection, nome: str) -> bool:
    """Se a tabela existe no banco. Num banco cru (ex.: teste do runner) as tabelas
    ainda não existem e a reescrita simplesmente não tem o que fazer."""
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
    # projetos.arquivo_video_path — o próprio id do projeto é o projeto_id.
    if await _tabela_existe(conn, "projetos"):
        await _migrar_coluna(
            conn,
            select_sql=(
                "SELECT id, id, arquivo_video_path FROM projetos "
                "WHERE arquivo_video_path IS NOT NULL AND arquivo_video_path != ''"
            ),
            update_sql="UPDATE projetos SET arquivo_video_path = :valor WHERE id = :pk",
        )

    # shorts.arquivo_short_path — projeto_id vem do corte (shorts -> cortes).
    if await _tabela_existe(conn, "shorts") and await _tabela_existe(conn, "cortes"):
        await _migrar_coluna(
            conn,
            select_sql=(
                "SELECT s.id, c.projeto_id, s.arquivo_short_path "
                "FROM shorts s JOIN cortes c ON c.id = s.corte_id "
                "WHERE s.arquivo_short_path IS NOT NULL AND s.arquivo_short_path != ''"
            ),
            update_sql="UPDATE shorts SET arquivo_short_path = :valor WHERE id = :pk",
        )
