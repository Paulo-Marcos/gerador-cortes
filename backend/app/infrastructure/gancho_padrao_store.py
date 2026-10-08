"""O preset de gancho padrão de cada canal, no `settings.db` (D-901).

Uma tabela pequena ao lado das de `settings_store`, no mesmo banco — o mesmo
arranjo do `capa_chatgpt_store`, e pelo mesmo motivo: o `settings_store` já
está no teto da catraca de tamanho (D-771), e o assunto é outro.

Guarda só o id do preset; o preset mora no banco do canal (`layout_presets`).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS gancho_padrao_do_canal (
        channel_id TEXT PRIMARY KEY,
        preset_id TEXT NOT NULL DEFAULT ''
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


def ler(db_path: Path, channel_id: str) -> str:
    """O id do preset de gancho padrão do canal, ou "" quando não há."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT preset_id FROM gancho_padrao_do_canal WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    return row["preset_id"] if row is not None else ""


def gravar(db_path: Path, channel_id: str, preset_id: str) -> None:
    """Grava (UPSERT) o preset padrão do canal; "" tira o padrão."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO gancho_padrao_do_canal (channel_id, preset_id) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET preset_id = excluded.preset_id",
            (channel_id, preset_id),
        )
        conn.commit()
    finally:
        conn.close()
