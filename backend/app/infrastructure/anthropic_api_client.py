"""O Claude pela API da Anthropic, com a chave do operador (BYOK, D-720).

Espelha `claude_cli_client` e `antigravity_cli_client`: gera texto/JSON com a
skill do canal como instrução de sistema. WHY existir: os dois transportes que
havia são por ASSINATURA (`claude -p`, `agy -p`) — numa instalação de terceiros,
quem não tem Claude Code nem Antigravity não gerava nada. Com a chave, basta uma
conta de API.

Decisões que o código abaixo carrega:

- **Ligado só por escolha explícita** (`IA_CLAUDE_TRANSPORTE=api`), nunca pela
  presença de uma chave. A máquina de produção tem um `ANTHROPIC_API_KEY` de
  usuário, sem créditos, exportado por outra ferramenta; se a presença dele
  ligasse a API, a geração quebraria em silêncio. Pelo mesmo motivo a chave e o
  endereço vêm de configuração própria (`IA_ANTHROPIC_*`), e o cliente não lê
  `ANTHROPIC_BASE_URL` do ambiente.
- **Os aliases das skills viram ids atuais.** As skills guardam `opus`, `sonnet`
  e `haiku` — o que o `claude -p` entende. Id completo passa como veio.
- **O `thinking_tokens` da skill só vale no Haiku.** No Opus 5 e no Sonnet 5 o
  raciocínio é adaptativo e a API recusa (400) um orçamento fixo; lá o campo é
  ignorado e o modelo decide quanto pensar. No Haiku 4.5, que ainda aceita
  orçamento, o valor da skill é usado.
- **Streaming**, porque a análise de uma live devolve respostas longas e a
  chamada sem streaming estoura o tempo HTTP do SDK.
- **A SDK é importada só quando a API é chamada.** Quem usa a assinatura não
  depende dela: uma instalação atualizada sem `pip install` continua subindo, e só
  quem escolheu a API lê que falta a SDK.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING

from app.config import settings
from app.domain.compartilhado.erros import ConfiguracaoAusente, ServicoExternoFalhou
from app.infrastructure import claude_cli_client, fila_ia
from app.infrastructure.claude_cli_client import LlmCallContext

if TYPE_CHECKING:
    import anthropic

logger = logging.getLogger(__name__)

# Os aliases que as skills usam (os do `claude -p`) → os ids atuais da API.
MODELOS_POR_ALIAS: dict[str, str] = {
    "opus": "claude-opus-5",
    "sonnet": "claude-sonnet-5",
    "haiku": "claude-haiku-4-5",
}

# Modelos que ainda aceitam `budget_tokens`. Nos demais o orçamento é um 400.
_ACEITAM_ORCAMENTO = ("claude-haiku-4-5",)
_ORCAMENTO_MINIMO = 1024

# Teto da resposta. Com streaming não há risco de tempo HTTP, e cortar uma
# análise no meio sai mais caro (a chamada inteira se perde) que sobrar folga.
MAX_TOKENS = 32000


def modelo_da_api(modelo: str) -> str:
    """O id da API para o modelo da skill: alias traduzido, id completo como veio.

    >>> modelo_da_api("opus")
    'claude-opus-5'
    >>> modelo_da_api("claude-opus-4-8")
    'claude-opus-4-8'
    """
    return MODELOS_POR_ALIAS.get(modelo.strip().lower(), modelo.strip())


def parametros_da_chamada(
    prompt: str, *, model: str, expertise: str | None, thinking_tokens: int | None
) -> dict:
    """Os argumentos de `messages.stream` — puros, para o teste ler sem rede."""
    modelo = modelo_da_api(model)
    parametros: dict = {
        "model": modelo,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": prompt}],
    }
    if expertise:
        parametros["system"] = expertise
    orcamento = thinking_tokens or 0
    if modelo in _ACEITAM_ORCAMENTO and orcamento >= _ORCAMENTO_MINIMO:
        parametros["thinking"] = {
            "type": "enabled",
            "budget_tokens": min(orcamento, MAX_TOKENS - 1),
        }
    return parametros


def _sdk():
    try:
        import anthropic
    except ImportError as exc:
        raise ConfiguracaoAusente(
            "A IA está configurada para usar a API da Anthropic, mas a SDK não está "
            "instalada: rode `pip install -r backend/requirements.txt` e reinicie."
        ) from exc
    return anthropic


def _cliente() -> anthropic.AsyncAnthropic:
    """O cliente da API, com a chave e o endereço da configuração desta instalação."""
    anthropic = _sdk()
    chave = settings.ia_anthropic_api_key.strip()
    if not chave:
        raise ConfiguracaoAusente(
            "A IA está configurada para usar a API da Anthropic (IA_CLAUDE_TRANSPORTE=api), "
            "mas falta a chave: preencha IA_ANTHROPIC_API_KEY no backend/.env e reinicie."
        )
    return anthropic.AsyncAnthropic(api_key=chave, base_url=settings.ia_anthropic_base_url)


def _texto_da_mensagem(mensagem) -> str:
    """O texto final, ou a razão de não haver um que sirva."""
    if mensagem.stop_reason == "refusal":
        raise ServicoExternoFalhou("A API da Anthropic recusou o pedido (stop_reason=refusal).")
    if mensagem.stop_reason == "max_tokens":
        raise ServicoExternoFalhou(
            f"A resposta da API passou de {MAX_TOKENS} tokens e veio cortada."
        )
    return "".join(bloco.text for bloco in mensagem.content if bloco.type == "text").strip()


def _envelope_telemetria(mensagem) -> dict:
    """Traduz o `usage` da API para o formato que a telemetria do Claude lê."""
    uso = mensagem.usage
    return {
        "usage": {"input_tokens": uso.input_tokens, "output_tokens": uso.output_tokens},
        "duration_ms": None,
        # O custo depende da tabela de preços de cada modelo; fica para o painel.
        "total_cost_usd": None,
    }


async def _consumir(cliente: anthropic.AsyncAnthropic, parametros: dict):
    async with cliente.messages.stream(**parametros) as fluxo:
        return await fluxo.get_final_message()


async def _chamar(parametros: dict, limite: float):
    anthropic = _sdk()
    cliente = _cliente()
    try:
        # O limite cobre a chamada inteira — abrir o stream também pode pendurar.
        return await asyncio.wait_for(_consumir(cliente, parametros), timeout=limite)
    except TimeoutError as exc:
        raise ServicoExternoFalhou(f"A API da Anthropic não respondeu em {limite:.0f}s.") from exc
    except anthropic.AuthenticationError as exc:
        raise ConfiguracaoAusente(
            "A API da Anthropic recusou a chave IA_ANTHROPIC_API_KEY (inválida ou revogada)."
        ) from exc
    except anthropic.APIStatusError as exc:
        raise ServicoExternoFalhou(
            f"A API da Anthropic respondeu {exc.status_code}: {exc.message}"
        ) from exc
    except anthropic.APIConnectionError as exc:
        raise ServicoExternoFalhou(f"Sem conexão com a API da Anthropic: {exc}") from exc
    finally:
        await cliente.close()


async def generate_text(
    prompt: str,
    *,
    model: str,
    expertise: str | None = None,
    timeout: float | None = None,
    thinking_tokens: int | None = None,
    contexto: LlmCallContext | None = None,
) -> str:
    """Gera texto livre. `expertise` (corpo da skill) vai como instrução de sistema."""
    parametros = parametros_da_chamada(
        prompt, model=model, expertise=expertise, thinking_tokens=thinking_tokens
    )
    entrada = f"{expertise}\n\n{prompt}" if expertise else prompt
    limite = claude_cli_client._timeout_para_prompt(
        entrada, timeout if timeout is not None else settings.claude_cli_timeout
    )
    etapa = contexto.etapa if contexto else None

    inicio = time.perf_counter()
    chave_fila = fila_ia.anunciar_inicio(
        etapa,
        projeto_id=contexto.projeto_id if contexto else None,
        corte_id=contexto.corte_id if contexto else None,
    )
    try:
        mensagem = await _chamar(parametros, limite)
        texto = _texto_da_mensagem(mensagem)
    except (ServicoExternoFalhou, ConfiguracaoAusente) as exc:
        claude_cli_client._registrar_telemetria(
            prompt=entrada,
            resposta="",
            model=parametros["model"],
            skill=None,
            contexto=contexto,
            envelope=None,
            latencia_ms=(time.perf_counter() - inicio) * 1000.0,
            erro=exc,
        )
        fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
        raise
    except BaseException as exc:
        fila_ia.anunciar_fim(chave_fila, sucesso=False, erro=fila_ia.mensagem_de(exc))
        raise

    claude_cli_client._registrar_telemetria(
        prompt=entrada,
        resposta=texto,
        model=parametros["model"],
        skill=None,
        contexto=contexto,
        envelope=_envelope_telemetria(mensagem),
        latencia_ms=(time.perf_counter() - inicio) * 1000.0,
        erro=None,
    )
    fila_ia.anunciar_fim(chave_fila, sucesso=True)
    return texto


async def generate_json(
    prompt: str,
    *,
    model: str,
    expertise: str | None = None,
    timeout: float | None = None,
    thinking_tokens: int | None = None,
    contexto: LlmCallContext | None = None,
) -> dict:
    """Gera JSON com o mesmo contrato de extração dos transportes por assinatura."""
    texto = await generate_text(
        prompt,
        model=model,
        expertise=expertise,
        timeout=timeout,
        thinking_tokens=thinking_tokens,
        contexto=contexto,
    )
    try:
        return claude_cli_client._extract_json(texto)
    except Exception as exc:
        # A chamada deu certo, mas o resultado é inútil: a fila mostra como falha.
        fila_ia.anunciar_fim(
            fila_ia.chave(
                contexto.etapa if contexto else None,
                projeto_id=contexto.projeto_id if contexto else None,
                corte_id=contexto.corte_id if contexto else None,
            ),
            sucesso=False,
            erro=fila_ia.mensagem_de(exc),
        )
        raise
