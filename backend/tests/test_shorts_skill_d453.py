"""D-453: a skill editorial 'Propor shorts' nasce no banco, por canal.

A D-358 registrou a dívida que esta demanda evita: na versão antiga da feature, o
prompt de sugestão de shorts era hardcoded no serviço. Aqui ele entra pelo mesmo
caminho das outras seis skills — corpo + params no `editorial_skill`, contrato de
saída no scaffold, defaults genéricos versionados em `examples/`.

O que se prova:
  - resolver a skill semeia o banco a partir do template genérico versionado;
  - os params saem dos globais de `config.settings` (modelo e thinking próprios);
  - o scaffold default passa no guardrail — placeholders exatos e marcador
    presente —, que é o que impede um scaffold editado na UI de quebrar o builder.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app import editorial_scaffolds, editorial_skills
from app.config import settings

_CANAL = "canal-teste"
_SKILL = "shorts-expert"
_SCAFFOLD = "shorts"


def _kw(tmp_path: Path) -> dict:
    editorial = tmp_path / "editorial"
    editorial.mkdir(exist_ok=True)
    return {
        "db_path": tmp_path / "settings.db",
        "channel_id": _CANAL,
        "editorial_root": editorial,
    }


def test_skill_de_shorts_esta_no_catalogo_sem_lentes(tmp_path: Path):
    """Selecão de short precisa ser comparável entre cortes, então sem lentes."""
    cat = next(c for c in editorial_skills.catalogo() if c.key == _SKILL)

    assert cat.etapa == "Propor shorts"
    assert cat.arquivo == "shorts.md"
    assert cat.lentes_tipo is None


def test_resolver_semeia_corpo_e_params_do_default_versionado(tmp_path: Path):
    resolvida = editorial_skills.resolver_skill(_SKILL, **_kw(tmp_path))

    assert "auto-contido" in resolvida.corpo.lower()
    assert resolvida.modelo == settings.claude_model_shorts
    assert resolvida.thinking_tokens == settings.claude_cli_thinking_tokens_shorts
    assert resolvida.timeout == settings.claude_cli_timeout
    assert resolvida.lentes == []


def test_scaffold_default_passa_no_guardrail(tmp_path: Path):
    """O contrato de saída versionado precisa ser válido para o builder da D-454."""
    template = editorial_scaffolds.resolver_scaffold(_SCAFFOLD, **_kw(tmp_path))
    cat = next(c for c in editorial_scaffolds.catalogo() if c.key == _SCAFFOLD)

    editorial_scaffolds.validar_scaffold(template, cat)

    assert "{texto_transcricao}" in template
    assert "{faixa_duracao}" in template
    # O invariante que mais pode nos morder na D-454: o tempo é o do bruto.
    assert "BRUTO" in template


def test_scaffold_sem_o_marcador_e_recusado(tmp_path: Path):
    """Editar o scaffold na UI e apagar a chave 'shorts' quebraria o parser."""
    cat = next(c for c in editorial_scaffolds.catalogo() if c.key == _SCAFFOLD)
    sem_marcador = (
        "{titulo} {tema_central} {duracao_humana} "
        "{quantidade_alvo} {faixa_duracao} {texto_transcricao}"
    )

    with pytest.raises(ValueError):
        editorial_scaffolds.validar_scaffold(sem_marcador, cat)
