"""Reconciliação declarativa do schema — fecha o vão entre `models.py` e o banco.

`Base.metadata.create_all` só cria tabela que ainda NÃO existe. Uma coluna nova
num modelo cuja tabela já está no banco do usuário nunca chega lá, e a primeira
query que a seleciona quebra com ``no such column``. Foi o que derrubou
``GET /api/cortes/projeto/{id}`` com 500 num banco antigo: ``metadados_cortes.is_fire``
estava declarada no modelo, mas nenhum ``ALTER TABLE`` a adicionava (D-403).

A lista de ALTERs do boot cobre esse caso enquanto alguém lembra de escrever o
ALTER junto com a coluna. Aqui os ALTERs faltantes são DERIVADOS do próprio
``Base.metadata``, então esquecer deixa de ser possível — e cada reparo sai em
WARNING, para o drift aparecer no log em vez de virar 500 na cara do operador.

Conservador por construção: é caminho de REPARO, não autoridade de schema.

  - adiciona apenas coluna declarada no modelo e ausente no banco;
  - nunca dropa, renomeia ou altera coluna existente;
  - não reproduz constraint (``NOT NULL``, ``UNIQUE``, ``PRIMARY KEY``) — SQLite
    recusa acrescentá-las via ``ADD COLUMN`` em tabela com linhas;
  - coluna extra no banco (legado que o ORM ignora) é preservada;
  - falha ao reparar uma coluna é registrada e não derruba o boot.
"""

from __future__ import annotations

import enum
import logging
from collections.abc import Container, Iterable

from app.models import Base
from sqlalchemy import Column, text
from sqlalchemy.dialects import sqlite
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

_DIALETO_SQLITE = sqlite.dialect()


def colunas_faltantes(esperadas: Iterable[str], atuais: Container[str]) -> list[str]:
    """Colunas do modelo ausentes no banco, na ordem de declaração do modelo."""
    return [nome for nome in esperadas if nome not in atuais]


def _default_sql(coluna: Column) -> str | None:
    """Literal SQL do default do modelo, ou ``None`` quando não há um seguro.

    Só default LITERAL vira ``DEFAULT`` no DDL. Default calculado em Python
    (``datetime.utcnow``, lambda que lê a identidade do canal) não tem
    equivalente estático: a coluna nasce nula e o ORM a preenche na escrita
    seguinte — que é justamente o estado de uma linha antiga.
    """
    default = coluna.default
    if default is None or not default.is_scalar:
        return None

    valor = default.arg
    if isinstance(valor, enum.Enum):  # StatusProjeto/StatusCorte são str-enums
        valor = valor.value
    if isinstance(valor, bool):
        return "1" if valor else "0"
    if isinstance(valor, int | float):
        return repr(valor)
    if isinstance(valor, str):
        return "'{}'".format(valor.replace("'", "''"))
    return None


def ddl_add_column(tabela: str, coluna: Column) -> str:
    """``ALTER TABLE`` que acrescenta `coluna` como nullable, com default literal se houver."""
    ddl = f"ALTER TABLE {tabela} ADD COLUMN {coluna.name} {coluna.type.compile(_DIALETO_SQLITE)}"
    default = _default_sql(coluna)
    return ddl if default is None else f"{ddl} DEFAULT {default}"


async def _tabelas_do_banco(conn: AsyncConnection) -> set[str]:
    resultado = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
    return {linha[0] for linha in resultado.fetchall()}


async def _colunas_da_tabela(conn: AsyncConnection, tabela: str) -> set[str]:
    resultado = await conn.execute(text(f"PRAGMA table_info({tabela})"))
    return {linha[1] for linha in resultado.fetchall()}


async def reconciliar_schema(conn: AsyncConnection) -> dict[str, list[str]]:
    """Acrescenta ao banco as colunas que o modelo declara e a tabela não tem.

    Retorna o que foi reparado por tabela — dicionário vazio quando o banco já
    está em dia, que é o caso normal. Tabela ausente no banco fica de fora:
    `create_all` a cria completa, com todas as colunas.
    """
    reparos: dict[str, list[str]] = {}
    tabelas_no_banco = await _tabelas_do_banco(conn)

    for tabela in Base.metadata.sorted_tables:
        if tabela.name not in tabelas_no_banco:
            continue

        atuais = await _colunas_da_tabela(conn, tabela.name)
        for nome in colunas_faltantes((coluna.name for coluna in tabela.columns), atuais):
            ddl = ddl_add_column(tabela.name, tabela.columns[nome])
            try:
                await conn.execute(text(ddl))
            except Exception:
                logger.exception("Schema drift: falha ao reparar %s.%s", tabela.name, nome)
                continue
            reparos.setdefault(tabela.name, []).append(nome)
            logger.warning("Schema drift reparado em %s.%s via: %s", tabela.name, nome, ddl)

    return reparos
