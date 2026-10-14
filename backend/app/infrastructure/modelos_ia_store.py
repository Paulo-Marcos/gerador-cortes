"""Que modelo atende cada faixa de IA, por canal (D-924).

Uma tabela pequena no `settings.db`, ao lado das de `settings_store` — que já
passou do tamanho que a catraca aceita (D-771), o mesmo motivo do
`navegador_do_robo_store`. Guarda um JSON parcial: só os papéis que o operador
tirou do padrão.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS modelos_ia (
        channel_id TEXT PRIMARY KEY,
        escolhas_json TEXT NOT NULL
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler(db_path: Path, channel_id: str) -> dict:
    """O que o canal gravou, ou {} se nunca mexeu (ou o JSON estragou)."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT escolhas_json FROM modelos_ia WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return {}
    try:
        gravado = json.loads(row[0])
    except json.JSONDecodeError:
        return {}
    return gravado if isinstance(gravado, dict) else {}


def gravar(db_path: Path, channel_id: str, escolhas: dict[str, str]) -> None:
    """Grava (UPSERT) as escolhas do canal. Escrita idempotente."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO modelos_ia (channel_id, escolhas_json) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET escolhas_json = excluded.escolhas_json",
            (channel_id, json.dumps(escolhas, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()
