"""Processos pesados que ESTE processo Python disparou, agrupados por dono (D-647).

O cancelamento (D-426) sabia parar duas coisas: a task asyncio e os jobs do
`native_worker.js` (que mata a própria árvore). Faltava a terceira: o ffmpeg que
o backend dispara dentro de si — normalização da pós, proxy de áudio, capas.
Esse não morria. A UI dizia "cancelado", e o ffmpeg seguia comendo CPU até
terminar sozinho, segurando junto a thread que o esperava.

A causa é simples: `asyncio.to_thread` não é cancelável. Cancelar a task levanta
`CancelledError` em quem esperava, e a thread continua parada dentro do
subprocesso. Para matar, é preciso ter o processo na mão — é o que este módulo
guarda.

O dono é o mesmo do `worker_queue` (`ContextVar`, normalmente o `corte_id`):
quem cancela usa um id só e derruba tudo daquele trabalho.
"""

from __future__ import annotations

import asyncio
import logging
import os
import subprocess
import threading
from collections.abc import Callable
from typing import Any, TypeVar

# O taskkill da árvore inteira volta em milissegundos; 15 s é folga para máquina carregada.
_TIMEOUT_DO_TASKKILL_S = 15

logger = logging.getLogger(__name__)

T = TypeVar("T")

# owner → processos vivos. Protegido por lock: o registro acontece nas threads
# do pool (onde o ffmpeg roda) e a morte vem do event loop.
_EM_VOO: dict[str, set[subprocess.Popen]] = {}
_lock = threading.Lock()


def registrar(owner: str, processo: subprocess.Popen) -> None:
    if not owner:
        return
    with _lock:
        _EM_VOO.setdefault(owner, set()).add(processo)


def esquecer(owner: str, processo: subprocess.Popen) -> None:
    if not owner:
        return
    with _lock:
        vivos = _EM_VOO.get(owner)
        if not vivos:
            return
        vivos.discard(processo)
        if not vivos:
            _EM_VOO.pop(owner, None)


def em_voo(owner: str) -> int:
    with _lock:
        return len(_EM_VOO.get(owner, set()))


def matar_arvore(processo: subprocess.Popen) -> None:
    """Mata o processo E seus filhos, pelo PID — NUNCA pelo nome do programa.

    Matar `ffmpeg.exe` por nome derrubaria o render de PROD junto. E matar só o
    pai deixa os netos vivos segurando os pipes: o mesmo aprendizado do CLI da
    Claude (`claude_cli_client._matar_arvore`).
    """
    if processo.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(processo.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
                timeout=_TIMEOUT_DO_TASKKILL_S,
            )
        else:
            processo.kill()
    except (OSError, subprocess.SubprocessError) as erro:
        logger.warning("[ProcessosEmVoo] Falha ao matar PID %s: %s", processo.pid, erro)


def matar_owner(owner: str) -> int:
    """Mata todo processo em voo de `owner`. Devolve quantos foram atingidos."""
    if not owner:
        return 0
    with _lock:
        alvos = list(_EM_VOO.get(owner, set()))
    for processo in alvos:
        matar_arvore(processo)
    if alvos:
        logger.info("[ProcessosEmVoo] %d processo(s) de '%s' encerrados.", len(alvos), owner)
    return len(alvos)


class ProcessoCancelado(RuntimeError):
    """O cancelamento chegou antes de o processo nascer: ele nem foi aberto."""


class ProcessoCancelavel:
    """O subprocesso de uma chamada em thread, ao alcance de quem a cancela (D-1045).

    O registro por dono (acima) não serve à IA: a geração do clique não tem dono, e
    entre a thread começar e o processo ser registrado o cancelamento não acharia nada.
    Aqui o trinco fecha essa corrida: quem cancela primeiro impede o processo de nascer,
    e o processo que nasceu primeiro é encontrado por quem cancela.
    """

    def __init__(self) -> None:
        self._trinco = threading.Lock()
        self._processo: subprocess.Popen | None = None
        self._cancelado = False

    def abrir(self, *args: Any, **kwargs: Any) -> subprocess.Popen:
        with self._trinco:
            if self._cancelado:
                raise ProcessoCancelado("Cancelado antes de abrir o processo.")
            self._processo = subprocess.Popen(*args, **kwargs)  # noqa: S603 — argv do chamador
            return self._processo

    def cancelar(self) -> None:
        with self._trinco:
            self._cancelado = True
            processo = self._processo
        if processo is not None:
            matar_arvore(processo)


async def em_thread_cancelavel(funcao: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """`asyncio.to_thread` que, cancelado, derruba o processo aberto pela função.

    Cancelar a task só solta quem esperava; a thread segue no subprocesso. Por isso a
    morte fica aqui, no ponto por onde todo cancelamento passa, e não em quem cancela: a
    fila global, o encerramento do app e um `gather` chegam todos ao mesmo lugar. A função
    recebe o `cancelavel` por nome. O que ela levantar depois disso ninguém mais lê.
    """
    cancelavel = ProcessoCancelavel()
    try:
        return await asyncio.to_thread(funcao, *args, cancelavel=cancelavel, **kwargs)
    except asyncio.CancelledError:
        cancelavel.cancelar()
        raise


def donos_em_voo() -> list[str]:
    """Quem tem processo vivo agora (D-653: o encerramento varre todos)."""
    with _lock:
        return list(_EM_VOO)


def limpar() -> None:
    """Zera o registro (uso em teste)."""
    with _lock:
        _EM_VOO.clear()
