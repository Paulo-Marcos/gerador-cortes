"""A regra "toda mudança vem com teste" continua escrita onde os agentes leem (D-860).

Pedido do Paulo, 02/10/2026: pedidos chegavam à main com uma função ou uma
parte da organização a menos, e nada acusava. A regra mora no AGENTS.md, no
CONTRIBUTING, nas regras por pasta (cópias em .claude/ e .agents/, uma por
escopo) e no template de PR, que pede a tabela pedido → teste. Este teste quebra se alguma delas
sumir ou voltar à versão antiga, que só exigia teste em domain/services.
"""

from pathlib import Path

import pytest

_REPO = Path(__file__).resolve().parents[2]
_REGRA = "Toda mudança vem com teste"
_REGRAS_POR_PASTA = [
    f"{pasta}/rules/{escopo}.md"
    for pasta in (".claude", ".agents")
    for escopo in ("backend", "front-end", "remotion")
]


def _ler(relativo: str) -> str:
    return (_REPO / relativo).read_text(encoding="utf-8")


def test_o_agents_md_exige_teste_em_toda_mudanca():
    texto = _ler("AGENTS.md")
    assert _REGRA in texto
    assert "pedido → teste" in texto
    # A regra de defeito, que já existia, continua: o teste falha antes e passa depois.
    assert "teste que falha antes e passa depois" in texto


def test_o_contributing_exige_teste_em_toda_mudanca():
    texto = _ler("CONTRIBUTING.md")
    assert "toda mudança vem com teste" in texto
    assert "nasce com teste" not in texto


@pytest.mark.parametrize("arquivo", _REGRAS_POR_PASTA)
def test_cada_regra_por_pasta_exige_teste_em_toda_mudanca(arquivo):
    texto = _ler(arquivo)
    assert _REGRA in texto
    assert "nasce com teste do caminho feliz." not in texto
    # O frontend não tem Testing Library nem DOM: a regra não pode mandar usá-los.
    assert "Testing Library" not in texto


def test_o_template_de_pr_pede_a_tabela_pedido_teste():
    texto = _ler(".github/pull_request_template.md")
    assert "## Pedido → teste" in texto
    assert "| Pedido | Teste |" in texto
