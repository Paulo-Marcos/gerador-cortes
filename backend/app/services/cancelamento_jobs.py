"""Cancelamento de trabalho pesado já enfileirado (D-426).

Até aqui, uma vez disparado, um render/ingestão/geração só parava derrubando a
aplicação inteira. Este módulo dá o botão de parada.

Duas frentes, ambas necessárias:

1. **A task asyncio** que orquestra o trabalho — `TrabalhoEmVoo` a indexa pelo
   MESMO id que a fila global publica (`{tipo}:{ref}`), então a UI cancela com
   o id que já tem em mãos.
2. **Os processos do native worker** que essa task disparou (ffmpeg, Chromium
   do Remotion). Sem matá-los, cancelar a task só solta o orquestrador: o
   trabalho pesado continuaria consumindo a máquina até terminar sozinho.

Nem todo tipo é cancelável. Upload do YouTube fica de fora de propósito:
abortar no meio do envio deixa vídeo parcial na conta, e o SDK do Google não
oferece retomada limpa — é preferível deixar terminar.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from app.infrastructure.worker_queue import cancelar_owner

logger = logging.getLogger(__name__)

# Tipos da fila global que este módulo não sabe (ou não deve) interromper.
TIPOS_NAO_CANCELAVEIS: frozenset[str] = frozenset({"youtube"})


class CancelamentoNaoSuportado(RuntimeError):
    """O tipo de job não admite cancelamento (ver `TIPOS_NAO_CANCELAVEIS`)."""


class JobNaoEstaEmVoo(RuntimeError):
    """O job já terminou, nunca começou, ou não foi registrado como cancelável."""


@dataclass(frozen=True)
class _EmVoo:
    task: asyncio.Task
    # Dono dos jobs do native worker (normalmente o corte). Vazio quando o
    # trabalho não enfileira nada no worker — aí só a task é cancelada.
    owner: str


class TrabalhoEmVoo:
    """Registro do que está rodando e pode ser interrompido."""

    _registro: dict[str, _EmVoo] = {}

    @classmethod
    def registrar(cls, job_id: str, task: asyncio.Task, *, owner: str = "") -> None:
        """Anuncia `task` como cancelável sob o id `job_id` da fila global.

        A entrada sai sozinha quando a task termina — o registro só reflete o
        que ainda está em voo, então `cancelar` nunca mira trabalho morto.
        """
        cls._registro[job_id] = _EmVoo(task=task, owner=owner)
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

    @classmethod
    def cancelar(cls, job_id: str) -> int:
        """Interrompe o job. Devolve quantos jobs do worker foram avisados.

        Mata o worker ANTES de cancelar a task: ao contrário, o `CancelledError`
        solta quem esperava a resposta e o sentinela de cancelamento nunca
        chegaria a ser escrito — o ffmpeg seguiria rodando órfão.
        """
        registro = cls._registro.get(job_id)
        if registro is None:
            raise JobNaoEstaEmVoo(f"Job '{job_id}' não está em execução")

        avisados = cancelar_owner(registro.owner) if registro.owner else 0
        registro.task.cancel()
        logger.info(
            "[Cancelamento] Job '%s' cancelado (%d job(s) do worker avisados).",
            job_id,
            avisados,
        )
        return avisados


def cancelar_job(job_id: str) -> dict:
    """Cancela um job publicado na fila global e descreve o desfecho.

    `job_id` é o id da fila (`render:<corte>`, `bruto:<corte>`, `pos:<corte>`,
    `task:<nome>`). Levanta `CancelamentoNaoSuportado` para tipos que não
    admitem parada e `JobNaoEstaEmVoo` quando não há o que cancelar.
    """
    tipo, _, referencia = job_id.partition(":")

    if tipo in TIPOS_NAO_CANCELAVEIS:
        raise CancelamentoNaoSuportado(
            f"Job do tipo '{tipo}' não pode ser cancelado — deixe terminar."
        )

    if tipo == "pos":
        return _cancelar_item_da_pos(referencia)

    avisados = TrabalhoEmVoo.cancelar(job_id)
    return {"job_id": job_id, "cancelado": True, "jobs_worker_avisados": avisados}


def _cancelar_item_da_pos(corte_id: str) -> dict:
    """Cancela um corte da fila de pós-produção em lote.

    A fila roda com concorrência 1: o item pode estar esperando a vez (basta
    marcá-lo, que a vez é pulada) ou já processando (aí é preciso matar os
    jobs do worker daquele corte).
    """
    from app.services.export import ExportService

    if not ExportService.cancelar_item_processamento(corte_id):
        raise JobNaoEstaEmVoo(f"Corte '{corte_id}' não está na fila de pós-produção")

    avisados = cancelar_owner(corte_id)
    return {"job_id": f"pos:{corte_id}", "cancelado": True, "jobs_worker_avisados": avisados}
