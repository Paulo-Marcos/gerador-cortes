import asyncio
import logging

import pytest
from app.services.tasks import _background_tasks, fire_and_forget


@pytest.mark.asyncio
async def test_fire_and_forget_executa_coro_e_limpa_referencia():
    """Caminho feliz: a coro roda até o fim e a task sai do set ao concluir."""
    executou = asyncio.Event()

    async def trabalho():
        executou.set()

    task = fire_and_forget(trabalho(), name="teste-feliz")

    # Enquanto está em voo, a referência forte está registrada (anti-GC).
    assert task in _background_tasks

    await task

    assert executou.is_set()
    # Ao concluir, o callback remove a task do set — sem vazamento de memória.
    assert task not in _background_tasks


@pytest.mark.asyncio
async def test_fire_and_forget_loga_excecao_sem_propagar(caplog):
    """Exceção na coro é logada (não silenciada) e não derruba o chamador."""

    async def explode():
        raise ValueError("falha proposital")

    with caplog.at_level(logging.ERROR, logger="app.services.tasks"):
        task = fire_and_forget(explode(), name="teste-erro")
        # Aguarda a conclusão sem deixar a exceção propagar para o teste.
        await asyncio.gather(task, return_exceptions=True)

    assert task not in _background_tasks
    assert any("teste-erro" in rec.getMessage() for rec in caplog.records)
