"""D-1026: a geração automática não herda o CLAUDE.md do dono e explica a recusa.

Medido com o Claude CLI 2.1.280 (cwd no temp): sem a env abaixo o `claude -p`
cita o `~/.claude/CLAUDE.md` global ("modo professor") e pode devolver conversa
no lugar do JSON; `--setting-sources` não impede, `--bare` exigiria chave de API.
"""

import asyncio
import json

import pytest
from app.infrastructure import claude_cli_client as cli


class TestNaoCarregaClaudeMdDoDono:
    def test_env_do_subprocesso_desliga_o_claude_md(self):
        env = cli._subprocess_env(0)

        assert env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"] == "1"

    def test_continua_na_assinatura_sem_chave_de_api(self, monkeypatch):
        monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-x")

        env = cli._subprocess_env(0)

        assert "ANTHROPIC_API_KEY" not in env


class TestRecusaDaIaExplicada:
    """Quando a IA conversa/recusa, o operador lê o que ela disse, não
    "Expecting value: line 1 column 1"."""

    def _gerar(self, monkeypatch, texto: str):
        async def fake_text(*_a, **_k):
            return texto

        monkeypatch.setattr(cli, "generate_text", fake_text)
        return asyncio.run(cli.generate_json("p", model="sonnet"))

    def test_texto_sem_json_leva_a_resposta_da_ia_na_mensagem(self, monkeypatch):
        recusa = "Não posso gerar as cenas: o trecho pede algo fora da minha política."

        with pytest.raises(ValueError) as exc:
            self._gerar(monkeypatch, recusa)

        assert recusa in str(exc.value)
        assert "Expecting value" not in str(exc.value)

    def test_continua_sendo_json_decode_error_para_quem_ja_captura(self, monkeypatch):
        with pytest.raises(json.JSONDecodeError):
            self._gerar(monkeypatch, "só conversa")

    def test_texto_longo_e_cortado_na_mensagem(self, monkeypatch):
        with pytest.raises(ValueError) as exc:
            self._gerar(monkeypatch, "a" * 5000)

        assert len(str(exc.value)) < 700

    def test_json_valido_nao_muda(self, monkeypatch):
        assert self._gerar(monkeypatch, '{"ok": true}') == {"ok": True}
