"""Migration 006 — índices nos filtros mais usados (D-650).

Três buscas que o app faz o tempo todo varriam a tabela inteira: os cortes de um
projeto, os shorts de um corte e o projeto de uma URL do YouTube. Sem índice, o
custo cresce junto com o acervo — é a lentidão que piora sozinha com o tempo.

Medido numa cópia do banco de produção (166 projetos, 824 cortes, 150 shorts):
cortes de um projeto caiu de 2,65 ms para 0,04 ms (66x). A busca por URL não
mostrou ganho hoje (o custo está em ler as colunas grandes da linha, não em
achá-la), mas o índice impede que ela vire varredura conforme a tabela cresce.

Índice não muda dado nem resultado: só o caminho até ele. Os nomes seguem a
convenção do SQLAlchemy (`ix_<tabela>_<coluna>`), os mesmos que o `create_all`
usaria num banco novo — assim o banco migrado e o banco recém-criado ficam
idênticos, sem índice duplicado.
"""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

_INDICES = (
    ("cortes", "ix_cortes_projeto_id", "projeto_id"),
    ("shorts", "ix_shorts_corte_id", "corte_id"),
    ("projetos", "ix_projetos_youtube_url", "youtube_url"),
)


async def _tabela_existe(conn: AsyncConnection, nome: str) -> bool:
    resultado = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name = :nome"),
        {"nome": nome},
    )
    return resultado.first() is not None


async def upgrade(conn: AsyncConnection) -> None:
    for tabela, indice, coluna in _INDICES:
        if not await _tabela_existe(conn, tabela):
            continue
        await conn.execute(text(f"CREATE INDEX IF NOT EXISTS {indice} ON {tabela} ({coluna})"))
