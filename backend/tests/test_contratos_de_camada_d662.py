"""As fronteiras das camadas são verificadas por máquina (D-662).

Os contratos moram em `pyproject.toml` (`[tool.importlinter]`). Rodar aqui, e
não só no CI, é o que faz o portão local — `pytest` — pegar um import na
direção errada antes do push.
"""

from pathlib import Path

import pytest

importlinter_cli = pytest.importorskip("importlinter.cli")

BACKEND = Path(__file__).resolve().parents[1]
PYPROJECT = BACKEND / "pyproject.toml"


def _rodar(config: Path) -> int:
    return importlinter_cli.lint_imports(config_filename=str(config), no_cache=True, no_logo=True)


def test_os_contratos_de_camada_valem_hoje(monkeypatch):
    monkeypatch.chdir(BACKEND)

    assert _rodar(PYPROJECT) == 0, "um import novo cruzou uma fronteira (ver saída acima)"


def test_a_catraca_pega_a_divida_quando_a_excecao_sai(monkeypatch, tmp_path):
    """Sem a exceção registrada, o import de `models` para `services` aparece.

    Prova que o contrato enxerga o código real — um contrato que passa sempre
    não guarda nada. Quando a D-666 quitar essa dívida, este teste falha e
    manda apagar a exceção (o import-linter recusa exceção que não casa mais).
    """
    monkeypatch.chdir(BACKEND)
    excecao = '    "app.models -> app.services.channels",\n'
    texto = PYPROJECT.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert excecao in texto, "a exceção mudou de forma; atualize este teste"
    sem_excecao = tmp_path / "pyproject.toml"
    sem_excecao.write_text(texto.replace(excecao, ""), encoding="utf-8")

    assert _rodar(sem_excecao) != 0
