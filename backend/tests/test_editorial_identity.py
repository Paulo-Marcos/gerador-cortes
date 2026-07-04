"""Testes da fonte editorial da identidade do mascote (D-220 / E-010).

Cobrem o caminho feliz (lê `nome` do `editorial/mascote.yaml`) e o FALLBACK
NEUTRO (arquivo ausente/vazio/inválido → "mascote"). A não-regressão da PROD é
provada em `test_prompts_mascote_nao_regressao.py`; aqui garantimos o contrato do
accessor. Tudo isolado por `tmp_path` — nenhum teste toca o `instance/` real.
"""

from __future__ import annotations

from pathlib import Path

from app.editorial_identity import (
    MASCOTE_NEUTRO,
    identidade_do_mascote,
)


def test_le_nome_do_mascote_yaml(tmp_path: Path):
    editorial = tmp_path / "editorial"
    editorial.mkdir()
    (editorial / "mascote.yaml").write_text('config_version: 1\nnome: "Sapo"\n', encoding="utf-8")

    mascote = identidade_do_mascote(editorial_root=editorial)

    assert mascote.nome == "Sapo"


def test_fallback_neutro_quando_arquivo_ausente(tmp_path: Path):
    # Diretório existe mas não tem mascote.yaml — clone limpo / canal sem editorial.
    mascote = identidade_do_mascote(editorial_root=tmp_path)

    assert mascote == MASCOTE_NEUTRO
    assert mascote.nome == "mascote"


def test_fallback_neutro_quando_nome_vazio(tmp_path: Path):
    (tmp_path / "mascote.yaml").write_text('config_version: 1\nnome: ""\n', encoding="utf-8")

    assert identidade_do_mascote(editorial_root=tmp_path) == MASCOTE_NEUTRO


def test_fallback_neutro_quando_yaml_invalido(tmp_path: Path):
    (tmp_path / "mascote.yaml").write_text(": : : não é yaml válido :", encoding="utf-8")

    assert identidade_do_mascote(editorial_root=tmp_path) == MASCOTE_NEUTRO
