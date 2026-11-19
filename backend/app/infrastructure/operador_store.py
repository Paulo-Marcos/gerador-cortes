"""O nome do operador no `settings.db` (D-1129).

Tabela de uma linha só, sem `channel_id`: o nome é da pessoa, vale para todos os
canais. Fica à parte do `settings_store` (catraca de tamanho de arquivo).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS operador (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        nome TEXT NOT NULL DEFAULT ''
    )
"""


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler_nome(db_path: Path) -> str:
    conn = _connect(db_path)
    try:
        linha = conn.execute("SELECT nome FROM operador WHERE id = 1").fetchone()
    finally:
        conn.close()
    return linha[0] if linha else ""


def gravar_nome(db_path: Path, nome: str) -> None:
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO operador (id, nome) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET nome = excluded.nome",
            (nome,),
        )
        conn.commit()
    finally:
        conn.close()
