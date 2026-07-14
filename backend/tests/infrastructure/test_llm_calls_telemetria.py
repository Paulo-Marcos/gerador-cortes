"""Telemetria não-fatal das chamadas de IA no client Claude (D-353).

Cobre:
  - Sucesso registra os campos certos (etapa/model/prompt/resposta/custo/duração/
    latência/tokens best-effort/sucesso) a partir do envelope + contexto.
  - Erro (`ClaudeCliError`) registra sucesso=False + erro_tipo e RE-LEVANTA.
  - NÃO-FATAL: se a gravação da telemetria explodir, a geração ainda retorna.
  - Plumbing editorial: `_args_claude` injeta o contexto (etapa/projeto/corte).

O `_run` real é substituído por um fake (nenhum subprocess/claude é invocado), e o
store é substituído por um capturador — nenhum banco é tocado.
"""

from __future__ import annotations

import asyncio

import pytest
from app.infrastructure import claude_cli_client as cli
from app.infrastructure.claude_cli_client import ClaudeCliError, LlmCallContext


def _fake_run_ok(envelope: dict):
    async def _run(prompt, **_kw):
        return envelope

    return _run


def _capturar_store(monkeypatch) -> list[dict]:
    """Substitui `llm_calls_store.gravar_llm_call` por um capturador de kwargs."""
    from app.services import llm_calls_store

    capturados: list[dict] = []

    def fake_gravar(**kwargs):
        capturados.append(kwargs)
        return "fake-id"

    monkeypatch.setattr(llm_calls_store, "gravar_llm_call", fake_gravar)
    return capturados


class TestSucessoRegistra:
    def test_grava_campos_do_envelope_e_do_contexto(self, monkeypatch):
        envelope = {
            "result": "resposta do modelo",
            "total_cost_usd": 0.02,
            "duration_ms": 3210,
            "usage": {"input_tokens": 900, "output_tokens": 120},
        }
        monkeypatch.setattr(cli, "_run", _fake_run_ok(envelope))
        capturados = _capturar_store(monkeypatch)

        texto = asyncio.run(
            cli.generate_text(
                "PROMPT",
                model="sonnet",
                skill="cortador-expert",
                contexto=LlmCallContext(
                    etapa="cortador-expert", projeto_id="proj-9", corte_id="corte-3"
                ),
            )
        )

        assert texto == "resposta do modelo"
        assert len(capturados) == 1
        c = capturados[0]
        assert c["etapa"] == "cortador-expert"
        assert c["projeto_id"] == "proj-9"
        assert c["corte_id"] == "corte-3"
        assert c["model"] == "sonnet"
        assert c["resposta"] == "resposta do modelo"
        assert c["custo_usd"] == 0.02
        assert c["duracao_ms_servidor"] == 3210
        assert c["tokens_in"] == 900
        assert c["tokens_out"] == 120
        assert c["latencia_ms_wall"] is not None
        assert c["sucesso"] is True
        assert c["erro_tipo"] is None

    def test_etapa_cai_na_skill_quando_sem_contexto(self, monkeypatch):
        monkeypatch.setattr(cli, "_run", _fake_run_ok({"result": "ok"}))
        capturados = _capturar_store(monkeypatch)

        asyncio.run(cli.generate_text("P", skill="metadados-expert"))

        assert capturados[0]["etapa"] == "metadados-expert"
        assert capturados[0]["tokens_in"] is None  # sem usage no envelope

    def test_generate_json_tambem_registra(self, monkeypatch):
        monkeypatch.setattr(cli, "_run", _fake_run_ok({"result": '{"ok": true}'}))
        capturados = _capturar_store(monkeypatch)

        data = asyncio.run(
            cli.generate_json("P", contexto=LlmCallContext(etapa="padroes-thumbnail"))
        )

        assert data == {"ok": True}
        assert capturados[0]["etapa"] == "padroes-thumbnail"


class TestErroRegistra:
    def test_erro_grava_sucesso_falso_e_relevanta(self, monkeypatch):
        async def _run_erro(prompt, **_kw):
            raise ClaudeCliError("boom", transient=False)

        monkeypatch.setattr(cli, "_run", _run_erro)
        capturados = _capturar_store(monkeypatch)

        with pytest.raises(ClaudeCliError):
            asyncio.run(cli.generate_text("P", contexto=LlmCallContext(etapa="cenas-expert")))

        assert len(capturados) == 1
        assert capturados[0]["sucesso"] is False
        assert capturados[0]["erro_tipo"] == "ClaudeCliError"
        assert capturados[0]["etapa"] == "cenas-expert"


class TestNaoFatal:
    def test_falha_na_telemetria_nao_quebra_a_geracao(self, monkeypatch):
        monkeypatch.setattr(cli, "_run", _fake_run_ok({"result": "resultado bom"}))
        from app.services import llm_calls_store

        def gravar_explode(**_kwargs):
            raise RuntimeError("banco travado")

        monkeypatch.setattr(llm_calls_store, "gravar_llm_call", gravar_explode)

        # A gravação explode, mas a geração deve retornar normalmente.
        texto = asyncio.run(cli.generate_text("P", skill="cortador-expert"))
        assert texto == "resultado bom"

    def test_falha_na_telemetria_no_erro_preserva_o_erro_original(self, monkeypatch):
        async def _run_erro(prompt, **_kw):
            raise ClaudeCliError("erro real", transient=False)

        monkeypatch.setattr(cli, "_run", _run_erro)
        from app.services import llm_calls_store

        def gravar_explode(**_kwargs):
            raise RuntimeError("banco travado")

        monkeypatch.setattr(llm_calls_store, "gravar_llm_call", gravar_explode)

        # A telemetria falha, mas o ClaudeCliError original deve chegar ao caller.
        with pytest.raises(ClaudeCliError, match="erro real"):
            asyncio.run(cli.generate_text("P"))


class TestPlumbingEditorial:
    def test_args_claude_injeta_contexto(self):
        from app.services import claude_ia

        skill = claude_ia.editorial_skills.SkillResolvida(
            key="trechos-expert",
            corpo="corpo",
            modelo="sonnet",
            thinking_tokens=0,
            timeout=120.0,
            lentes=[],
        )
        args = claude_ia._args_claude(
            skill, "trechos-expert", projeto_id="proj-x", corte_id="corte-y"
        )
        ctx = args["contexto"]
        assert isinstance(ctx, LlmCallContext)
        assert ctx.etapa == "trechos-expert"
        assert ctx.projeto_id == "proj-x"
        assert ctx.corte_id == "corte-y"
