"""As primitivas de concorrência presas ao event loop (D-700).

Teste de caracterização, antes de as quatro passarem a nascer pelo mesmo
mecanismo do core. Fixa o que o app depende delas: dentro de um loop, quem pede
recebe a MESMA primitiva — é isso que faz o limite valer para todos —, o limite
se respeita sob disputa, e a primitiva segue funcionando quando os testes abrem
um loop novo depois de outro. As referências que o movimento troca ficam no topo.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from app.config import settings
from app.infrastructure import antigravity_cli_client as agy
from app.infrastructure import claude_cli_client as claude
from app.services import remotion_bundle_cache as bundle
from app.services import remotion_render as rr

_BUNDLE = Path("raiz-do-cache")


def gate_do_claude():
    return claude._get_gate()


def semaforo_do_agy():
    return agy._semaforo()


def gate_do_render():
    return rr._obter_render_gate()


def lock_do_bundle():
    return bundle._lock_da_construcao(_BUNDLE, "fingerprint-x")


def _entrar(obter):
    """O `async with` de cada primitiva, como o app a usa."""
    primitiva = obter()
    return primitiva.adquirir() if obter is gate_do_claude else primitiva


async def _maximo_simultaneo(obter, tarefas: int) -> int:
    ativos = {"agora": 0, "max": 0}

    async def trabalho():
        async with _entrar(obter):
            ativos["agora"] += 1
            ativos["max"] = max(ativos["max"], ativos["agora"])
            await asyncio.sleep(0.01)
            ativos["agora"] -= 1

    await asyncio.gather(*(trabalho() for _ in range(tarefas)))
    return ativos["max"]


@pytest.fixture
def limites(monkeypatch):
    monkeypatch.setattr(settings, "claude_cli_max_concurrent", 2)
    monkeypatch.setattr(settings, "agy_cli_max_concurrent", 2)
    monkeypatch.setenv("RENDER_PIPELINE_CONCURRENCY", "2")
    rr._render_gate = None
    yield
    rr._render_gate = None


@pytest.mark.parametrize("obter", [gate_do_claude, semaforo_do_agy, gate_do_render, lock_do_bundle])
def test_no_mesmo_loop_todos_recebem_a_mesma_primitiva(obter, limites):
    async def duas_vezes():
        return obter() is obter()

    assert asyncio.run(duas_vezes())


@pytest.mark.parametrize(
    ("obter", "limite"),
    [(gate_do_claude, 2), (semaforo_do_agy, 2), (gate_do_render, 2), (lock_do_bundle, 1)],
)
def test_o_limite_vale_sob_disputa(obter, limite, limites):
    assert asyncio.run(_maximo_simultaneo(obter, tarefas=5)) == limite


# O gate do render e o lock do bundle ainda não: presos ao primeiro loop que os
# disputou, quebram no seguinte com "bound to a different event loop" (medido em
# 25/09/2026). Em produção há um loop só; nos testes, o do render é zerado à mão.
@pytest.mark.parametrize("obter", [gate_do_claude, semaforo_do_agy])
def test_segue_funcionando_em_loops_seguidos(obter, limites):
    for _ in range(3):
        assert asyncio.run(_maximo_simultaneo(obter, tarefas=5)) >= 1
