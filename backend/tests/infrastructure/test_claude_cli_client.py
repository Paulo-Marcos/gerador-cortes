"""Testes para `app.infrastructure.claude_cli_client`.

Áreas cobertas:
  - `generate_json`: extrai o JSON do campo `result` mesmo com markdown fences.
  - `generate_text`: devolve o `result` bruto.
  - Propagação de erro: `is_error` no envelope e returncode != 0.
  - Provider desabilitado.
  - `_extract_json`: fences, objeto cru e texto com lixo ao redor.

O subprocess real (`asyncio.create_subprocess_exec`) é substituído por um
processo falso — nenhum `claude` é invocado nos testes.
"""

from __future__ import annotations

import asyncio
import json

import pytest
from app.infrastructure import claude_cli_client as cli
from app.infrastructure.claude_cli_client import ClaudeCliError


class _FakePopen:
    """Imita subprocess.Popen: communicate() devolve (stdout, stderr) bytes."""

    def __init__(self, *, stdout: bytes = b"", stderr: bytes = b"", returncode: int = 0):
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode
        self.pid = 4321

    def communicate(self, input: bytes | None = None, timeout: float | None = None):  # noqa: A002
        return self._stdout, self._stderr

    def kill(self):
        pass


def _patch_popen(monkeypatch, fake: _FakePopen) -> None:
    monkeypatch.setattr(cli.subprocess, "Popen", lambda *_a, **_k: fake)
    monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)  # stub taskkill


def _envelope(result: str, *, is_error: bool = False) -> bytes:
    return json.dumps(
        {
            "type": "result",
            "is_error": is_error,
            "result": result,
            "duration_ms": 1234,
            "total_cost_usd": 0.01,
        }
    ).encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# generate_json / generate_text — caminho feliz
# ─────────────────────────────────────────────────────────────────────────────


class TestGerarJson:
    def test_extrai_json_de_result_com_fences(self, monkeypatch):
        # stderr com ruído de hook benigno + result embrulhado em fences.
        proc = _FakePopen(
            stdout=_envelope('```json\n{"cortes": [{"titulo_proposto": "X"}]}\n```'),
            stderr=b"SessionEnd hook failed: Hook cancelled",
            returncode=0,
        )
        _patch_popen(monkeypatch, proc)

        data = asyncio.run(cli.generate_json("gere os cortes", model="haiku"))

        assert data == {"cortes": [{"titulo_proposto": "X"}]}

    def test_result_json_puro_sem_fences(self, monkeypatch):
        proc = _FakePopen(stdout=_envelope('{"ok": true, "n": 42}'))
        _patch_popen(monkeypatch, proc)

        data = asyncio.run(cli.generate_json("gere"))

        assert data == {"ok": True, "n": 42}


class TestGerarTexto:
    def test_retorna_result_bruto(self, monkeypatch):
        proc = _FakePopen(stdout=_envelope("texto livre de saída"))
        _patch_popen(monkeypatch, proc)

        texto = asyncio.run(cli.generate_text("oi"))

        assert texto == "texto livre de saída"


class TestThinkingTokens:
    """O extended thinking é ligado por chamada (MAX_THINKING_TOKENS no env)."""

    def _capturar_env(self, monkeypatch, **gen_kwargs) -> dict:
        capturado: dict = {}

        def fake_popen(*_a, **kw):
            capturado["env"] = kw.get("env", {})
            return _FakePopen(stdout=_envelope("ok"))

        monkeypatch.setattr(cli.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)
        asyncio.run(cli.generate_text("oi", **gen_kwargs))
        return capturado["env"]

    def test_default_herda_o_global(self, monkeypatch):
        monkeypatch.setattr(cli.settings, "claude_cli_max_thinking_tokens", 0)
        env = self._capturar_env(monkeypatch)
        assert env["MAX_THINKING_TOKENS"] == "0"

    def test_override_por_chamada(self, monkeypatch):
        env = self._capturar_env(monkeypatch, thinking_tokens=10000)
        assert env["MAX_THINKING_TOKENS"] == "10000"


