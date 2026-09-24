"""Porta da geração por IA (D-695; ADR-0015 §4).

É porta porque há mais de uma implementação real — o Claude CLI e o Antigravity
CLI hoje, a chave de API no E-056. Quem gera monta um `PedidoIA` e não sabe qual
provider atende; a escolha fica num lugar só, na infraestrutura.
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class PedidoIA:
    """O que uma etapa pede à IA, o mesmo para qualquer provider.

    Cada provider usa o que lhe cabe: o Claude usa `modelo`, `skill` e
    `thinking_tokens`; o Gemini usa `modelo_gemini`. Campo `None` fica de fora da
    chamada, e o cliente aplica o próprio padrão.
    """

    etapa: str
    modelo: str
    modelo_gemini: str
    skill: str | None = None
    expertise: str | None = None
    timeout: float | None = None
    thinking_tokens: int | None = None
    projeto_id: str | None = None
    corte_id: str | None = None
    short_id: str | None = None


class GeradorIA(Protocol):
    def modelo(self, pedido: PedidoIA) -> str:
        """O modelo que atende o pedido — é dele que a tela deriva o selo."""
        ...

    async def gerar_json(self, prompt: str, pedido: PedidoIA) -> dict: ...

    async def gerar_texto(self, prompt: str, pedido: PedidoIA) -> str: ...
