"""D-911: o store dos componentes do palco (uma linha JSON por canal)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.infrastructure import palco_componentes_store as store


def test_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    dados = {"estilo": "limpo", "cabecalho": {"ativo": True, "nome": "Pedro"}}
    store.gravar_palco_componentes(db, "canal-a", dados)

    assert store.ler_palco_componentes(db, "canal-a") == dados
    # Canal sem linha → None (o serviço cai no padrão do domínio).
    assert store.ler_palco_componentes(db, "outro") is None


def test_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    store.gravar_palco_componentes(db, "c", {"estilo": "atual"})
    store.gravar_palco_componentes(db, "c", {"estilo": "limpo"})

    assert store.ler_palco_componentes(db, "c") == {"estilo": "limpo"}


def test_json_quebrado_conta_como_ausente(tmp_path: Path):
    db = tmp_path / "settings.db"
    store.gravar_palco_componentes(db, "c", {"estilo": "limpo"})
    with sqlite3.connect(db) as conn:
        conn.execute(
            "UPDATE palco_componentes SET dados_json = '{nao e json' WHERE channel_id = 'c'"
        )

    assert store.ler_palco_componentes(db, "c") is None


def test_convive_com_o_settings_db_de_sempre(tmp_path: Path):
    """A tabela nasce no banco de settings já existente, sem mexer nas outras."""
    from app.infrastructure import settings_store

    db = tmp_path / "settings.db"
    settings_store.gravar_tema(db, "c", "atual")
    store.gravar_palco_componentes(db, "c", {"estilo": "limpo"})
    assert settings_store.ler_tema(db, "c") == "atual"
    assert store.ler_palco_componentes(db, "c") == {"estilo": "limpo"}