class TestEnvIsolamentoApi:
    """INVARIANTE: esta aplicação NÃO usa a API — o `claude -p` roda SEMPRE na
    assinatura local. O subprocess nunca pode herdar variáveis que forcem o modo
    API/provedor externo (cobrança por crédito).

    Regressão D-071: a chave `ANTHROPIC_API_KEY` dedicada do ai-memory estava no
    ambiente de USUÁRIO do Windows e vazava para o `claude -p`, que passava a
    cobrar de uma conta de API — sintomas "Credit balance is too low" e, com a
    conta sem créditos/login, 401. O scrub em `_subprocess_env` impede o vazamento
    independentemente do que esteja no ambiente.
    """

    def _capturar_env(self, monkeypatch) -> dict:
        capturado: dict = {}

        def fake_popen(*_a, **kw):
            capturado["env"] = kw.get("env", {})
            return _FakePopen(stdout=_envelope("ok"))

        monkeypatch.setattr(cli.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)
        asyncio.run(cli.generate_text("oi"))
        return capturado["env"]

    @pytest.mark.parametrize("var", cli._ENV_FORCA_API)
    def test_cada_var_que_forca_api_e_removida(self, monkeypatch, var):
        monkeypatch.setenv(var, "valor-que-forcaria-modo-api")

        env = self._capturar_env(monkeypatch)

        assert var not in env, f"{var} vazou para o subprocess do claude -p"

    def test_cenario_real_do_bug_nenhuma_var_de_api_no_subprocess(self, monkeypatch):
        # Reproduz o ambiente do backend no momento do bug: chave dedicada do
        # ai-memory + base url presentes. Nenhuma delas pode chegar ao claude -p.
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-" + "x" * 90)
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")

        env = self._capturar_env(monkeypatch)

        vazadas = [v for v in cli._ENV_FORCA_API if v in env]
        assert vazadas == [], f"vars que forçam API vazaram: {vazadas}"

    def test_lista_de_scrub_cobre_as_vars_criticas(self):
        # Trava de contrato: impede alguém de encolher a lista e reabrir o
        # vazamento sem um teste vermelho avisando.
        for critica in ("ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"):
            assert critica in cli._ENV_FORCA_API

    def test_token_de_assinatura_nao_e_removido(self, monkeypatch):
        # CLAUDE_CODE_OAUTH_TOKEN é a credencial da ASSINATURA (uso headless) —
        # NÃO pode ser removido, senão quebra o caminho de auth correto.
        monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "token-da-assinatura")

        env = self._capturar_env(monkeypatch)

        assert env.get("CLAUDE_CODE_OAUTH_TOKEN") == "token-da-assinatura"

    def test_preserva_o_resto_do_ambiente(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        monkeypatch.setenv("UMA_VAR_QUALQUER", "valor-123")

        env = self._capturar_env(monkeypatch)

        assert env.get("UMA_VAR_QUALQUER") == "valor-123"  # só as de API saem
        assert "MAX_THINKING_TOKENS" in env


# ─────────────────────────────────────────────────────────────────────────────
# Propagação de erro
# ─────────────────────────────────────────────────────────────────────────────


class TestErros:
    def test_is_error_no_envelope_levanta(self, monkeypatch):
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)  # sem retry no teste
        proc = _FakePopen(stdout=_envelope("limite atingido", is_error=True))
        _patch_popen(monkeypatch, proc)

        with pytest.raises(ClaudeCliError):
            asyncio.run(cli.generate_text("oi"))

    def test_returncode_nao_zero_levanta(self, monkeypatch):
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)
        proc = _FakePopen(stdout=b"", stderr=b"boom", returncode=1)
        _patch_popen(monkeypatch, proc)

        with pytest.raises(ClaudeCliError, match="código 1"):
            asyncio.run(cli.generate_text("oi"))

    def test_exit_nao_zero_com_envelope_de_sucesso_retorna(self, monkeypatch):
        # Cenário do bug: a geração concluiu (envelope is_error=False no stdout),
        # mas um hook SessionEnd estourou o timeout DEPOIS → "Hook cancelled" →
        # exit 1. O resultado é válido; não deve ser descartado.
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)
        proc = _FakePopen(
            stdout=_envelope("resultado bom"),
            stderr=b'SessionEnd hook [node "session-lifecycle-hook.mjs" SessionEnd] '
            b"failed: Hook cancelled",
            returncode=1,
        )
        _patch_popen(monkeypatch, proc)

        texto = asyncio.run(cli.generate_text("oi"))

        assert texto == "resultado bom"

    def test_is_error_vence_o_exit_code(self, monkeypatch):
        # exit != 0 + envelope is_error (ex.: 401): reporta o erro do modelo, não
        # o genérico "código 1" — mensagem mais útil para diagnóstico.
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)
        proc = _FakePopen(stdout=_envelope("limite atingido", is_error=True), returncode=1)
        _patch_popen(monkeypatch, proc)

        with pytest.raises(ClaudeCliError, match="subtype"):
            asyncio.run(cli.generate_text("oi"))

    def test_stdout_nao_json_levanta(self, monkeypatch):
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)
        proc = _FakePopen(stdout=b"isto nao e json", returncode=0)
        _patch_popen(monkeypatch, proc)

        with pytest.raises(ClaudeCliError):
            asyncio.run(cli.generate_text("oi"))

    def test_retry_em_erro_transitorio_depois_sucesso(self, monkeypatch):
        # 1ª chamada erra (is_error), 2ª retorna sucesso → generate_text deve
        # retornar o resultado da 2ª (retry transparente). sleep é no-op no teste.
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 2)
        chamadas = {"n": 0}

        def fake_popen(*_args, **_kwargs):
            chamadas["n"] += 1
            if chamadas["n"] == 1:
                return _FakePopen(stdout=_envelope("overload", is_error=True))
            return _FakePopen(stdout=_envelope("ok depois do retry"))

        async def fake_sleep(_s):
            return None

        monkeypatch.setattr(cli.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)
        monkeypatch.setattr(cli.asyncio, "sleep", fake_sleep)

        texto = asyncio.run(cli.generate_text("oi"))

        assert chamadas["n"] == 2
        assert texto == "ok depois do retry"

    def test_timeout_mata_arvore_e_levanta(self, monkeypatch):
        # 1ª communicate estoura timeout → _matar_arvore + reap → levanta sem travar.
        import subprocess as sp

        matou = {"taskkill": False}

        class _Hang:
            def __init__(self):
                self._n = 0
                self.pid = 999
                self.returncode = None

            def communicate(self, input=None, timeout=None):  # noqa: A002
                self._n += 1
                if self._n == 1:
                    raise sp.TimeoutExpired(cmd="claude", timeout=timeout)
                return b"", b""  # reap após o kill da árvore

            def kill(self):
                pass

        def fake_run(args, *_a, **_k):
            if args and args[0] == "taskkill":
                matou["taskkill"] = True

        monkeypatch.setattr(cli.subprocess, "Popen", lambda *_a, **_k: _Hang())
        monkeypatch.setattr(cli.subprocess, "run", fake_run)
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 0)

        with pytest.raises(ClaudeCliError, match="timeout"):
            asyncio.run(cli.generate_text("oi", timeout=0.01))

        assert matou["taskkill"], "deve matar a árvore de processos no timeout (Windows)"

    def test_provider_desabilitado_levanta(self, monkeypatch):
        monkeypatch.setattr(cli.settings, "claude_cli_enabled", False)

        with pytest.raises(ClaudeCliError, match="desabilitado"):
            asyncio.run(cli.generate_text("oi"))


