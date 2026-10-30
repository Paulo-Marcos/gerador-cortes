"""A faixa de duração dos shorts de cada canal, no `settings.db` (D-997).

Até a D-997 ela era fixa no `config.py` (15 a 90 s), contra o ADR-0012. Linha
ausente é o canal nunca configurado, e quem lê completa com os padrões do
domínio — o banco não guarda o que ninguém escolheu.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS faixa_do_short (
        channel_id TEXT PRIMARY KEY,
        duracao_min_seg REAL NOT NULL,
        duracao_max_seg REAL NOT NULL
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
    """A faixa gravada do canal, ou None se ele nunca foi configurado."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT duracao_min_seg, duracao_max_seg FROM faixa_do_short WHERE channel_id = ?",
            (channel_id,),
        ).fetchone()
    finally:
        conn.close()
    return dict(row) if row is not None else None


def gravar(
    db_path: Path, channel_id: str, *, duracao_min_seg: float, duracao_max_seg: float
) -> None:
    """Grava (UPSERT) a faixa do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO faixa_do_short (channel_id, duracao_min_seg, duracao_max_seg) "
            "VALUES (?, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET "
            "duracao_min_seg = excluded.duracao_min_seg, "
            "duracao_max_seg = excluded.duracao_max_seg",
            (channel_id, float(duracao_min_seg), float(duracao_max_seg)),
        )
        conn.commit()
    finally:
        conn.close()
