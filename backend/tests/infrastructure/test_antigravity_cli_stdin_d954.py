"""D-954: o timeout do `agy` vale também para a escrita do prompt no stdin.

Processo REAL que nunca lê a entrada: com um prompt maior que o buffer do pipe,
a escrita bloqueia até alguém ler — e ninguém lê. Prompts reais têm 80-200k
chars; aqui ~1 MB garante o bloqueio em qualquer sistema.
"""

from __future__ import annotations

import sys
import threading
import time

import pytest
from app.infrastructure import antigravity_cli_client as agy
from app.infrastructure.antigravity_cli_client import AntigravityCliError

_NUNCA_LE_O_STDIN = "import time\ntime.sleep(60)\n"
_PROMPT_DE_1_MB = "x" * 1_000_000
# Folga para subir o Python filho e matar a árvore; o defeito prendia por 60 s.
_TETO_DA_CHAMADA_S = 15


def test_timeout_vale_mesmo_com_o_agy_sem_ler_o_stdin(monkeypatch):
    monkeypatch.setattr(agy, "_montar_argv", lambda *_a: [sys.executable, "-c", _NUNCA_LE_O_STDIN])
    monkeypatch.setattr(agy, "_FOLGA_PROCESSO_SEG", 0.0)
    erros: list[BaseException] = []

    def _chamar() -> None:
        try:
            agy._run_sync(_PROMPT_DE_1_MB, model="m", timeout=1)
        except BaseException as exc:  # noqa: BLE001 — o teste confere o tipo abaixo
            erros.append(exc)

    # Thread com join limitado: sem a correção a chamada não volta, e o teste
    # precisa reprovar em vez de travar a suíte.
    chamada = threading.Thread(target=_chamar, daemon=True)
    inicio = time.perf_counter()
    chamada.start()
    chamada.join(_TETO_DA_CHAMADA_S)
    gasto = time.perf_counter() - inicio

    assert not chamada.is_alive(), f"a chamada continuou presa após {gasto:.0f}s"
    assert len(erros) == 1
    with pytest.raises(AntigravityCliError, match="timeout"):
        raise erros[0]
