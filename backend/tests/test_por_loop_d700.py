"""O mecanismo do core que dá uma primitiva por event loop (D-700)."""

from __future__ import annotations

import asyncio

from app.core.por_loop import PorLoop


def test_no_mesmo_loop_devolve_a_mesma_e_a_fabrica_roda_uma_vez():
    criadas = []
    gate = PorLoop(lambda: criadas.append(1) or asyncio.Semaphore(1))

    async def pedir_duas():
        return gate.obter() is gate.obter()

    assert asyncio.run(pedir_duas())
    assert len(criadas) == 1


def test_loop_novo_ganha_primitiva_nova_mesmo_depois_de_disputada():
    gate = PorLoop(lambda: asyncio.Semaphore(1))

    async def disputar():
        async def entrar():
            async with gate.obter():
                await asyncio.sleep(0)

        await asyncio.gather(entrar(), entrar())
        return gate.obter()

    primeira = asyncio.run(disputar())
    segunda = asyncio.run(disputar())

    assert primeira is not segunda


def test_loops_fechados_nao_se_acumulam():
    gate = PorLoop(lambda: asyncio.Semaphore(1))

    async def pedir():
        async with gate.obter():
            pass

    for _ in range(20):
        asyncio.run(pedir())

    assert len(gate._por_loop) == 1


def test_limpar_faz_a_proxima_nascer_de_novo():
    limite = {"valor": 1}
    gate = PorLoop(lambda: asyncio.Semaphore(limite["valor"]))

    async def depois_de_limpar():
        antes = gate.obter()._value
        limite["valor"] = 3
        gate.limpar()
        return antes, gate.obter()._value

    assert asyncio.run(depois_de_limpar()) == (1, 3)
