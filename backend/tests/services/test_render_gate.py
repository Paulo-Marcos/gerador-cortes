"""D-440: gate global do pipeline de render.

Em PRD, lotes de 6-12 pipelines concorrentes degradaram a razão render/clip
de 1,16x (serial) para 4,68x. O gate serializa os pipelines: N simultâneos
definidos por RENDER_PIPELINE_CONCURRENCY (default 1).
"""

from __future__ import annotations

import asyncio

import pytest
from app.services import remotion_render as rr


@pytest.fixture(autouse=True)
def _reset_gate(monkeypatch):
    monkeypatch.setattr(rr, "_render_gate", None)
    yield
    rr._render_gate = None


def test_gate_default_serializa_em_1():
    async def _run():
        return rr._obter_render_gate()._value

    assert asyncio.run(_run()) == 1


def test_gate_respeita_env(monkeypatch):
    monkeypatch.setenv("RENDER_PIPELINE_CONCURRENCY", "3")

    async def _run():
        return rr._obter_render_gate()._value

    assert asyncio.run(_run()) == 3


def test_env_invalido_ou_zero_vira_1(monkeypatch):
    monkeypatch.setenv("RENDER_PIPELINE_CONCURRENCY", "0")

    async def _run():
        return rr._obter_render_gate()._value

    assert asyncio.run(_run()) == 1


def test_dois_renders_nao_sobrepoem():
    """Caminho feliz: com o gate default (1), o segundo pipeline só começa
    depois que o primeiro termina — nunca há dois rodando ao mesmo tempo."""
    ativos = {"n": 0, "max": 0}

    def fake_pipeline(corte_id, **kwargs):
        async def _roda():
            ativos["n"] += 1
            ativos["max"] = max(ativos["max"], ativos["n"])
            await asyncio.sleep(0.01)
            ativos["n"] -= 1

        return _roda()

    async def _run():
        gate = rr._obter_render_gate()

        async def _com_gate(cid):
            async with gate:
                await fake_pipeline(cid)

        await asyncio.gather(_com_gate("a"), _com_gate("b"), _com_gate("c"))

    asyncio.run(_run())
    assert ativos["max"] == 1
