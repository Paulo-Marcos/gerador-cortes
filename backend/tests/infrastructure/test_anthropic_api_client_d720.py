"""O Claude pela API, com a chave do operador (BYOK, D-720).

Sem rede e sem gastar crédito: o cliente da SDK é trocado por um falso que devolve
a mensagem que a API devolveria. O que se protege:

- a PROD não muda — sem escolha explícita, o Claude segue pelo `claude -p`;
- um ANTHROPIC_API_KEY solto no ambiente não liga nada;
- o pedido sai no formato que a API atual aceita (sem orçamento de thinking onde
  ele é um 400) e a resposta volta com o mesmo contrato de JSON dos outros;
- toda falha chega à tela como erro de domínio com mensagem que diz o que fazer.
"""

import asyncio
from types import SimpleNamespace

import anthropic
import httpx2
import pytest
from app.config import Settings, settings
from app.domain.compartilhado.erros import ConfiguracaoAusente, ServicoExternoFalhou
from app.domain.compartilhado.gerador_ia import PedidoIA
from app.infrastructure import anthropic_api_client as api
from app.infrastructure import claude_cli_client
from app.infrastructure.claude_cli_client import LlmCallContext
from app.infrastructure.gerador_ia import (
    GeradorAnthropicApi,
    GeradorAntigravityCli,
    GeradorClaudeCli,
    gerador_para,
)

_REQ = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")


def _mensagem(texto: str, stop_reason: str = "end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="text", text=texto)],
        usage=SimpleNamespace(input_tokens=120, output_tokens=30),
    )


class _ClienteFalso:
    """Faz o papel de `AsyncAnthropic`: guarda o pedido e devolve a resposta dada."""

    def __init__(self, resposta=None, erro=None, demora: float = 0.0):
        self.resposta, self.erro, self.demora = resposta, erro, demora
        self.pedidos: list[dict] = []
        self.fechado = False
        self.messages = self

    def stream(self, **parametros):
        self.pedidos.append(parametros)
        return self

    async def __aenter__(self):
        if self.erro is not None:
            raise self.erro
        return self

    async def __aexit__(self, *_):
        return False

    async def get_final_message(self):
        await asyncio.sleep(self.demora)
        return self.resposta

    async def close(self):
        self.fechado = True


@pytest.fixture
def cliente(monkeypatch):
    def instalar(**kwargs) -> _ClienteFalso:
        falso = _ClienteFalso(**kwargs)
        monkeypatch.setattr(settings, "ia_anthropic_api_key", "sk-do-operador")
        monkeypatch.setattr(anthropic, "AsyncAnthropic", lambda **_: falso)
        return falso

    return instalar


# ─── A escolha do transporte ────────────────────────────────────────────────


def test_sem_escolha_explicita_o_claude_segue_pela_assinatura():
    """Não-regressão da PROD: o padrão é o `claude -p` de sempre."""
    assert Settings(_env_file=None).ia_claude_transporte == "assinatura"
    assert isinstance(gerador_para("claude"), GeradorClaudeCli)


def test_um_anthropic_api_key_no_ambiente_nao_liga_a_api(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-de-outra-ferramenta")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "http://proxy-de-outra-ferramenta")

    config = Settings(_env_file=None)

    assert config.ia_claude_transporte == "assinatura"
    assert config.ia_anthropic_api_key == ""
    assert config.ia_anthropic_base_url == "https://api.anthropic.com"


def test_com_transporte_api_o_claude_vai_pela_chave_e_o_gemini_nao_muda(monkeypatch):
    monkeypatch.setattr(settings, "ia_claude_transporte", "api")

    assert isinstance(gerador_para("claude"), GeradorAnthropicApi)
    assert isinstance(gerador_para("desconhecido"), GeradorAnthropicApi)
    assert isinstance(gerador_para("gemini"), GeradorAntigravityCli)


def test_o_adaptador_entrega_a_skill_inteira_ao_cliente_da_api():
    pedido = PedidoIA(
        etapa="metadados-expert",
        modelo="opus",
        modelo_gemini="gemini-q",
        skill="metadados-expert",
        expertise="Você é o editor do canal.",
        timeout=300.0,
        thinking_tokens=12000,
        corte_id="c1",
    )

    gerador = GeradorAnthropicApi()

    assert gerador.modelo(pedido) == "claude-opus-5"
    assert gerador.argumentos(pedido) == {
        "model": "opus",
        "expertise": "Você é o editor do canal.",
        "timeout": 300.0,
        "thinking_tokens": 12000,
        "contexto": LlmCallContext(etapa="metadados-expert", corte_id="c1"),
    }


# ─── O formato do pedido ────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("da_skill", "da_api"),
    [
        ("opus", "claude-opus-5"),
        ("Sonnet", "claude-sonnet-5"),
        ("haiku", "claude-haiku-4-5"),
        ("claude-opus-4-8", "claude-opus-4-8"),
    ],
)
def test_os_aliases_da_skill_viram_ids_atuais(da_skill, da_api):
    assert api.modelo_da_api(da_skill) == da_api


def test_a_skill_vai_como_instrucao_de_sistema():
    parametros = api.parametros_da_chamada(
        "a transcrição", model="sonnet", expertise="a skill", thinking_tokens=None
    )

    assert parametros["system"] == "a skill"
    assert parametros["messages"] == [{"role": "user", "content": "a transcrição"}]


