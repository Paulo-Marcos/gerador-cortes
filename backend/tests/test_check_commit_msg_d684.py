"""O hook de commit confere o padrão do AGENTS.md (D-684)."""

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "check_commit_msg.py"
_spec = importlib.util.spec_from_file_location("check_commit_msg", _SCRIPT)
padrao = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(padrao)


@pytest.mark.parametrize(
    "cabecalho",
    [
        "✨ feat(D-684): o hook confere o padrão de commit",
        "🧹 chore: atualiza dependências",
        "♻" + chr(0xFE0F) + " refactor(E-051): inverte a seta do cliente",  # com o seletor
        "♻ refactor(E-051): inverte a seta do cliente",  # sem ele
        "Merge branch 'release/0.3'",
        'Revert "✨ feat: algo"',
        "fixup! 🐛 fix: corrige a borda",
    ],
)
def test_cabecalho_no_padrao_passa_sem_erro(cabecalho):
    erros, _ = padrao.conferir(cabecalho)
    assert erros == []


@pytest.mark.parametrize(
    ("cabecalho", "trecho_do_erro"),
    [
        ("feature: título da tarefa", "o cabeçalho deve ser"),  # o formato do guia finish
        ("feat(D-1): sem emoji", "o cabeçalho deve ser"),
        ("🔧 feature(D-1): tipo antigo", "fora da lista canônica"),
        ("🐛 bug: tipo que não existe", "fora da lista canônica"),
        ("x fix: letra no lugar do emoji", "falta o emoji"),
        ("✨ feat:sem espaço depois dos dois pontos", "o cabeçalho deve ser"),
        ("", "mensagem vazia"),
    ],
)
def test_cabecalho_fora_do_padrao_bloqueia(cabecalho, trecho_do_erro):
    erros, _ = padrao.conferir(cabecalho)
    assert any(trecho_do_erro in erro for erro in erros)


def test_estilo_so_avisa():
    erros, avisos = padrao.conferir("🔧 chore(D-684): Atualiza a config.")
    assert erros == []
    assert len(avisos) == 2  # emoji fora da tabela, ponto final

    erros, avisos = padrao.conferir("📝 docs(D-684): " + "palavra " * 10 + "fim")
    assert erros == []
    assert any("caracteres" in aviso for aviso in avisos)


def test_cabecalho_pula_comentarios_e_linhas_vazias():
    mensagem = "\n# comentário do editor\n✨ feat: algo\n\ncorpo\n"
    assert padrao.cabecalho_da_mensagem(mensagem) == "✨ feat: algo"
