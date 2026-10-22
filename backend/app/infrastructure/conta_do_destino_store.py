"""A conta esperada de cada destino, por canal (D-980).

Uma tabela pequena no `settings.db`, ao lado da `navegador_do_robo` — o
`settings_store` já passou do tamanho que a catraca aceita (D-771).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS conta_do_destino (
        channel_id TEXT NOT NULL,
        destino TEXT NOT NULL,
        conta_id TEXT NOT NULL,
        nome TEXT NOT NULL DEFAULT '',
        gravada_em TEXT NOT NULL,
        PRIMARY KEY (channel_id, destino)
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler_todas(db_path: Path, channel_id: str) -> dict[str, tuple[str, str, str]]:
    """`{destino: (conta_id, nome, gravada_em)}` do canal; vazio se nada foi gravado."""
    conn = _conectar(db_path)
    try:
        linhas = conn.execute(
            "SELECT destino, conta_id, nome, gravada_em FROM conta_do_destino WHERE channel_id = ?",
            (channel_id,),
        ).fetchall()
    finally:
        conn.close()
    return {destino: (conta_id, nome, gravada_em) for destino, conta_id, nome, gravada_em in linhas}


def canal_da_conta(db_path: Path, destino: str, conta_id: str, exceto: str) -> str:
    """O canal (fora `exceto`) que já tem esta conta gravada no destino, ou ""."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT channel_id FROM conta_do_destino "
            "WHERE destino = ? AND conta_id = ? AND channel_id != ? LIMIT 1",
            (destino, conta_id, exceto),
        ).fetchone()
    finally:
        conn.close()
    return row[0] if row is not None else ""


def gravar(
    db_path: Path, channel_id: str, destino: str, conta_id: str, nome: str, gravada_em: str
) -> None:
    """Grava (UPSERT) a conta do destino no canal."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO conta_do_destino (channel_id, destino, conta_id, nome, gravada_em) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id, destino) DO UPDATE SET "
            "conta_id = excluded.conta_id, nome = excluded.nome, "
            "gravada_em = excluded.gravada_em",
            (channel_id, destino, conta_id, nome, gravada_em),
        )
        conn.commit()
    finally:
        conn.close()


def esquecer(db_path: Path, channel_id: str, destino: str) -> None:
    """Apaga a conta do destino; o próximo envio aprende outra."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "DELETE FROM conta_do_destino WHERE channel_id = ? AND destino = ?",
            (channel_id, destino),
        )
        conn.commit()
    finally:
        conn.close()
