"""O estilo das capas do canal no `settings.db` (D-909): protagonista e meta de claridade.

Tabela própria, ao lado da `capa_chatgpt` (D-804): lá mora ONDE o robô gera; aqui,
COMO a capa deve sair. Linha ausente é o canal nunca configurado, e quem lê
completa com os padrões do domínio — o banco não guarda o que ninguém escolheu.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS capa_do_canal (
        channel_id TEXT PRIMARY KEY,
        protagonista TEXT NOT NULL,
        luminancia_minima REAL NOT NULL,
        escuros_maximo REAL NOT NULL
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler(db_path: Path, channel_id: str) -> dict | None:
    """O estilo gravado do canal, ou None se ele nunca foi configurado."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT protagonista, luminancia_minima, escuros_maximo "
            "FROM capa_do_canal WHERE channel_id = ?",
            (channel_id,),
        ).fetchone()
    finally:
        conn.close()
    return dict(row) if row is not None else None


def gravar(
    db_path: Path,
    channel_id: str,
    *,
    protagonista: str,
    luminancia_minima: float,
    escuros_maximo: float,
) -> None:
    """Grava (UPSERT) o estilo inteiro do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO capa_do_canal (channel_id, protagonista, luminancia_minima, "
            "escuros_maximo) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET protagonista = excluded.protagonista, "
            "luminancia_minima = excluded.luminancia_minima, "
            "escuros_maximo = excluded.escuros_maximo",
            (channel_id, protagonista, float(luminancia_minima), float(escuros_maximo)),
        )
        conn.commit()
    finally:
        conn.close()
