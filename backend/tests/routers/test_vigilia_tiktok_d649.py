"""A vigília do TikTok não pode ser recolhida pelo coletor de lixo (D-649).

Depois de abrir a aba do TikTok, o app fica esperando o operador publicar para
marcar o corte sozinho. A espera é de até 30 minutos — e a task era criada solta.
O event loop guarda tasks por referência FRACA: sem dono, o coletor pode levá-la
no meio do caminho. O upload não quebra; ele some calado, e o corte nunca é
marcado como publicado.
"""

import asyncio
import gc

import pytest
from app.routers import shorts
from app.services import tasks


@pytest.mark.asyncio
async def test_a_vigilia_fica_com_dono_e_sobrevive_ao_coletor(monkeypatch):
    comecou = asyncio.Event()

    async def vigilia_longa(_corte_id: str) -> None:
        comecou.set()
        await asyncio.sleep(5)

    monkeypatch.setattr(shorts, "_marcar_quando_publicar", vigilia_longa)

    tarefa = shorts._vigiar_publicacao_no_tiktok("corte-123456789")
    await comecou.wait()

    assert tarefa in tasks._background_tasks, "sem dono, o coletor pode levar a vigília"
    gc.collect()
    assert not tarefa.done(), "a vigília morreu no meio do caminho"

    tarefa.cancel()


@pytest.mark.asyncio
async def test_falha_na_vigilia_nao_derruba_nada_e_solta_a_referencia(monkeypatch, caplog):
    async def vigilia_que_falha(_corte_id: str) -> None:
        raise RuntimeError("aba fechada no meio")

    monkeypatch.setattr(shorts, "_marcar_quando_publicar", vigilia_que_falha)

    tarefa = shorts._vigiar_publicacao_no_tiktok("corte-123456789")
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert tarefa.done()
    assert tarefa not in tasks._background_tasks, "task terminada não pode vazar no registro"
