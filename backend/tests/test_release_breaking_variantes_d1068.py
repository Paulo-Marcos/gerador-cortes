"""As variantes da marca de quebra no bin/release.py (D-1068).

Depois da D-1067, só `**BREAKING**` e `BREAKING:` contavam: `**BREAKING:**`
(dois-pontos dentro do negrito) e `BREAKING CHANGE:` passavam como patch na
1.x. A marca vale no começo da linha, com ou sem o `- ` da lista; a palavra no
meio da frase continua não contando, nem uma palavra que só começa com ela.
"""

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[2] / "bin" / "release.py"
_spec = importlib.util.spec_from_file_location("release", _SCRIPT)
release = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(release)

VARIANTES = ["**BREAKING**", "BREAKING:", "**BREAKING:**", "BREAKING CHANGE:"]


@pytest.mark.parametrize("lista", ["- ", ""], ids=["com-lista", "sem-lista"])
@pytest.mark.parametrize("marca", VARIANTES)
def test_cada_variante_no_comeco_da_linha_conta_como_quebra(marca, lista):
    secoes = {"Fixed": f"{lista}{marca} a rota antiga sai (D-1)."}
    assert release.nivel_sugerido(secoes, "1.2.0") == "major"


@pytest.mark.parametrize("marca", VARIANTES)
def test_a_variante_no_meio_da_frase_nao_conta(marca):
    secoes = {"Fixed": f"- A entrada cita {marca} no meio da frase (D-1)."}
    assert release.nivel_sugerido(secoes, "1.2.0") == "patch"


@pytest.mark.parametrize("texto", ["- BREAKINGS não é a marca.", "- **BREAKINGS** também não."])
def test_palavra_que_so_comeca_com_breaking_nao_conta(texto):
    assert release.nivel_sugerido({"Fixed": texto}, "1.2.0") == "patch"
