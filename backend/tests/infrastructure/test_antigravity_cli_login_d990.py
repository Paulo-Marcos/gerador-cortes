"""D-990: o agy 1.4.x avisa a falta de login com outra frase.

Até a 1.2.3 o CLI dizia `authentication required`; a 1.4.9 diz `You are not
logged into Antigravity.` (medido no log do CLI em 28/10/2026). Sem reconhecer a
frase nova, o erro virava "transitório": o app gastava o retry e mostrava ao
operador um status genérico, em vez de dizer como logar.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from app.infrastructure import antigravity_cli_client as agy
from app.infrastructure.antigravity_cli_client import AntigravityCliError

_SEM_LOGIN = "error getting token source: You are not logged into Antigravity."


@pytest.fixture(autouse=True)
def _ambiente_isolado(monkeypatch):
    monkeypatch.setattr(agy.settings, "agy_cli_path", "agy")
    monkeypatch.setattr(agy.settings, "agy_cli_retries", 0)
    monkeypatch.setattr(agy, "_cwd", lambda: ".")
    monkeypatch.setattr(agy.claude_cli_client, "_registrar_telemetria", lambda **_k: None)


class _FakePopen:
    def __init__(self, *, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 1):
        self.stdin = _Entrada()
        self.stdout = iter(stdout.splitlines(keepends=True))
        self.stderr = _Saida(stderr)
        self.returncode = returncode
        self.args: list[str] = []

    def poll(self):
        return self.returncode

    def wait(self, timeout=None):
        return self.returncode


class _Entrada:
    def write(self, _dados: bytes) -> None:
        pass

    def close(self) -> None:
        pass


class _Saida:
    def __init__(self, dados: bytes):
        self._dados = dados

    def read(self) -> bytes:
        return self._dados


def _rodar_com(monkeypatch, fake: _FakePopen) -> AntigravityCliError:
    monkeypatch.setattr(agy.subprocess, "Popen", lambda *_a, **_k: fake)
    with pytest.raises(AntigravityCliError) as exc_info:
        asyncio.run(agy.generate_text("p", model="m"))
    return exc_info.value


def test_frase_nova_no_result_explica_o_login_e_nao_repete(monkeypatch):
    resultado = {"status": "ERROR", "response": "", "error": _SEM_LOGIN}
    stdout = json.dumps({"event": "result", "result": resultado}).encode() + b"\n"

    erro = _rodar_com(monkeypatch, _FakePopen(stdout=stdout))

    assert erro.transient is False
    assert "agy" in str(erro) and "código" in str(erro)


def test_frase_nova_no_stderr_explica_o_login(monkeypatch):
    erro = _rodar_com(monkeypatch, _FakePopen(stderr=_SEM_LOGIN.encode()))

    assert erro.transient is False
    assert "código" in str(erro)


def test_mensagem_manda_colar_o_codigo_no_terminal_e_nao_no_app():
    """O código do login é do `agy`: o CutCut nunca recebe nem guarda o token."""
    assert "terminal" in agy._MSG_LOGIN
    assert "CutCut" in agy._MSG_LOGIN