# ─────────────────────────────────────────────────────────────────────────────
# D-144: override editorial de instance/editorial/ (fonte editorial única)
# ─────────────────────────────────────────────────────────────────────────────


class TestEditorialOverride:
    """Quando `instance/editorial/<arquivo>.md` existe, o corpo de lá é injetado
    no prompt e a skill nativa NÃO é ativada; senão, mantém-se a ativação
    `/<skill>` de hoje (fallback não-destrutivo)."""

    def _capturar_run(self, monkeypatch) -> dict:
        capturado: dict = {}

        async def fake_run(prompt, *, skill_mode=False, **_kw):
            capturado["entrada"] = prompt
            capturado["skill_mode"] = skill_mode
            return {"result": "ok"}

        monkeypatch.setattr(cli, "_run", fake_run)
        return capturado

    def test_override_injeta_corpo_e_nao_ativa_skill_nativa(self, monkeypatch, tmp_path):
        editorial = tmp_path / "instance" / "editorial"
        editorial.mkdir(parents=True)
        (editorial / "metadados.md").write_text("EXPERTISE DA INSTANCIA", encoding="utf-8")
        monkeypatch.setattr(cli, "_dir_editorial", lambda: editorial)

        capturado = self._capturar_run(monkeypatch)
        texto = asyncio.run(cli.generate_text("PROMPT DO CORTE", skill="metadados-expert"))

        assert texto == "ok"
        assert "EXPERTISE DA INSTANCIA" in capturado["entrada"]
        assert "PROMPT DO CORTE" in capturado["entrada"]
        assert "/metadados-expert" not in capturado["entrada"]  # skill nativa não ativada
        assert capturado["skill_mode"] is False

    def test_sem_override_mantem_ativacao_nativa(self, monkeypatch, tmp_path):
        editorial = tmp_path / "instance" / "editorial"  # vazio: sem override
        editorial.mkdir(parents=True)
        monkeypatch.setattr(cli, "_dir_editorial", lambda: editorial)

        capturado = self._capturar_run(monkeypatch)
        asyncio.run(cli.generate_text("PROMPT", skill="metadados-expert"))

        assert capturado["entrada"].startswith("/metadados-expert")
        assert capturado["skill_mode"] is True

    def test_skill_nao_editorial_nunca_tem_override(self, monkeypatch, tmp_path):
        # Uma skill fora do mapa editorial jamais resolve override, mesmo com
        # arquivo homônimo presente — evita ativar injeção por engano.
        editorial = tmp_path / "instance" / "editorial"
        editorial.mkdir(parents=True)
        monkeypatch.setattr(cli, "_dir_editorial", lambda: editorial)

        assert cli._carregar_editorial_override("alguma-skill-qualquer") is None
        assert cli._carregar_editorial_override(None) is None