def test_sem_skill_nao_ha_instrucao_de_sistema():
    parametros = api.parametros_da_chamada("p", model="sonnet", expertise="", thinking_tokens=0)

    assert "system" not in parametros


@pytest.mark.parametrize("modelo", ["opus", "sonnet"])
def test_opus_e_sonnet_nao_recebem_orcamento_de_thinking(modelo):
    """No Opus 5 e no Sonnet 5 um `budget_tokens` é recusado com 400."""
    parametros = api.parametros_da_chamada("p", model=modelo, expertise=None, thinking_tokens=12000)

    assert "thinking" not in parametros


def test_o_haiku_usa_o_orcamento_da_skill():
    parametros = api.parametros_da_chamada("p", model="haiku", expertise=None, thinking_tokens=3000)

    assert parametros["thinking"] == {"type": "enabled", "budget_tokens": 3000}


def test_orcamento_abaixo_do_minimo_da_api_desliga_o_thinking_do_haiku():
    parametros = api.parametros_da_chamada("p", model="haiku", expertise=None, thinking_tokens=500)

    assert "thinking" not in parametros


# ─── A chamada ──────────────────────────────────────────────────────────────


def test_gera_json_com_o_mesmo_contrato_dos_outros_transportes(cliente, monkeypatch):
    falso = cliente(resposta=_mensagem('Segue:\n```json\n{"titulo": "ok"}\n```'))
    telemetria: list[dict] = []
    monkeypatch.setattr(
        claude_cli_client, "_registrar_telemetria", lambda **kw: telemetria.append(kw)
    )

    resultado = asyncio.run(
        api.generate_json("gere", model="opus", expertise="skill", contexto=LlmCallContext())
    )

    assert resultado == {"titulo": "ok"}
    assert falso.pedidos[0]["model"] == "claude-opus-5"
    assert falso.fechado
    assert telemetria[0]["model"] == "claude-opus-5"
    assert telemetria[0]["envelope"]["usage"] == {"input_tokens": 120, "output_tokens": 30}
    assert telemetria[0]["erro"] is None


def test_o_cliente_usa_a_chave_e_o_endereco_da_configuracao(monkeypatch):
    recebido: dict = {}

    def construir(**kwargs):
        recebido.update(kwargs)
        return _ClienteFalso(resposta=_mensagem("oi"))

    monkeypatch.setattr(settings, "ia_anthropic_api_key", "  sk-do-operador  ")
    monkeypatch.setattr(anthropic, "AsyncAnthropic", construir)

    asyncio.run(api.generate_text("p", model="sonnet"))

    assert recebido == {"api_key": "sk-do-operador", "base_url": "https://api.anthropic.com"}


def test_sem_chave_o_operador_le_o_que_falta(monkeypatch):
    monkeypatch.setattr(settings, "ia_anthropic_api_key", "")

    with pytest.raises(ConfiguracaoAusente, match="IA_ANTHROPIC_API_KEY"):
        asyncio.run(api.generate_text("p", model="sonnet"))


@pytest.mark.parametrize(
    ("erro", "esperado", "trecho"),
    [
        (
            anthropic.AuthenticationError(
                "chave ruim", response=httpx2.Response(401, request=_REQ), body=None
            ),
            ConfiguracaoAusente,
            "recusou a chave",
        ),
        (
            anthropic.APIStatusError(
                "sobrecarga", response=httpx2.Response(529, request=_REQ), body=None
            ),
            ServicoExternoFalhou,
            "529",
        ),
        (anthropic.APIConnectionError(request=_REQ), ServicoExternoFalhou, "Sem conexão"),
    ],
)
def test_falha_da_api_vira_erro_de_dominio(cliente, erro, esperado, trecho):
    falso = cliente(erro=erro)

    with pytest.raises(esperado, match=trecho):
        asyncio.run(api.generate_text("p", model="sonnet"))
    assert falso.fechado


@pytest.mark.parametrize(
    ("stop_reason", "trecho"), [("refusal", "recusou"), ("max_tokens", "cortada")]
)
def test_resposta_sem_texto_utilizavel_vira_erro(cliente, stop_reason, trecho):
    cliente(resposta=_mensagem("meio texto", stop_reason=stop_reason))

    with pytest.raises(ServicoExternoFalhou, match=trecho):
        asyncio.run(api.generate_text("p", model="sonnet"))


def test_a_chamada_tem_limite_de_tempo(cliente):
    cliente(resposta=_mensagem("tarde demais"), demora=5.0)

    with pytest.raises(ServicoExternoFalhou, match="não respondeu"):
        asyncio.run(api.generate_text("p", model="sonnet", timeout=0.05))


def test_sem_a_sdk_o_backend_sobe_e_so_a_api_avisa(monkeypatch):
    """Quem usa a assinatura não depende da SDK — uma PROD atualizada sem
    `pip install` não pode deixar de subir por causa dela."""
    import importlib
    import sys

    monkeypatch.setitem(sys.modules, "anthropic", None)  # import anthropic → ImportError
    modulo = importlib.reload(api)
    try:
        monkeypatch.setattr(settings, "ia_anthropic_api_key", "sk-do-operador")
        with pytest.raises(ConfiguracaoAusente, match="pip install"):
            asyncio.run(modulo.generate_text("p", model="sonnet"))
    finally:
        monkeypatch.undo()
        importlib.reload(api)
