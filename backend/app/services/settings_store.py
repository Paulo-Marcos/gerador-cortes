"""Armazenamento das configurações da aplicação no banco (D-191).

Este é o backend de persistência ÚNICO das configurações editáveis pelo app —
um SQLite pequeno e global (`instance/settings.db`) que substitui os arquivos
`app_settings.json` (ajustes de app por canal) e `channel.yaml` (identidade do
canal) como FONTE DA VERDADE. Os arquivos continuam sendo escritos como espelho
de compatibilidade/backup pelos serviços que consomem este módulo — ver
`services/app_settings.py` e `services/channels.py`.

DECISÃO DE TOPOLOGIA (D-191, Opção A): um único banco global de settings, com as
linhas de escopo por canal chaveadas por `channel_id`. O banco pesado de dados
(`projetos.db`, ~70GB) NÃO é tocado — settings vivem à parte, então evoluir a
config nunca arrisca os dados/vídeos. Listar canais é uma query só, sem abrir o
banco de cada canal.

  - `app_settings`      (channel_id PK): log_level, filtro, layout YT global e o
                        bloco `render.*`. É o que hoje vive no `app_settings.json`
                        (que já é por canal).
  - `channel_identity`  (channel_id PK): handle, nome, credito, youtube_channel_id
                        e a paleta. É o que hoje vive no `channel.yaml`.

Camada `services/`: I/O puro de SQLite, síncrono (os consumidores — accessors de
identidade e AppSettingsService — são chamados de contexto síncrono, inclusive
como default callable de colunas em `models.py`). As funções recebem `db_path`
explícito, o que dá isolamento trivial por teste (cada `tmp_path` tem seu banco).
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

# Chaves do bloco de app settings (espelham AppSettings/RenderSettings em
# `services/app_settings.py`). Mantidas planas na tabela (render_* achatado)
# para uma linha por canal simples de ler/gravar.
_APP_COLUNAS = (
    "log_level",
    "filtro_global_padrao",
    "youtube_layout_padrao_global",
    "render_cooldown_sec",
    "render_overlay_concurrency",
    "render_bundle_cache_enabled",
    "render_overlay_codec",
    "render_overlay_max_attempts",
    "render_grade_global_quality",
)

_IDENTIDADE_COLUNAS = (
    "handle",
    "nome",
    "credito",
    "youtube_channel_id",
    "paleta_primaria",
    "paleta_secundaria",
    "paleta_acento",
)

# Identidade EDITORIAL do mascote (D-285): o `nome` citado nos prompts de
# thumbnail/metadados. Espelha `editorial/mascote.yaml`, por canal — o mesmo
# padrão banco-fonte-da-verdade + arquivo-espelho aplicado à identidade do canal.
_MASCOTE_COLUNAS = ("nome",)

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS app_settings (
        channel_id TEXT PRIMARY KEY,
        log_level TEXT NOT NULL DEFAULT 'disabled',
        filtro_global_padrao TEXT NOT NULL DEFAULT 'bypass_dourado_aberto',
        youtube_layout_padrao_global TEXT NOT NULL DEFAULT '{}',
        render_cooldown_sec INTEGER NOT NULL DEFAULT 0,
        render_overlay_concurrency INTEGER NOT NULL DEFAULT 4,
        render_bundle_cache_enabled INTEGER NOT NULL DEFAULT 1,
        render_overlay_codec TEXT NOT NULL DEFAULT 'prores_4444',
        render_overlay_max_attempts INTEGER NOT NULL DEFAULT 3,
        render_grade_global_quality INTEGER NOT NULL DEFAULT 30
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS channel_identity (
        channel_id TEXT PRIMARY KEY,
        handle TEXT NOT NULL DEFAULT '',
        nome TEXT NOT NULL DEFAULT '',
        credito TEXT NOT NULL DEFAULT '',
        youtube_channel_id TEXT NOT NULL DEFAULT '',
        paleta_primaria TEXT NOT NULL DEFAULT '',
        paleta_secundaria TEXT NOT NULL DEFAULT '',
        paleta_acento TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS mascote_identity (
        channel_id TEXT PRIMARY KEY,
        nome TEXT NOT NULL DEFAULT ''
    )
    """,
)


def _connect(db_path: Path) -> sqlite3.Connection:
    """Abre o banco de settings garantindo o schema (idempotente) e WAL.

    Cria o arquivo/diretório se preciso; roda o DDL `IF NOT EXISTS` a cada abertura
    para que um banco novo (primeiro boot, split PROD/DEV) já nasça com as tabelas.
    """
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    for ddl in _DDL:
        conn.execute(ddl)
    conn.commit()
    return conn


def inicializar(db_path: Path) -> None:
    """Garante o arquivo do banco e as tabelas de settings. No-op se já existem."""
    _connect(db_path).close()


