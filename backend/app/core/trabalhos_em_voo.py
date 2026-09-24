"""O registro do que está rodando e pode ser interrompido (D-755).

Estado do processo, como as tarefas ativas: a fila de tarefas anota aqui cada
trabalho cancelável, e a entrada sai sozinha quando a task termina. Parar um
trabalho — avisar o worker, matar os processos pelo PID — é da aplicação
(`services/cancelamento_jobs.TrabalhoEmVoo`, que herda este registro), porque
fala com a infraestrutura; o registro, não.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass


@dataclass(frozen=True)
class EmVoo:
    task: asyncio.Task
    # Dono dos jobs do native worker (normalmente o corte). Vazio quando o
    # trabalho não enfileira nada no worker — aí só a task é cancelada.
    owner: str


class RegistroDeTrabalhos:
    """Os trabalhos em voo, por id da fila global."""

    _registro: dict[str, EmVoo] = {}

    @classmethod
    def registrar(cls, job_id: str, task: asyncio.Task, *, owner: str = "") -> None:
        """Anuncia `task` como cancelável sob o id `job_id` da fila global.

        A entrada sai sozinha quando a task termina — o registro só reflete o
        que ainda está em voo, então `cancelar` nunca mira trabalho morto.
        """
        cls._registro[job_id] = EmVoo(task=task, owner=owner)
        task.add_done_callback(lambda _concluida: cls._registro.pop(job_id, None))

    @classmethod
    def em_voo(cls, job_id: str) -> bool:
        return job_id in cls._registro

    @classmethod
    def ids(cls) -> list[str]:
        return list(cls._registro)

    @classmethod
    def limpar(cls) -> None:
        """Zera o registro (usado em teste)."""
        cls._registro.clear()
