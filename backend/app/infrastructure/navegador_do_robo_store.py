"""Em que navegador o robô do TikTok e do Instagram abre, por canal (D-832).

Uma tabela pequena no `settings.db`, ao lado das de `settings_store` — que já
passou do tamanho que a catraca aceita (D-771), o mesmo motivo do
`capa_chatgpt_store`.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS navegador_do_robo (
        channel_id TEXT PRIMARY KEY,
        navegador TEXT NOT NULL
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler(db_path: Path, channel_id: str) -> str:
    """O navegador gravado para o canal, ou "" se o operador nunca escolheu."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT navegador FROM navegador_do_robo WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    return row[0] if row is not None else ""


def gravar(db_path: Path, channel_id: str, navegador: str) -> None:
    """Grava (UPSERT) a escolha do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO navegador_do_robo (channel_id, navegador) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET navegador = excluded.navegador",
            (channel_id, navegador),
        )
        conn.commit()
    finally:
        conn.close()
