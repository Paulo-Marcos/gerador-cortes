"""O que fazer quando o app fecha (D-653).

O `lifespan` subia tudo e não desfazia nada: depois do `yield` não havia uma
linha sequer. Fechar o app deixava para trás o que ele mesmo tinha aberto —
tarefas de fundo no meio do caminho, ffmpeg ainda comendo CPU e o banco com
conexões abertas. É a origem do processo órfão que só aparece no Gerenciador de
Tarefas dias depois, segurando arquivo e disputando a máquina.

A ordem aqui é a de um turno que acaba: avisa quem está trabalhando (cancela as
tarefas), encerra as máquinas (mata os processos filhos) e só então apaga a luz
(fecha o banco).
"""

from __future__ import annotations

import asyncio
import logging

from app.infrastructure import processos_em_voo

logger = logging.getLogger(__name__)

# Tempo para as tarefas de fundo perceberem o cancelamento e saírem. Curto de
# propósito: quem fecha o app quer o app fechado, não uma espera misteriosa.
_ESPERA_PELAS_TAREFAS_SEG = 5.0


async def encerrar_com_calma(*, espera_seg: float = _ESPERA_PELAS_TAREFAS_SEG) -> dict:
    """Desfaz o que o boot fez. Devolve o que foi encerrado (para log e teste)."""
    tarefas = _cancelar_tarefas_de_fundo()
    if tarefas:
        await _esperar_terminarem(tarefas, espera_seg)

    processos = _matar_processos_filhos()
    await _fechar_o_banco()

    if tarefas or processos:
        logger.info(
            "[Encerramento] %d tarefa(s) e %d processo(s) encerrados.", len(tarefas), processos
        )
    return {"tarefas_canceladas": len(tarefas), "processos_encerrados": processos}


def _cancelar_tarefas_de_fundo() -> list[asyncio.Task]:
    from app.services.tasks import _background_tasks

    pendentes = [t for t in list(_background_tasks) if not t.done()]
    for tarefa in pendentes:
        tarefa.cancel()
    return pendentes


async def _esperar_terminarem(tarefas: list[asyncio.Task], espera_seg: float) -> None:
    """Espera as tarefas saírem, mas NUNCA fica presa por causa delas.

    `asyncio.wait` (e não `wait_for` + `gather`) é o ponto: no timeout, o
    `wait_for` cancela o gather e AGUARDA esse cancelamento terminar — com uma
    tarefa que engole cancelamento, o fechamento nunca voltava. O `wait` devolve
    as pendentes e segue a vida, que é o comportamento certo aqui.
    """
    _, pendentes = await asyncio.wait(tarefas, timeout=espera_seg)
    if pendentes:
        logger.warning(
            "[Encerramento] %.1fs e %d tarefa(s) não saíram; seguindo.", espera_seg, len(pendentes)
        )


def _matar_processos_filhos() -> int:
    """Mata o ffmpeg (e afins) que ESTE processo lançou — por PID, nunca por nome."""
    encerrados = 0
    for owner in processos_em_voo.donos_em_voo():
        encerrados += processos_em_voo.matar_owner(owner)
    return encerrados


async def _fechar_o_banco() -> None:
    from app.database import engine

    try:
        await engine.dispose()
    except Exception as erro:  # noqa: BLE001 — fechar não pode impedir o fechamento
        logger.warning("[Encerramento] falha ao fechar o banco: %s", erro)
