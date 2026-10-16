"""Os horários do YouTube longo já prometidos a um upload que ainda não terminou (D-934).

O corte só grava `youtube_scheduled_at` quando o upload termina; até lá, a data
mora na fila do lote. Sem este registro, um segundo lote (ou um envio avulso)
aberto enquanto o primeiro ainda sobe partiria do mesmo ponto e repetiria os
horários, furando o teto por bloco e por dia (RN-29).

Em memória, como a própria fila de upload (`ExportService._fila_youtube`): o
processo que sobe é o mesmo que calcula a agenda, e um reinício perde as duas.
Também como ela, não separa canais: trocar de canal com um lote subindo só faz o
outro canal começar depois desses horários — atraso, nunca colisão.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime

from app.domain.publicacao.agendamento import instante_do_youtube

_reservas: dict[str, datetime] = {}


def reservar(corte_id: str, agendado_para: str | None) -> None:
    """Guarda o horário que o lote prometeu a este corte; sem data, nada a guardar."""
    quando = instante_do_youtube(agendado_para) if agendado_para else None
    if quando:
        _reservas[corte_id] = quando


def liberar(corte_id: str) -> None:
    """O upload terminou (ou não vai acontecer): a data, se houver, já está no corte."""
    _reservas.pop(corte_id, None)


@asynccontextmanager
async def reservado(corte_id: str, agendado_para: str | None) -> AsyncIterator[None]:
    """A vaga fica reservada enquanto o upload de UM corte dura, e sai no fim."""
    reservar(corte_id, agendado_para)
    try:
        yield
    finally:
        liberar(corte_id)


def ultima() -> datetime | None:
    """O horário prometido mais tarde, ciente do fuso local, ou `None`."""
    return max(_reservas.values()).astimezone() if _reservas else None
