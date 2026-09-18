"""Fechar o app precisa desfazer o que o boot fez (D-653).

O `lifespan` não tinha nada depois do `yield`: fechar a janela deixava tarefas
de fundo no meio do caminho, ffmpeg vivo e o banco com conexões abertas. O
sintoma aparece dias depois — um processo órfão segurando arquivo e disputando
a máquina (já aconteceu aqui, com um worker de PROD).
"""

import asyncio
import sys

import pytest
from app.infrastructure import processos_em_voo
from app.services import encerramento, tasks


@pytest.fixture(autouse=True)
def registro_limpo():
    processos_em_voo.limpar()
    yield
    processos_em_voo.limpar()


@pytest.mark.asyncio
async def test_tarefa_de_fundo_e_cancelada_no_encerramento():
    comecou = asyncio.Event()

    async def trabalho_sem_fim():
        comecou.set()
        await asyncio.sleep(3600)

    tarefa = tasks.fire_and_forget(trabalho_sem_fim(), name="teste-encerramento")
    await comecou.wait()

    resultado = await encerramento.encerrar_com_calma(espera_seg=2)

    assert resultado["tarefas_canceladas"] == 1
    assert tarefa.cancelled() or tarefa.done()


@pytest.mark.asyncio
async def test_processo_filho_nao_sobrevive_ao_fechamento():
    """O ffmpeg do backend não pode continuar comendo CPU depois do app fechar."""
    dormindo = await asyncio.to_thread(
        __import__("subprocess").Popen,
        [sys.executable, "-c", "import time; time.sleep(30)"],
    )
    processos_em_voo.registrar("corte-1", dormindo)

    resultado = await encerramento.encerrar_com_calma(espera_seg=1)

    assert resultado["processos_encerrados"] == 1
    assert await asyncio.to_thread(dormindo.wait, 10) is not None
    assert dormindo.poll() is not None, "o processo filho seguiu vivo"


@pytest.mark.asyncio
async def test_tarefa_teimosa_nao_prende_o_fechamento():
    """Quem fecha o app quer o app fechado, não uma espera misteriosa."""

    async def ignora_o_primeiro_cancelamento():
        # Engole UMA vez (é o defeito que o encerramento precisa tolerar) e sai
        # na segunda — senão a própria suíte ficaria com uma tarefa imortal.
        ja_ignorou = False
        while True:
            try:
                await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                if ja_ignorou:
                    raise
                ja_ignorou = True

    teimosa = tasks.fire_and_forget(ignora_o_primeiro_cancelamento(), name="teste-teimosa")
    await asyncio.sleep(0.1)

    inicio = asyncio.get_running_loop().time()
    await encerramento.encerrar_com_calma(espera_seg=0.5)
    gasto = asyncio.get_running_loop().time() - inicio

    assert gasto < 3, f"o encerramento esperou {gasto:.1f}s por uma tarefa teimosa"

    teimosa.cancel()
    with pytest.raises(asyncio.CancelledError):
        await teimosa


@pytest.mark.asyncio
async def test_sem_nada_pendente_o_encerramento_e_silencioso():
    resultado = await encerramento.encerrar_com_calma(espera_seg=1)

    assert resultado == {"tarefas_canceladas": 0, "processos_encerrados": 0}
