"""Os interruptores do robô do YouTube Studio, por canal (D-895).

Uma tabela pequena no `settings.db`, ao lado das de `settings_store` — que já
passou do tamanho que a catraca aceita (D-771), o mesmo motivo do
`navegador_do_robo_store`.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS robo_do_studio (
        channel_id TEXT PRIMARY KEY,
        monetizar INTEGER NOT NULL,
        relacionar_short INTEGER NOT NULL
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler(db_path: Path, channel_id: str) -> tuple[bool, bool]:
    """`(monetizar, relacionar_short)` do canal; os dois desligados se nunca gravou.

    Desligado por padrão: canal fora do Programa de Parcerias não tem a aba de
    monetização, e o robô abriria a janela só para falhar.
    """
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT monetizar, relacionar_short FROM robo_do_studio WHERE channel_id = ?",
            (channel_id,),
        ).fetchone()
    finally:
        conn.close()
    return (bool(row[0]), bool(row[1])) if row is not None else (False, False)


def gravar(db_path: Path, channel_id: str, *, monetizar: bool, relacionar_short: bool) -> None:
    """Grava (UPSERT) os dois interruptores do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO robo_do_studio (channel_id, monetizar, relacionar_short) "
            "VALUES (?, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET "
            "monetizar = excluded.monetizar, relacionar_short = excluded.relacionar_short",
            (channel_id, int(monetizar), int(relacionar_short)),
        )
        conn.commit()
    finally:
        conn.close()
