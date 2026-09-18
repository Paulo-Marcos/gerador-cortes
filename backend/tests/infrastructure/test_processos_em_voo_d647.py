"""Cancelar precisa MATAR o ffmpeg que o backend disparou (D-647).

Antes, cancelar soltava a task e a UI dizia "cancelado" — mas o processo
continuava vivo, comendo CPU e segurando a thread que o esperava até o teto de
1h. `asyncio.to_thread` não é cancelável: só matando o processo se resolve.

Aqui o "ffmpeg" é um Python que dorme. Processo de verdade, morte de verdade,
sem depender de ter ffmpeg instalado na máquina que roda o teste.
"""

import asyncio
import sys
import time

import pytest
from app.infrastructure import processos_em_voo
from app.infrastructure.ffmpeg_runner import _run_ffmpeg_in_thread
from app.infrastructure.worker_queue import definir_dono_dos_jobs

DONO = "corte-de-teste"


def _dormindo(segundos: float) -> list[str]:
    return [sys.executable, "-c", f"import time; time.sleep({segundos})"]


@pytest.fixture(autouse=True)
def registro_limpo():
    processos_em_voo.limpar()
    yield
    processos_em_voo.limpar()


@pytest.mark.asyncio
async def test_cancelar_mata_o_ffmpeg_que_o_backend_disparou():
    async def trabalho():
        definir_dono_dos_jobs(DONO)  # o ContextVar vive dentro da task
        return await _run_ffmpeg_in_thread(
            _dormindo(30), label="teste", capture_output=False, timeout=60
        )

    tarefa = asyncio.create_task(trabalho())
    while processos_em_voo.em_voo(DONO) == 0:  # espera o processo nascer
        await asyncio.sleep(0.05)

    t0 = time.time()
    assert processos_em_voo.matar_owner(DONO) == 1
    resultado = await asyncio.wait_for(tarefa, timeout=20)

    assert time.time() - t0 < 15, "o processo deveria morrer na hora, não no timeout"
    assert resultado.returncode != 0, "processo morto não pode ser reportado como sucesso"
    assert processos_em_voo.em_voo(DONO) == 0, "o registro não pode guardar processo morto"


@pytest.mark.asyncio
async def test_timeout_pedido_e_o_timeout_aplicado():
    """O bug da D-647: o valor pedido se perdia e virava 1h fixa."""
    t0 = time.time()
    resultado = await _run_ffmpeg_in_thread(
        _dormindo(30), label="teste", capture_output=False, timeout=1
    )
    decorrido = time.time() - t0

    assert resultado.returncode == -1
    assert "Timeout" in resultado.stderr_tail
    assert decorrido < 15, f"esperava ~1s de timeout, levou {decorrido:.1f}s"


@pytest.mark.asyncio
async def test_processo_que_termina_bem_sai_do_registro():
    async def trabalho():
        definir_dono_dos_jobs(DONO)
        return await _run_ffmpeg_in_thread(
            _dormindo(0.1), label="teste", capture_output=True, timeout=30
        )

    resultado = await asyncio.create_task(trabalho())

    assert resultado.returncode == 0
    assert processos_em_voo.em_voo(DONO) == 0


@pytest.mark.asyncio
async def test_sem_dono_o_processo_nao_e_registrado():
    """Trabalho avulso (sem dono) roda igual — só não é alvo de cancelamento."""
    resultado = await _run_ffmpeg_in_thread(
        _dormindo(0.1), label="teste", capture_output=False, timeout=30
    )

    assert resultado.returncode == 0
    assert processos_em_voo.matar_owner("") == 0


def test_matar_owner_desconhecido_nao_explode():
    assert processos_em_voo.matar_owner("ninguem-aqui") == 0
