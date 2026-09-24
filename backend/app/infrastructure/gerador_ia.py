"""Os adaptadores da porta `GeradorIA` e a escolha do provider (D-695).

Antes, cada ponto que gerava repetia `if provider == "gemini"`. Agora a escolha
mora em `gerador_para`, e cada adaptador traduz o `PedidoIA` para os argumentos
do seu cliente — os mesmos que os chamadores montavam à mão.
"""

from app.domain.compartilhado.gerador_ia import GeradorIA, PedidoIA
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.provider_ia import ProviderIA


def _contexto(pedido: PedidoIA) -> claude_cli_client.LlmCallContext:
    return claude_cli_client.LlmCallContext(
        etapa=pedido.etapa,
        projeto_id=pedido.projeto_id,
        corte_id=pedido.corte_id,
        short_id=pedido.short_id,
    )


def _sem_ausentes(**argumentos) -> dict:
    # `is not None`, e não verdade: corpo vazio e thinking 0 são valores da skill.
    return {nome: valor for nome, valor in argumentos.items() if valor is not None}


class GeradorClaudeCli:
    def modelo(self, pedido: PedidoIA) -> str:
        return pedido.modelo

    def argumentos(self, pedido: PedidoIA) -> dict:
        return _sem_ausentes(
            model=pedido.modelo,
            skill=pedido.skill,
            expertise=pedido.expertise,
            timeout=pedido.timeout,
            thinking_tokens=pedido.thinking_tokens,
            contexto=_contexto(pedido),
        )

    async def gerar_json(self, prompt: str, pedido: PedidoIA) -> dict:
        return await claude_cli_client.generate_json(prompt, **self.argumentos(pedido))

    async def gerar_texto(self, prompt: str, pedido: PedidoIA) -> str:
        return await claude_cli_client.generate_text(prompt, **self.argumentos(pedido))


class GeradorAntigravityCli:
    """O Gemini pelo `agy -p`: a mesma skill, com o modelo Gemini dela."""

    def modelo(self, pedido: PedidoIA) -> str:
        return pedido.modelo_gemini

    def argumentos(self, pedido: PedidoIA) -> dict:
        return _sem_ausentes(
            model=pedido.modelo_gemini,
            expertise=pedido.expertise,
            timeout=pedido.timeout,
            contexto=_contexto(pedido),
        )

    async def gerar_json(self, prompt: str, pedido: PedidoIA) -> dict:
        return await antigravity_cli_client.generate_json(prompt, **self.argumentos(pedido))

    async def gerar_texto(self, prompt: str, pedido: PedidoIA) -> str:
        return await antigravity_cli_client.generate_text(prompt, **self.argumentos(pedido))


_CLAUDE = GeradorClaudeCli()
_POR_PROVIDER: dict[str, GeradorIA] = {"claude": _CLAUDE, "gemini": GeradorAntigravityCli()}


def gerador_para(provider: ProviderIA) -> GeradorIA:
    # Provider desconhecido cai no Claude, como fazia o `if` que esta função substitui.
    return _POR_PROVIDER.get(provider, _CLAUDE)
