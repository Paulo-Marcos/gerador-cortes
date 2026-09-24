"""A porta `GeradorIA` e os seus dois adaptadores (D-695).

Os adaptadores substituem o `if provider == "gemini"` que cada chamador repetia.
O que se protege aqui é que cada cliente recebe os mesmos argumentos que recebia
quando os chamadores os montavam à mão.
"""

import asyncio

import pytest
from app.domain.compartilhado.gerador_ia import PedidoIA
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.infrastructure.claude_cli_client import LlmCallContext
from app.infrastructure.gerador_ia import GeradorAntigravityCli, GeradorClaudeCli, gerador_para

_DA_SKILL = PedidoIA(
    etapa="trechos-expert",
    modelo="sonnet",
    modelo_gemini="gemini-qualidade",
    skill="trechos-expert",
    expertise="",
    timeout=120.0,
    thinking_tokens=0,
    corte_id="corte-y",
)
_SEM_SKILL = PedidoIA(etapa="padroes-thumbnail", modelo="sonnet", modelo_gemini="gemini-q")


def test_o_claude_recebe_tudo_o_que_a_skill_define_mesmo_vazio_ou_zero():
    assert GeradorClaudeCli().argumentos(_DA_SKILL) == {
        "model": "sonnet",
        "skill": "trechos-expert",
        "expertise": "",
        "timeout": 120.0,
        "thinking_tokens": 0,
        "contexto": LlmCallContext(etapa="trechos-expert", corte_id="corte-y"),
    }


def test_o_gemini_recebe_o_modelo_gemini_e_nada_que_so_o_claude_entende():
    assert GeradorAntigravityCli().argumentos(_DA_SKILL) == {
        "model": "gemini-qualidade",
        "expertise": "",
        "timeout": 120.0,
        "contexto": LlmCallContext(etapa="trechos-expert", corte_id="corte-y"),
    }


@pytest.mark.parametrize("gerador", [GeradorClaudeCli(), GeradorAntigravityCli()])
def test_pedido_sem_skill_deixa_o_cliente_usar_os_proprios_padroes(gerador):
    assert set(gerador.argumentos(_SEM_SKILL)) == {"model", "contexto"}


@pytest.mark.parametrize(
    ("provider", "cliente_esperado", "modelo_esperado"),
    [
        ("claude", "claude", "sonnet"),
        ("gemini", "gemini", "gemini-qualidade"),
        ("desconhecido", "claude", "sonnet"),
    ],
)
def test_cada_provider_chega_ao_seu_cliente(
    provider, cliente_esperado, modelo_esperado, monkeypatch
):
    chamados = []

    def _fake(nome):
        async def _gerar(prompt, **argumentos):
            chamados.append((nome, argumentos["model"]))
            return {}

        return _gerar

    monkeypatch.setattr(claude_cli_client, "generate_json", _fake("claude"))
    monkeypatch.setattr(antigravity_cli_client, "generate_json", _fake("gemini"))
    gerador = gerador_para(provider)

    asyncio.run(gerador.gerar_json("P", _DA_SKILL))

    assert chamados == [(cliente_esperado, modelo_esperado)]
    assert gerador.modelo(_DA_SKILL) == modelo_esperado
