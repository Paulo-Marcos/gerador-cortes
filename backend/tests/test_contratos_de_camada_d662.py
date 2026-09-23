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


def test_o_linter_enxerga_o_codigo_real(monkeypatch, tmp_path):
    """Um contrato proibindo uma seta que existe tem de reprovar.

    Prova que o import-linter lê o código real — um contrato que passa sempre
    não guarda nada. A sonda proíbe `routers -> services`, a seta que todo
    router usa. Antes a prova tirava uma exceção do `ignore_imports` e esperava
    a dívida aparecer, mas cada dívida quitada a derrubava (`models ->
    services.channels` na D-666, os routers da E-051); a sonda não depende de
    dívida nenhuma e continua valendo com o `ignore_imports` vazio.
    """
    monkeypatch.chdir(BACKEND)
    sonda = (
        "\n[[tool.importlinter.contracts]]\n"
        'id = "sonda-routers-sem-services"\n'
        'name = "sonda: routers nao importam services"\n'
        'type = "forbidden"\n'
        'source_modules = ["app.routers"]\n'
        'forbidden_modules = ["app.services"]\n'
    )
    com_sonda = tmp_path / "pyproject.toml"
    com_sonda.write_text(PYPROJECT.read_text(encoding="utf-8") + sonda, encoding="utf-8")

    assert _rodar(com_sonda) != 0
