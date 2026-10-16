"""Testes para `app.infrastructure.antigravity_cli_client` (`agy -p`).

O subprocess é substituído por um processo falso — nenhum `agy` real é chamado.
"""

from __future__ import annotations

import asyncio
import io
import json
import sys
import time

import pytest
from app.infrastructure import antigravity_cli_client as agy
from app.infrastructure.antigravity_cli_client import AntigravityCliError


@pytest.fixture(autouse=True)
def _ambiente_isolado(monkeypatch):
    monkeypatch.setattr(agy.settings, "agy_cli_path", "agy")
    monkeypatch.setattr(agy.settings, "agy_cli_retries", 0)
    # Telemetria grava num banco real; aqui só importa a geração.
    monkeypatch.setattr(agy.claude_cli_client, "_registrar_telemetria", lambda **_k: None)


class _StdinFalso(io.BytesIO):
    def close(self) -> None:  # guarda o que foi escrito para o teste ler
        pass


class _FakePopen:
    """Processo que já saiu: os pipes entregam tudo e fecham."""

    def __init__(self, *, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
        self.stdout = io.BytesIO(stdout)
        self.stderr = io.BytesIO(stderr)
        self.stdin = _StdinFalso()
        self.returncode = returncode
        self.pid = 4321
        self.args: list[str] = []
        self.argv: list[str] = []
        self.env: dict[str, str] = {}

    def poll(self) -> int:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        return self.returncode

    @property
    def mensagem(self) -> bytes:
        return self.stdin.getvalue()


def _patch_popen(monkeypatch, fake: _FakePopen) -> None:
    def _criar(argv, **kwargs):
        fake.argv = argv
        fake.env = kwargs.get("env") or {}
        return fake

    monkeypatch.setattr(agy.subprocess, "Popen", _criar)


def _ndjson(resultado: dict) -> bytes:
    eventos = [
        {"event": "init", "conversation_id": "c1", "init": {"model": "gemini-x"}},
        {"event": "result", "result": resultado},
    ]
    return "\n".join(json.dumps(e) for e in eventos).encode("utf-8")


def _sucesso(response: str) -> dict:
    return {
        "status": "SUCCESS",
        "response": response,
        "duration_seconds": 7.5,
        "usage": {"input_tokens": 125705, "output_tokens": 27},
    }


class TestGeracao:
    def test_json_embrulhado_em_fences_e_extraido(self, monkeypatch):
        fake = _FakePopen(stdout=_ndjson(_sucesso('```json\n{"cortes": [1, 2]}\n```\n')))
        _patch_popen(monkeypatch, fake)

        data = asyncio.run(agy.generate_json("gere", model="gemini-3.1-pro-high"))

        assert data == {"cortes": [1, 2]}

    def test_prompt_e_expertise_vao_pelo_stdin_nunca_pelo_argv(self, monkeypatch):
        fake = _FakePopen(stdout=_ndjson(_sucesso("ok")))
        _patch_popen(monkeypatch, fake)

        asyncio.run(agy.generate_text("PROMPT-GRANDE", model="m", expertise="SKILL"))

        mensagem = json.loads(fake.mensagem.decode("utf-8"))
        assert mensagem == {"event": "user", "message": {"content": "SKILL\n\nPROMPT-GRANDE"}}
        assert not any("PROMPT-GRANDE" in parte for parte in fake.argv)

    def test_argv_escolhe_o_modelo_e_nunca_libera_ferramentas(self, monkeypatch):
        fake = _FakePopen(stdout=_ndjson(_sucesso("ok")))
        _patch_popen(monkeypatch, fake)

        asyncio.run(agy.generate_text("p", model="gemini-3.8-flash-medium"))

        assert fake.argv[fake.argv.index("--model") + 1] == "gemini-3.8-flash-medium"
        assert "--dangerously-skip-permissions" not in fake.argv

    def test_chave_da_api_nao_vaza_para_o_cli(self, monkeypatch):
        """Com a chave no ambiente o agy usaria a API paga em vez da assinatura."""
        monkeypatch.setenv("GEMINI_API_KEY", "segredo")
        monkeypatch.setenv("GOOGLE_API_KEY", "segredo")
        fake = _FakePopen(stdout=_ndjson(_sucesso("ok")))
        _patch_popen(monkeypatch, fake)

        asyncio.run(agy.generate_text("p", model="m"))

        assert "GEMINI_API_KEY" not in fake.env
        assert "GOOGLE_API_KEY" not in fake.env


class TestErros:
    def test_status_de_erro_vira_excecao_com_o_motivo(self, monkeypatch):
        resultado = {"status": "ERROR", "response": "", "error": "quota exceeded"}
        _patch_popen(monkeypatch, _FakePopen(stdout=_ndjson(resultado), returncode=1))

        with pytest.raises(AntigravityCliError, match="quota exceeded"):
            asyncio.run(agy.generate_text("p", model="m"))

    def test_sem_login_explica_como_logar(self, monkeypatch):
        fake = _FakePopen(stderr=b"Error: authentication required", returncode=1)
        _patch_popen(monkeypatch, fake)

        with pytest.raises(AntigravityCliError, match="rode `agy`"):
            asyncio.run(agy.generate_text("p", model="m"))

    def test_saida_sem_evento_result_e_erro_transitorio(self, monkeypatch):
        _patch_popen(monkeypatch, _FakePopen(stdout=b"lixo", returncode=2))

        with pytest.raises(AntigravityCliError) as exc_info:
            asyncio.run(agy.generate_text("p", model="m"))

        assert exc_info.value.transient is True


class TestProcessoQueNaoSai:
    """D-953: o agy 1.3.x responde e continua vivo por minutos, em polling.

    Processo REAL (não o fake): o defeito mora em esperar o pipe fechar, e só um
    processo de verdade segura o pipe aberto depois de responder.
    """

    _RESPONDE_E_FICA = (
        "import json, sys, time\n"
        "sys.stdin.readline()\n"
        "print(json.dumps({'event': 'result', 'result': {'status': 'SUCCESS', "
        "'response': 'capa pronta'}}), flush=True)\n"
        "time.sleep(60)\n"
    )
    _NUNCA_RESPONDE = "import sys, time\nsys.stdin.readline()\ntime.sleep(60)\n"

    def _rodar(self, monkeypatch, script: str, timeout: float) -> tuple[dict, float]:
        monkeypatch.setattr(agy, "_montar_argv", lambda *_a: [sys.executable, "-c", script])
        monkeypatch.setattr(agy, "_FOLGA_PROCESSO_SEG", 0.0)
        inicio = time.perf_counter()
        resultado = agy._run_sync("p", model="m", timeout=timeout)
        return resultado, time.perf_counter() - inicio

    def test_devolve_a_resposta_sem_esperar_o_processo_sair(self, monkeypatch):
        resultado, gasto = self._rodar(monkeypatch, self._RESPONDE_E_FICA, timeout=5)

        assert resultado["response"] == "capa pronta"
        assert gasto < 5

    def test_sem_resposta_ainda_estoura_o_timeout(self, monkeypatch):
        with pytest.raises(AntigravityCliError, match="timeout"):
            self._rodar(monkeypatch, self._NUNCA_RESPONDE, timeout=1)


def test_listar_modelos_le_id_e_nome(monkeypatch):
    saida = b"gemini-3.8-flash-high     Gemini 3.8 Flash (High)\ngemini-3.1-pro-low        Gemini 3.1 Pro (Low)\n"

    class _Proc:
        returncode = 0
        stdout = saida

    monkeypatch.setattr(agy.subprocess, "run", lambda *_a, **_k: _Proc())

    assert agy.listar_modelos() == [
        ("gemini-3.8-flash-high", "Gemini 3.8 Flash (High)"),
        ("gemini-3.1-pro-low", "Gemini 3.1 Pro (Low)"),
    ]


def test_listar_modelos_sem_cli_devolve_vazio(monkeypatch):
    def _falha(*_a, **_k):
        raise OSError("agy não instalado")

    monkeypatch.setattr(agy.subprocess, "run", _falha)

    assert agy.listar_modelos() == []
