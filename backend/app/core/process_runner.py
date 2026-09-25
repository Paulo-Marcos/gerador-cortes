"""Roda processo externo com timeout, num lugar só (D-750).

Três geradores — capa do TikTok, palco do short, palco do YouTube — repetiam o
mesmo bloco: subir o processo pelo asyncio e, se o event loop for o Selector do
uvicorn no Windows, que não implementa subprocesso (D-369), cair para o caminho
síncrono numa thread. Nenhuma das cópias tinha timeout, e o AGENTS.md exige um em
todo subprocesso: um Chromium travado prendia o render para sempre.

Ao estourar o tempo, o runner mata a ÁRVORE a partir do PID que ele mesmo criou.
O `node` desses geradores sobe um Chromium como filho, e matar só o pai deixaria o
filho rodando. Nunca pelo nome: isso derrubaria processos de outras instâncias,
inclusive a de produção.
"""

from __future__ import annotations

import asyncio
import subprocess
from dataclasses import dataclass
from pathlib import Path

import psutil

# Quanto esperar os processos mortos saírem da tabela antes de seguir.
_ESPERA_DEPOIS_DE_MATAR_S = 5


@dataclass(frozen=True)
class Resultado:
    """O código de saída e a saída do processo, com stdout e stderr juntos."""

    returncode: int
    saida: str


class ProcessoEstourouOTempo(TimeoutError):
    """O processo passou do tempo e foi encerrado, com os filhos."""


async def rodar(argumentos: list[str], *, cwd: Path | str, timeout: float | None) -> Resultado:
    """Roda `argumentos` e devolve o código de saída e a saída combinada.

    Código diferente de zero não levanta: quem chama decide o que ele significa.
    `timeout=None` espera o quanto for — é o comportamento que os geradores tinham
    antes do D-750, e existe para migrá-los sem mudar nada no mesmo passo.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *argumentos,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except NotImplementedError:
        return await asyncio.to_thread(_rodar_sincrono, argumentos, cwd, timeout)

    try:
        saida, _ = await asyncio.wait_for(proc.communicate(), timeout)
    except TimeoutError:
        await asyncio.to_thread(_matar_arvore, proc.pid)
        await proc.wait()
        raise ProcessoEstourouOTempo(_mensagem(argumentos, timeout)) from None
    return Resultado(proc.returncode or 0, saida.decode(errors="replace"))


def _rodar_sincrono(argumentos: list[str], cwd: Path | str, timeout: float | None) -> Resultado:
    """O caminho do event loop Selector. Decodifica como o `subprocess.run(text=True)`
    que as cópias usavam, para a migração não mudar a saída."""
    proc = subprocess.Popen(
        argumentos,
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    )
    try:
        saida, _ = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        _matar_arvore(proc.pid)
        proc.communicate()
        raise ProcessoEstourouOTempo(_mensagem(argumentos, timeout)) from None
    return Resultado(proc.returncode, saida)


def _matar_arvore(pid: int) -> None:
    """Encerra o processo e todos os descendentes, partindo do PID dele."""
    try:
        pai = psutil.Process(pid)
        processos = [*pai.children(recursive=True), pai]
    except psutil.NoSuchProcess:
        return
    for processo in processos:
        try:
            processo.kill()
        except psutil.NoSuchProcess:
            pass
    psutil.wait_procs(processos, timeout=_ESPERA_DEPOIS_DE_MATAR_S)


def _mensagem(argumentos: list[str], timeout: float | None) -> str:
    return f"{Path(argumentos[0]).name} passou de {timeout}s e foi encerrado com os filhos"
