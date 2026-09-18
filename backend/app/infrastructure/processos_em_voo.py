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

import logging
import os
import subprocess
import threading

logger = logging.getLogger(__name__)

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
                timeout=15,
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


def donos_em_voo() -> list[str]:
    """Quem tem processo vivo agora (D-653: o encerramento varre todos)."""
    with _lock:
        return list(_EM_VOO)


def limpar() -> None:
    """Zera o registro (uso em teste)."""
    with _lock:
        _EM_VOO.clear()
