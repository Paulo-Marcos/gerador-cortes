"""A lista de motivos de excluir um corte de cada canal, no `settings.db` (D-1006).

Linha ausente é o canal que nunca editou a lista: quem lê usa o padrão do
domínio. Editada uma vez, a lista inteira fica gravada — inclusive os motivos
escondidos, que a telemetria ainda precisa nomear.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS motivos_de_exclusao (
        channel_id TEXT PRIMARY KEY,
        motivos TEXT NOT NULL
    )
"""


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    conn.execute(_DDL)
    return conn


def ler(db_path: Path, channel_id: str) -> list[dict] | None:
    """A lista gravada do canal, ou None se ele nunca a editou."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT motivos FROM motivos_de_exclusao WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    try:
        motivos = json.loads(row[0])
    except ValueError:
        return None
    return motivos if isinstance(motivos, list) else None


def gravar(db_path: Path, channel_id: str, motivos: list[dict]) -> None:
    """Grava (UPSERT) a lista inteira do canal."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO motivos_de_exclusao (channel_id, motivos) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET motivos = excluded.motivos",
            (channel_id, json.dumps(motivos, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()
