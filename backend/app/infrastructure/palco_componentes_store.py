"""Armazenamento dos componentes do palco por canal, no `settings.db` (D-911).

Vive fora do `settings_store` por tamanho: aquele módulo já está no teto da
catraca de 500 linhas (lista de exceções da D-771), e cada bloco novo que entra
lá empurra o próximo a sair. A conexão, o WAL e a espera pelo banco continuam
sendo os dele — este módulo só conhece a própria tabela.

Uma linha JSON por canal, e não colunas: o contrato mora em
`domain/canal/palco_componentes.py`, e cada componente novo entraria aqui como
mais um ALTER TABLE sem ganhar nada — o store só guarda e devolve.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from app.infrastructure import settings_store

_DDL = """
CREATE TABLE IF NOT EXISTS palco_componentes (
    channel_id TEXT PRIMARY KEY,
    dados_json TEXT NOT NULL DEFAULT '{}'
)
"""


def _connect(db_path: Path) -> sqlite3.Connection:
    conn = settings_store._connect(db_path)
    conn.execute(_DDL)
    return conn


def ler_palco_componentes(db_path: Path, channel_id: str) -> dict | None:
    """O JSON dos componentes do palco do canal, ou `None` se nunca gravou.

    JSON ilegível conta como ausente: um registro corrompido não pode derrubar
    um render, e o serviço cai no padrão do domínio.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT dados_json FROM palco_componentes WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    try:
        dados = json.loads(row["dados_json"])
    except (TypeError, ValueError):
        return None
    return dados if isinstance(dados, dict) else None


def gravar_palco_componentes(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) os componentes do palco do canal. Escrita idempotente."""
    conn = _connect(db_path)
    try:
        conn.execute(
            "INSERT INTO palco_componentes (channel_id, dados_json) VALUES (?, ?) "
            "ON CONFLICT(channel_id) DO UPDATE SET dados_json = excluded.dados_json",
            (channel_id, json.dumps(valores, ensure_ascii=False, sort_keys=True)),
        )
        conn.commit()
    finally:
        conn.close()