# ─────────────────────────────────────────────────────────────────────────────
# _extract_json (puro)
# ─────────────────────────────────────────────────────────────────────────────


class TestExtractJson:
    def test_fences_json(self):
        assert cli._extract_json('```json\n{"a": 1}\n```') == {"a": 1}

    def test_objeto_cru(self):
        assert cli._extract_json('{"a": 1}') == {"a": 1}

    def test_texto_com_lixo_ao_redor(self):
        assert cli._extract_json('blá blá {"a": 1} fim') == {"a": 1}

    def test_array_no_topo_levanta(self):
        # D-204: a IA às vezes devolve um array válido no topo. Antes ele passava
        # adiante e o chamador quebrava com KeyError; agora falha na fronteira.
        with pytest.raises(ValueError, match="não é um objeto"):
            cli._extract_json("[1, 2, 3]")

    def test_array_dentro_de_fences_levanta(self):
        with pytest.raises(ValueError, match="não é um objeto"):
            cli._extract_json('```json\n[{"titulo": "X"}]\n```')


# ─────────────────────────────────────────────────────────────────────────────
# Backoff / resiliência a 529 Overloaded (D-072)
# ─────────────────────────────────────────────────────────────────────────────


class TestBackoffExponencial:
    """Backoff entre tentativas: exponencial (2,4,8,16…), com teto e jitter."""

    def test_cresce_exponencialmente_com_teto(self, monkeypatch):
        monkeypatch.setattr(cli.random, "uniform", lambda _a, _b: 0.0)  # neutraliza jitter
        assert cli._backoff(0) == 2.0
        assert cli._backoff(1) == 4.0
        assert cli._backoff(2) == 8.0
        assert cli._backoff(3) == 16.0
        assert cli._backoff(4) == 30.0  # 32 → teto de 30
        assert cli._backoff(10) == 30.0  # nunca passa do teto

    def test_jitter_dentro_da_faixa(self, monkeypatch):
        # jitter ∈ [0, base]; com jitter máximo a espera = pico + base.
        monkeypatch.setattr(cli.random, "uniform", lambda _a, b: b)
        assert cli._backoff(0) == 2.0 + 2.0


class TestRetry529:
    def test_529_nas_primeiras_tentativas_depois_sucesso(self, monkeypatch):
        # 529 Overloaded é transitório: as 2 primeiras falham, a 3ª passa →
        # a geração NÃO deve estourar 500; retorna o resultado da 3ª.
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 4)
        chamadas = {"n": 0}

        def fake_popen(*_a, **_k):
            chamadas["n"] += 1
            if chamadas["n"] <= 2:
                return _FakePopen(stdout=_envelope("API Error: 529 Overloaded.", is_error=True))
            return _FakePopen(stdout=_envelope("cenas geradas"))

        async def fake_sleep(_s):
            return None

        monkeypatch.setattr(cli.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)
        monkeypatch.setattr(cli.asyncio, "sleep", fake_sleep)

        texto = asyncio.run(cli.generate_text("gere as cenas"))

        assert chamadas["n"] == 3
        assert texto == "cenas geradas"

    def test_529_persistente_esgota_tentativas_e_levanta(self, monkeypatch):
        # Se o pico de sobrecarga dura todas as tentativas, falha (transparente).
        monkeypatch.setattr(cli.settings, "claude_cli_retries", 2)  # 3 tentativas
        chamadas = {"n": 0}

        def fake_popen(*_a, **_k):
            chamadas["n"] += 1
            return _FakePopen(stdout=_envelope("API Error: 529 Overloaded.", is_error=True))

        async def fake_sleep(_s):
            return None

        monkeypatch.setattr(cli.subprocess, "Popen", fake_popen)
        monkeypatch.setattr(cli.subprocess, "run", lambda *_a, **_k: None)
        monkeypatch.setattr(cli.asyncio, "sleep", fake_sleep)

        with pytest.raises(ClaudeCliError, match="529"):
            asyncio.run(cli.generate_text("oi"))
        assert chamadas["n"] == 3  # tentou todas antes de desistir