# --------------------------------------------------------------------------- #
# App settings (bloco por canal — espelha app_settings.json)
# --------------------------------------------------------------------------- #


def ler_app_settings(db_path: Path, channel_id: str) -> dict | None:
    """Lê a linha de app settings do canal, ou `None` se ainda não existe.

    `None` sinaliza ao chamador para cair no arquivo legado (fallback/migração):
    ver `AppSettingsService`.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM app_settings WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _APP_COLUNAS}


def gravar_app_settings(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a linha de app settings do canal.

    `valores` deve conter todas as chaves de `_APP_COLUNAS`. Escrita idempotente:
    reescrever a mesma linha é seguro.
    """
    colunas = ("channel_id", *_APP_COLUNAS)
    placeholders = ", ".join("?" for _ in colunas)
    atribuicoes = ", ".join(f"{c}=excluded.{c}" for c in _APP_COLUNAS)
    parametros = (channel_id, *(valores[c] for c in _APP_COLUNAS))
    conn = _connect(db_path)
    try:
        conn.execute(
            f"INSERT INTO app_settings ({', '.join(colunas)}) VALUES ({placeholders}) "
            f"ON CONFLICT(channel_id) DO UPDATE SET {atribuicoes}",
            parametros,
        )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Identidade do canal (espelha channel.yaml)
# --------------------------------------------------------------------------- #


def ler_identidade(db_path: Path, channel_id: str) -> dict | None:
    """Lê a linha de identidade do canal, ou `None` se ainda não existe."""
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM channel_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _IDENTIDADE_COLUNAS}


def gravar_identidade(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a identidade do canal a partir dos campos presentes.

    Faz merge: só as colunas presentes em `valores` são alteradas; as demais são
    preservadas (ou nascem com o default do schema numa linha nova). Espelha a
    semântica de merge raso de `channels._aplicar_identidade`.
    """
    presentes = [c for c in _IDENTIDADE_COLUNAS if c in valores]
    conn = _connect(db_path)
    try:
        existe = conn.execute(
            "SELECT 1 FROM channel_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
        if existe is None:
            conn.execute("INSERT INTO channel_identity (channel_id) VALUES (?)", (channel_id,))
        if presentes:
            sets = ", ".join(f"{c}=?" for c in presentes)
            conn.execute(
                f"UPDATE channel_identity SET {sets} WHERE channel_id = ?",
                (*(str(valores[c]) for c in presentes), channel_id),
            )
        conn.commit()
    finally:
        conn.close()


def listar_identidades(db_path: Path) -> dict[str, dict]:
    """Todas as identidades do banco, indexadas por `channel_id`.

    Usado pela listagem de canais para compor a identidade sem abrir o banco de
    cada canal. Canais sem linha (ainda não migrados) não aparecem aqui — o
    chamador completa pelo `channel.yaml`.
    """
    conn = _connect(db_path)
    try:
        linhas = conn.execute("SELECT * FROM channel_identity").fetchall()
    finally:
        conn.close()
    return {
        row["channel_id"]: {coluna: row[coluna] for coluna in _IDENTIDADE_COLUNAS} for row in linhas
    }


# --------------------------------------------------------------------------- #
# Identidade do mascote (D-285 — espelha editorial/mascote.yaml)
# --------------------------------------------------------------------------- #


def ler_mascote(db_path: Path, channel_id: str) -> dict | None:
    """Lê a identidade do mascote do canal, ou `None` se ainda não existe.

    `None` sinaliza ao chamador para cair no arquivo legado (`mascote.yaml`) e
    semear o banco — ver `editorial_identity.identidade_do_mascote`.
    """
    conn = _connect(db_path)
    try:
        row = conn.execute(
            "SELECT * FROM mascote_identity WHERE channel_id = ?", (channel_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {coluna: row[coluna] for coluna in _MASCOTE_COLUNAS}


def gravar_mascote(db_path: Path, channel_id: str, valores: dict) -> None:
    """Grava (UPSERT) a identidade do mascote do canal.

    `valores` deve conter a chave `nome`. Escrita idempotente: reescrever a mesma
    linha é seguro (semeadura no primeiro acesso, edição pela UI).
    """
    colunas = ("channel_id", *_MASCOTE_COLUNAS)
    placeholders = ", ".join("?" for _ in colunas)
    atribuicoes = ", ".join(f"{c}=excluded.{c}" for c in _MASCOTE_COLUNAS)
    parametros = (channel_id, *(str(valores[c]) for c in _MASCOTE_COLUNAS))
    conn = _connect(db_path)
    try:
        conn.execute(
            f"INSERT INTO mascote_identity ({', '.join(colunas)}) VALUES ({placeholders}) "
            f"ON CONFLICT(channel_id) DO UPDATE SET {atribuicoes}",
            parametros,
        )
        conn.commit()
    finally:
        conn.close()
