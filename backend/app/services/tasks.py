"""Supervisão de tasks fire-and-forget (background).

Motivação (D-224): `asyncio.create_task(coro)` sem guardar a referência
retornada tem dois riscos documentados:

1. O event loop mantém apenas uma referência *fraca* à task. Sem uma referência
   forte viva, o GC pode coletá-la no meio da execução — é o aviso explícito da
   doc oficial do CPython em `asyncio.create_task`.
2. Exceções não observadas morrem em silêncio: a task falha, ninguém lê o
   `exception()`, e a UI fica esperando um status que nunca chega.

`fire_and_forget` resolve os dois de uma vez: guarda a task num set de módulo até
ela concluir e anexa um callback que loga qualquer exceção não tratada. É o
substituto único de `asyncio.create_task(...)` nos pontos fire-and-forget.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger(__name__)

# Segura uma referência forte a cada task em voo até ela concluir. Sem isto o
# event loop só a referencia fracamente e o GC pode coletá-la no meio.
_background_tasks: set[asyncio.Task[Any]] = set()


def fire_and_forget(
    coro: Coroutine[Any, Any, Any], *, name: str | None = None
) -> asyncio.Task[Any]:
    """Agenda `coro` em background segurando a referência e logando exceções.

    Use no lugar de `asyncio.create_task(coro)` sempre que o resultado não for
    aguardado (fire-and-forget). Retorna a `Task` caso o chamador queira
    inspecioná-la, mas não é necessário guardá-la.
    """
    task = asyncio.create_task(coro, name=name)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    task.add_done_callback(_log_task_exception)
    return task


def _log_task_exception(task: asyncio.Task[Any]) -> None:
    """Loga exceções de background tasks que, sem isto, seriam silenciadas."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Erro em background task '%s'", task.get_name(), exc_info=exc)
