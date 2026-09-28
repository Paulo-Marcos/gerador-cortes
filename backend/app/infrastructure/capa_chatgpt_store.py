"""Onde o robô gera as capas no ChatGPT, por canal, no `settings.db` (D-804).

Uma tabela pequena ao lado das de `settings_store`, no mesmo banco. Mora num
módulo próprio porque o `settings_store` já passou do tamanho que a catraca
aceita (D-771) — e o assunto é outro.

As fichas do mascote são arquivos na pasta do canal; aqui fica só o link.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS capa_chatgpt (
        channel_id TEXT PRIMARY KEY,
        projeto_url TEXT NOT NULL DEFAULT ''
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    # Idempotente e barato; a tabela é lida só quando o operador mexe nas capas.
    conn.execute(_DDL)
    return conn


def ler_projeto(db_path: Path, channel_id: str) -> str:
    """O link do projeto do ChatGPT do canal, ou "" se ainda não foi configurado."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT projeto_url FROM capa_chatgpt WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    return row["projeto_url"] if row is not None else ""


def gravar_projeto(db_path: Path, channel_id: str, projeto_url: str) -> None:
    """Grava (UPSERT) o link do projeto do ChatGPT do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO capa_chatgpt (channel_id, projeto_url) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET projeto_url = excluded.projeto_url",
            (channel_id, str(projeto_url)),
        )
        conn.commit()
    finally:
        conn.close()
