"""O schema do projetos.db que o boot entrega (D-701).

Teste de caracterização, antes de o boot passar a um caminho só. Entra pelo
`init_db`, num banco temporário, e fixa o que ele garante: banco novo ou antigo
sai com todas as tabelas, colunas e índices do modelo e com o `user_version` da
última migration; a coluna que faltava chega com o default do modelo, inclusive
nas linhas que já existiam; e um segundo boot não muda nada.

O "banco antigo" é o de hoje sem o que a lista de ALTERs do boot acrescentava —
escrito aqui, e não lido do `database.py`, porque a lista é o que sai.
"""

from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

import pytest
from app import database
from app.migrations import MIGRATIONS, reconciliacao
from app.models import Base
from sqlalchemy.ext.asyncio import create_async_engine

_TABELAS_DEPOIS = ("layout_presets", "live_candidatas", "avaliacoes_thumbnail")
_COLUNAS_DEPOIS = {
    "projetos": (
        "arquivos_limpos legenda_offset_ms ultima_analise_em versao_renderer "
        "sombra_nivel_padrao layout_card_padrao layout_youtube_padrao fonte_preset "
        "descartados_analise pontuacao_ranking falantes_map voto_qualidade_live"
    ).split(),
    "cortes": (
        "is_leitura autor_leitura parte_leitura transcricao_corte transcricao_final "
        "transcricao_final_texto cenas_remotion layout_youtube is_pos_producao "
        "duracao_clip_seg cenas_validadas cenas_validadas_em segmentos_detectados "
        "hints_thumbnail audio_offset_ms arranjo_blocos justificativa"
    ).split(),
}


def _afinidade(tipo: str) -> str:
    tipo = tipo.upper()
    if "INT" in tipo:
        return "INTEGER"
    if any(t in tipo for t in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if any(t in tipo for t in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


def _boot(db: Path, monkeypatch) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{db.as_posix()}")
    monkeypatch.setattr(database, "engine", engine)

    async def subir():
        await database.init_db()
        await engine.dispose()

    asyncio.run(subir())


def _foto(db: Path) -> tuple[int, list[tuple]]:
    with sqlite3.connect(db) as c:
        versao = c.execute("PRAGMA user_version").fetchone()[0]
        objetos = c.execute("SELECT type, name, sql FROM sqlite_master ORDER BY type, name")
        return versao, objetos.fetchall()


def _colunas(db: Path, tabela: str) -> dict[str, tuple]:
    with sqlite3.connect(db) as c:
        return {r[1]: (r[2], r[4]) for r in c.execute(f"PRAGMA table_info({tabela})")}


def _banco_antigo(db: Path) -> None:
    engine = create_async_engine(f"sqlite+aiosqlite:///{db.as_posix()}")

    async def criar():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await engine.dispose()

    asyncio.run(criar())
    with sqlite3.connect(db) as c:
        for tabela in _TABELAS_DEPOIS:
            c.execute(f"DROP TABLE {tabela}")
        for tabela, colunas in _COLUNAS_DEPOIS.items():
            for coluna in colunas:
                c.execute(f"ALTER TABLE {tabela} DROP COLUMN {coluna}")
        c.execute(
            "INSERT INTO projetos (id, youtube_url, titulo_live, canal_origem, duracao_segundos,"
            " data_live, arquivo_video_path, transcricao_raw, status, progresso_download,"
            " erro_msg, rebaixando_video, criado_em, atualizado_em) VALUES ('p1', 'u', '', '',"
            " 0, '', '', '[]', 'pronto', 0, '', 0, '2026-01-01', '2026-01-01')"
        )
        c.execute("PRAGMA user_version = 0")


def _confere_o_modelo(db: Path) -> None:
    with sqlite3.connect(db) as c:
        tabelas = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        indices = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    for tabela in Base.metadata.sorted_tables:
        assert tabela.name in tabelas
        no_banco = _colunas(db, tabela.name)
        assert set(no_banco) == {c.name for c in tabela.columns}, tabela.name
        for coluna in tabela.columns:
            esperada = _afinidade(coluna.type.compile(dialect=reconciliacao._DIALETO_SQLITE))
            assert _afinidade(no_banco[coluna.name][0]) == esperada, (tabela.name, coluna.name)
        assert {i.name for i in tabela.indexes} <= indices, tabela.name
    assert _foto(db)[0] == MIGRATIONS[-1].version


def test_banco_novo_sai_com_o_schema_do_modelo(tmp_path, monkeypatch):
    db = tmp_path / "novo.db"

    _boot(db, monkeypatch)

    _confere_o_modelo(db)


def test_banco_antigo_ganha_o_que_faltava_com_o_default_do_modelo(tmp_path, monkeypatch):
    db = tmp_path / "antigo.db"
    _banco_antigo(db)

    _boot(db, monkeypatch)

    _confere_o_modelo(db)
    for tabela, colunas in _COLUNAS_DEPOIS.items():
        no_banco = _colunas(db, tabela)
        for nome in colunas:
            esperado = reconciliacao._default_sql(Base.metadata.tables[tabela].columns[nome])
            assert no_banco[nome][1] == esperado, (tabela, nome)
    with sqlite3.connect(db) as c:
        linha = c.execute("SELECT versao_renderer, arquivos_limpos FROM projetos").fetchone()
    assert linha == ("v2", 0), "a linha que já existia ganha o default da coluna nova"


@pytest.mark.parametrize("comeco", ["novo", "antigo"])
def test_o_segundo_boot_nao_muda_nada(tmp_path, monkeypatch, comeco):
    db = tmp_path / f"{comeco}.db"
    if comeco == "antigo":
        _banco_antigo(db)
    _boot(db, monkeypatch)
    depois_do_primeiro = _foto(db)

    _boot(db, monkeypatch)

    assert _foto(db) == depois_do_primeiro
