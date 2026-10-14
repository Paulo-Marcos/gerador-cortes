"""A tradução e o "já vi" de cada novidade, no `settings.db` (D-922).

O texto em si mora no CHANGELOG; aqui ficam só o que o app acrescenta a ele,
chaveado pela `chave` da entrada (o hash do texto). Global, e não por canal: o
app é um só para todos os canais.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

_ESPERA_PELO_BANCO_MS = 30_000

_DDL = (
    """
    CREATE TABLE IF NOT EXISTS novidade_traduzida (
        chave TEXT PRIMARY KEY,
        titulo TEXT NOT NULL,
        resumo TEXT NOT NULL,
        como_usar TEXT NOT NULL DEFAULT '',
        traduzida_em TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS novidade_vista (
        chave TEXT PRIMARY KEY,
        vista_em TEXT NOT NULL
    )
    """,
)


def _conectar(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(f"PRAGMA busy_timeout={_ESPERA_PELO_BANCO_MS}")
    for ddl in _DDL:
        conn.execute(ddl)
    return conn


def _agora() -> str:
    return datetime.now(UTC).isoformat()


def ler_traducoes(db_path: Path) -> dict[str, dict[str, str]]:
    """chave → {titulo, resumo, como_usar}."""
    conn = _conectar(db_path)
    try:
        linhas = conn.execute(
            "SELECT chave, titulo, resumo, como_usar FROM novidade_traduzida"
        ).fetchall()
    finally:
        conn.close()
    return {
        linha["chave"]: {
            "titulo": linha["titulo"],
            "resumo": linha["resumo"],
            "como_usar": linha["como_usar"],
        }
        for linha in linhas
    }


def gravar_traducoes(db_path: Path, traducoes: dict[str, dict[str, str]]) -> None:
    conn = _conectar(db_path)
    try:
        conn.executemany(
            "INSERT INTO novidade_traduzida (chave, titulo, resumo, como_usar, traduzida_em) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET "
            "titulo = excluded.titulo, resumo = excluded.resumo, "
            "como_usar = excluded.como_usar, traduzida_em = excluded.traduzida_em",
            [
                (chave, t["titulo"], t["resumo"], t["como_usar"], _agora())
                for chave, t in traducoes.items()
            ],
        )
        conn.commit()
    finally:
        conn.close()


def ler_vistas(db_path: Path) -> set[str]:
    conn = _conectar(db_path)
    try:
        linhas = conn.execute("SELECT chave FROM novidade_vista").fetchall()
    finally:
        conn.close()
    return {linha["chave"] for linha in linhas}


def marcar_vistas(db_path: Path, chaves: list[str]) -> None:
    conn = _conectar(db_path)
    try:
        conn.executemany(
            "INSERT OR IGNORE INTO novidade_vista (chave, vista_em) VALUES (?, ?)",
            [(chave, _agora()) for chave in chaves],
        )
        conn.commit()
    finally:
        conn.close()


def ler_arquivos_do_changelog(raiz: Path) -> tuple[str, dict[str, str]]:
    """O `CHANGELOG.md` e os fragmentos de `changelog.d/` da raiz do repositório.

    Arquivo ausente é texto vazio: um app sem CHANGELOG mostra a tela vazia,
    não um erro.
    """
    changelog = raiz / "CHANGELOG.md"
    pasta = raiz / "changelog.d"
    texto = changelog.read_text(encoding="utf-8") if changelog.is_file() else ""
    fragmentos = (
        {f.name: f.read_text(encoding="utf-8") for f in pasta.glob("*.md") if f.is_file()}
        if pasta.is_dir()
        else {}
    )
    return texto, fragmentos
