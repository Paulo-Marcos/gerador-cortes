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
    _anunciar_na_fila(name)
    task.add_done_callback(_encerrar_na_fila)
    return task


def _anunciar_na_fila(name: str | None) -> None:
    """Publica a task na fila global, quando ela for trabalho pesado (D-417).

    Quem decide o que entra é o mapa em `tarefas_ativas` — task não mapeada é
    ignorada em silêncio (sync de stats, OAuth, sub-fases do render final). O
    nome carrega só os 8 primeiros chars do id; a resolução para o id completo
    acontece na leitura, contra o banco.
    """
    try:
        from app.services.tarefas_ativas import TarefasAtivas, classificar_background

        classificacao = classificar_background(name)
        if classificacao is None:
            return
        tipo, escopo, etapa, prefixo = classificacao
        TarefasAtivas.iniciar(
            _chave(name),
            tipo=tipo,
            etapa=etapa,
            projeto_prefixo=prefixo if escopo == "projeto" else "",
            corte_prefixo=prefixo if escopo == "corte" else "",
        )
    except Exception as exc:  # noqa: BLE001 — fila é best-effort, nunca fatal
        logger.warning("Falha ao anunciar background task '%s' na fila: %s", name, exc)


def _encerrar_na_fila(task: asyncio.Task[Any]) -> None:
    """Marca o desfecho da task na fila global. No-op se ela não foi anunciada."""
    try:
        from app.services.tarefas_ativas import TarefasAtivas

        if task.cancelled():
            TarefasAtivas.encerrar(_chave(task.get_name()), sucesso=False, erro="cancelada")
            return
        exc = task.exception()
        TarefasAtivas.encerrar(
            _chave(task.get_name()),
            sucesso=exc is None,
            erro=str(exc) if exc else "",
        )
    except Exception as exc:  # noqa: BLE001 — fila é best-effort, nunca fatal
        logger.warning("Falha ao encerrar background task na fila: %s", exc)


def _chave(name: str | None) -> str:
    return f"task:{name or ''}"


def _log_task_exception(task: asyncio.Task[Any]) -> None:
    """Loga exceções de background tasks que, sem isto, seriam silenciadas."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error("Erro em background task '%s'", task.get_name(), exc_info=exc)
