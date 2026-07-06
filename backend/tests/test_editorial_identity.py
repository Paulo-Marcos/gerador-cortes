"""Testes da identidade editorial do mascote (D-220 / E-010 → D-285).

Desde a D-285 o BANCO (`settings_store`) é a fonte da verdade e o
`editorial/mascote.yaml` é espelho/fallback+migração. Cobrimos o contrato do
accessor `identidade_do_mascote`:
  - banco é a fonte da verdade (linha no banco vence o yaml);
  - seed/migração idempotente (sem linha + yaml → semeia o banco, e a 2ª leitura
    já vem do banco, sem reler o yaml);
  - fallback para o yaml (sem linha, com yaml);
  - fallback NEUTRO (nada em lugar nenhum → "mascote");
  - `definir_nome_do_mascote` grava no banco e espelha no yaml.

A não-regressão dos prompts da PROD é provada em
`test_prompts_mascote_nao_regressao.py`. Tudo aqui é isolado por `tmp_path` — um
`settings.db` e um diretório editorial próprios por teste; nenhum toca o
`instance/` real.
"""

from __future__ import annotations

from pathlib import Path

from app.editorial_identity import (
    MASCOTE_NEUTRO,
    Mascote,
    definir_nome_do_mascote,
    identidade_do_mascote,
)
from app.services import settings_store

_CANAL = "canal-teste"


def _db(tmp_path: Path) -> Path:
    return tmp_path / "settings.db"


def _editorial_com_yaml(tmp_path: Path, nome: str) -> Path:
    editorial = tmp_path / "editorial"
    editorial.mkdir()
    (editorial / "mascote.yaml").write_text(
        f'config_version: 1\nnome: "{nome}"\n', encoding="utf-8"
    )
    return editorial


def test_banco_e_fonte_da_verdade(tmp_path: Path):
    # Banco tem "Rã"; yaml tem "Sapo" — o banco vence.
    db = _db(tmp_path)
    settings_store.gravar_mascote(db, _CANAL, {"nome": "Rã"})
    editorial = _editorial_com_yaml(tmp_path, "Sapo")

    mascote = identidade_do_mascote(editorial_root=editorial, db_path=db, channel_id=_CANAL)

    assert mascote == Mascote(nome="Rã")


def test_semeia_do_yaml_quando_banco_vazio(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial_com_yaml(tmp_path, "Sapo")

    mascote = identidade_do_mascote(editorial_root=editorial, db_path=db, channel_id=_CANAL)

    assert mascote.nome == "Sapo"
    # Efeito colateral: o banco foi semeado a partir do yaml (migração).
    assert settings_store.ler_mascote(db, _CANAL) == {"nome": "Sapo"}


def test_migracao_idempotente(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial_com_yaml(tmp_path, "Sapo")

    primeira = identidade_do_mascote(editorial_root=editorial, db_path=db, channel_id=_CANAL)
    # Muda o yaml DEPOIS de semeado: a 2ª leitura deve vir do banco, não do yaml.
    (editorial / "mascote.yaml").write_text('nome: "Outro"\n', encoding="utf-8")
    segunda = identidade_do_mascote(editorial_root=editorial, db_path=db, channel_id=_CANAL)

    assert primeira.nome == "Sapo"
    assert segunda.nome == "Sapo"


def test_fallback_para_yaml_sem_banco(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial_com_yaml(tmp_path, "Sapo")

    assert identidade_do_mascote(
        editorial_root=editorial, db_path=db, channel_id=_CANAL
    ) == Mascote(nome="Sapo")


def test_fallback_neutro_quando_nada_existe(tmp_path: Path):
    # Sem linha no banco e sem yaml — clone limpo / canal sem editorial.
    db = _db(tmp_path)

    mascote = identidade_do_mascote(editorial_root=tmp_path, db_path=db, channel_id=_CANAL)

    assert mascote == MASCOTE_NEUTRO
    assert mascote.nome == "mascote"


def test_fallback_neutro_quando_nome_vazio(tmp_path: Path):
    db = _db(tmp_path)
    (tmp_path / "mascote.yaml").write_text('config_version: 1\nnome: ""\n', encoding="utf-8")

    assert (
        identidade_do_mascote(editorial_root=tmp_path, db_path=db, channel_id=_CANAL)
        == MASCOTE_NEUTRO
    )


def test_fallback_neutro_quando_yaml_invalido(tmp_path: Path):
    db = _db(tmp_path)
    (tmp_path / "mascote.yaml").write_text(": : : não é yaml válido :", encoding="utf-8")

    assert (
        identidade_do_mascote(editorial_root=tmp_path, db_path=db, channel_id=_CANAL)
        == MASCOTE_NEUTRO
    )


def test_definir_nome_grava_no_banco_e_espelha_no_yaml(tmp_path: Path):
    db = _db(tmp_path)
    editorial = _editorial_com_yaml(tmp_path, "Antigo")

    resultado = definir_nome_do_mascote(
        "Sapo", editorial_root=editorial, db_path=db, channel_id=_CANAL
    )

    assert resultado == Mascote(nome="Sapo")
    # Fonte da verdade (banco) atualizada.
    assert settings_store.ler_mascote(db, _CANAL) == {"nome": "Sapo"}
    # Espelho (yaml) atualizado, preservando as demais chaves.
    import yaml

    dados = yaml.safe_load((editorial / "mascote.yaml").read_text(encoding="utf-8"))
    assert dados["nome"] == "Sapo"
    assert dados["config_version"] == 1
    # E a próxima leitura reflete o novo nome (via banco).
    assert identidade_do_mascote(
        editorial_root=editorial, db_path=db, channel_id=_CANAL
    ) == Mascote(nome="Sapo")


def test_definir_nome_vazio_resulta_neutro(tmp_path: Path):
    db = _db(tmp_path)

    resultado = definir_nome_do_mascote("  ", editorial_root=tmp_path, db_path=db, channel_id=_CANAL)

    assert resultado == MASCOTE_NEUTRO
    assert settings_store.ler_mascote(db, _CANAL) == {"nome": ""}
