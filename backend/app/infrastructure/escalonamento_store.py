"""A referência do público e os blocos de publicação de cada canal, no `settings.db` (D-908).

Uma tabela pequena ao lado das de `settings_store`, no mesmo banco — o arranjo
do `gancho_padrao_store`, e pelo mesmo motivo: o `settings_store` está no teto
da catraca de tamanho (D-771), e o assunto é outro.

Uma linha por (canal, chave). A chave é `publico` (as faixas de intensidade) ou
o nome do destino (`youtube`, `youtube_shorts`, `tiktok`); o valor é JSON,
porque cada um tem forma própria (listas de faixas, tuplas de blocos) e um
blob por chave é mais honesto que doze colunas semiusadas. Ausência de linha é
"use o padrão" — a mesma cascata parcial da RN-10: o reset apaga a linha.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = """
    CREATE TABLE IF NOT EXISTS escalonamento_publicacao (
        channel_id TEXT NOT NULL,
        chave TEXT NOT NULL,
        valor TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (channel_id, chave)
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


def ler(db_path: Path, channel_id: str, chave: str) -> dict | None:
    """O valor gravado para a chave, ou `None` quando o canal segue o padrão."""
    conn = _conectar(db_path)
    try:
        row = conn.execute(
            "SELECT valor FROM escalonamento_publicacao WHERE channel_id = ? AND chave = ?",
            (channel_id, chave),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    try:
        valor = json.loads(row["valor"])
    except ValueError:
        return None
    return valor if isinstance(valor, dict) else None


def gravar(db_path: Path, channel_id: str, chave: str, valor: dict) -> None:
    """Grava (UPSERT) o valor da chave para o canal."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "INSERT INTO escalonamento_publicacao (channel_id, chave, valor) VALUES (?, ?, ?) "
            "ON CONFLICT(channel_id, chave) DO UPDATE SET valor = excluded.valor",
            (channel_id, chave, json.dumps(valor, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()


def apagar(db_path: Path, channel_id: str, chave: str) -> None:
    """Volta a chave ao padrão: sem linha, o serviço devolve o default."""
    conn = _conectar(db_path)
    try:
        conn.execute(
            "DELETE FROM escalonamento_publicacao WHERE channel_id = ? AND chave = ?",
            (channel_id, chave),
        )
        conn.commit()
    finally:
        conn.close()
