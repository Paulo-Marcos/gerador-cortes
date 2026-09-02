"""Abrir uma pasta no explorador de arquivos do sistema (D-503).

Extraído de `routers/cortes.abrir_pasta`, que tinha a mesma lógica embutida numa
rota. A publicação manual precisa da MESMA coisa — abrir a pasta do pacote — e
copiar o `try/except` por sistema operacional para o segundo lugar seria manter
duas versões de uma decisão que não tem por que variar.

Este app roda LOCAL, na máquina do operador. É isso que torna a operação
possível: um backend remoto não teria explorador nenhum para abrir.
"""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

_TIMEOUT_SEG = 5


class NaoConsegueAbrir(RuntimeError):
    """O sistema recusou abrir a pasta — sem explorador, headless, ou sem permissão."""


def abrir_pasta(caminho: Path) -> str:
    """Abre `caminho` no explorador e devolve o caminho absoluto.

    Cria a pasta se ela não existe: pedir para abrir algo que o app acabou de
    prometer produzir e receber "não existe" seria pior que uma pasta vazia.

    Levanta `NaoConsegueAbrir` quando o sistema recusa. Não é falha fatal do
    fluxo — o pacote já está em disco, e o caminho volta na resposta para o
    operador abrir à mão.
    """
    caminho.mkdir(parents=True, exist_ok=True)
    absoluto = str(caminho.absolute())

    try:
        if os.name == "nt":
            os.startfile(absoluto)  # noqa: S606 — caminho do proprio app, nao entrada do usuario
        elif os.uname().sysname == "Darwin":
            subprocess.run(["open", absoluto], check=False, timeout=_TIMEOUT_SEG)
        else:
            subprocess.run(["xdg-open", absoluto], check=False, timeout=_TIMEOUT_SEG)
    except Exception as exc:  # noqa: BLE001 — qualquer recusa do SO cai aqui
        logger.warning("[Sistema] nao consegui abrir %s: %s", absoluto, exc)
        raise NaoConsegueAbrir(str(exc)) from exc

    return absoluto
