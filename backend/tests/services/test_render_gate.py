"""D-440/D-441: gate global do pipeline de render + pool com back-pressure de RAM.

Em PRD, lotes de 6-12 pipelines concorrentes degradaram a razão render/clip
de 1,16x (serial) para 4,68x. O gate limita os pipelines simultâneos a
RENDER_PIPELINE_CONCURRENCY (default 2), e o slot extra só libera com
RENDER_MIN_RAM_LIVRE_MB de RAM sobrando (D-441).
"""

from __future__ import annotations

import asyncio

import pytest
from app.services.render import remotion_render as rr


@pytest.fixture(autouse=True)
def _reset_gate(monkeypatch):
    rr._render_gate.limpar()
    monkeypatch.setattr(rr, "_renders_ativos", 0)
    yield
    rr._render_gate.limpar()
    rr._renders_ativos = 0


def test_gate_default_e_pool_de_2():
    async def _run():
        return rr._obter_render_gate()._value

    assert asyncio.run(_run()) == 2


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


def test_pool_nao_excede_o_limite(monkeypatch):
    """Caminho feliz do pool: com limite 2 e RAM folgada, no máximo 2 rodam
    ao mesmo tempo — nunca 3."""
    monkeypatch.setenv("RENDER_PIPELINE_CONCURRENCY", "2")
    monkeypatch.setattr("app.infrastructure.memoria.ram_disponivel_mb", lambda: 99999.0)
    ativos = {"n": 0, "max": 0}

    async def _job(cid):
        async with rr.vaga_de_render(lambda _etapa: None):
            ativos["n"] += 1
            ativos["max"] = max(ativos["max"], ativos["n"])
            try:
                await asyncio.sleep(0.01)
            finally:
                ativos["n"] -= 1

    async def _run():
        await asyncio.gather(_job("a"), _job("b"), _job("c"), _job("d"))

    asyncio.run(_run())
    assert ativos["max"] == 2


def test_ram_apertada_segura_o_segundo_slot(monkeypatch):
    """Com outro render ativo e RAM abaixo do limiar, o slot extra espera;
    quando a RAM folga, ele entra."""
    monkeypatch.setenv("RENDER_MIN_RAM_LIVRE_MB", "8192")
    leituras = iter([1024.0, 1024.0, 16000.0])
    monkeypatch.setattr("app.infrastructure.memoria.ram_disponivel_mb", lambda: next(leituras))
    monkeypatch.setattr(rr.asyncio, "sleep", _sleep_instantaneo)
    rr._renders_ativos = 1

    asyncio.run(rr._aguardar_folga_de_ram(_sem_aviso))
    assert next(leituras, "esgotou") == "esgotou", (
        "deveria ter consumido as 3 leituras (2 vetos + 1 liberacao)"
    )


def test_leitura_de_ram_indisponivel_nao_veta(monkeypatch):
    monkeypatch.setattr("app.infrastructure.memoria.ram_disponivel_mb", lambda: None)
    rr._renders_ativos = 1
    asyncio.run(rr._aguardar_folga_de_ram(_sem_aviso))


def test_primeiro_render_nunca_espera_ram(monkeypatch):
    """Sem render ativo, nem checa a RAM — o primeiro slot é incondicional."""

    def _explode():
        raise AssertionError("nao deveria ler RAM sem render ativo")

    monkeypatch.setattr("app.infrastructure.memoria.ram_disponivel_mb", _explode)
    rr._renders_ativos = 0
    asyncio.run(rr._aguardar_folga_de_ram(_sem_aviso))


def test_quem_espera_e_avisado_do_motivo(monkeypatch):
    """D-843: corte e short dividem o portão; cada um conta a espera na própria tela."""
    monkeypatch.setenv("RENDER_PIPELINE_CONCURRENCY", "1")
    avisos: list[str] = []

    async def _run():
        async with rr.vaga_de_render(avisos.append):
            segundo = asyncio.create_task(_entrar(rr.vaga_de_render(avisos.append)))
            await asyncio.sleep(0.01)
        await segundo

    asyncio.run(_run())
    assert avisos == ["Aguardando vez na fila de render"]


async def _entrar(vaga):
    async with vaga:
        pass


def _sem_aviso(_etapa: str) -> None:
    return None


async def _sleep_instantaneo(_segundos):
    return None
