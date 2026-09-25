"""Uma primitiva de concorrência por event loop (D-700).

Semáforo, lock e condição do asyncio se prendem ao loop em que são disputados
pela primeira vez; usados noutro loop, quebram com "bound to a different event
loop". Em produção há um loop só (o do uvicorn), e "uma por loop" é "uma só".
Nos testes, cada `asyncio.run` abre um loop novo — e a primitiva nasce limpa
nele, sem ninguém precisar zerá-la à mão.

A chave é o próprio loop, não o `id` dele: o Python reaproveita `id` de objeto
morto (200 loops seguidos usaram 4 ids). Loops fechados saem quando um loop novo
pede a sua primitiva — referência fraca não bastaria, porque a primitiva
disputada segura o loop dela (medido em 25/09/2026).
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class PorLoop(Generic[T]):
    """A primitiva que `fabrica` cria, uma por event loop."""

    def __init__(self, fabrica: Callable[[], T]) -> None:
        self._fabrica = fabrica
        self._por_loop: dict[asyncio.AbstractEventLoop, T] = {}

    def obter(self) -> T:
        """A primitiva do loop que está rodando; nasce no primeiro pedido dele."""
        loop = asyncio.get_running_loop()
        primitiva = self._por_loop.get(loop)
        if primitiva is None:
            for fechado in [lp for lp in self._por_loop if lp.is_closed()]:
                del self._por_loop[fechado]
            primitiva = self._fabrica()
            self._por_loop[loop] = primitiva
        return primitiva

    def limpar(self) -> None:
        """Esquece todas; a próxima `obter` cria de novo (testes que mudam o limite)."""
        self._por_loop.clear()
