"""Devolver o foco do Windows que o Chrome do robô roubou ao nascer (D-799).

O Chrome rouba o foco ao nascer, mesmo pedindo para não ativar (medido em
28/09/2026: ele ignora o `SW_SHOWNOACTIVATE`). Nascendo fora da tela, o roubo é
invisível — e por isso pior: o que o operador digita vai para uma janela que
ele não vê.

## Só devolve o que o NOSSO processo roubou

Se no meio do caminho o operador trocou de janela por conta própria, puxá-lo de
volta seria o robô brigando com ele pela tela. Por isso a devolução confere o
dono da janela da frente: só age quando ela é do Chrome que acabamos de abrir.

## Por que o toque de ALT

O Windows só deixa um processo em segundo plano trocar a janela da frente se
houve "entrada recente" do usuário; do contrário o `SetForegroundWindow` só pisca
o botão na barra de tarefas. Um ALT sintético conta como entrada. Ele cai na
janela que está na frente naquele instante — o Chrome recém-nascido, fora da
tela —, e não na do operador.

Fora do Windows, tudo aqui é inofensivo: não há foco a devolver.
"""

from __future__ import annotations

import logging
import sys
import time

logger = logging.getLogger(__name__)

_VK_MENU = 0x12
_KEYEVENTF_KEYUP = 0x0002
_INTERVALO_S = 0.1


def _user32():
    if sys.platform != "win32":
        return None
    import ctypes

    return ctypes.windll.user32  # type: ignore[attr-defined]


def janela_da_frente() -> int:
    """O identificador da janela que tem o foco agora, ou 0 quando não há."""
    user32 = _user32()
    return int(user32.GetForegroundWindow() or 0) if user32 else 0


def _processo_da_janela(janela: int) -> int:
    import ctypes

    pid = ctypes.c_ulong()
    _user32().GetWindowThreadProcessId(janela, ctypes.byref(pid))  # type: ignore[union-attr]
    return int(pid.value)


def _devolver(janela: int) -> bool:
    user32 = _user32()
    if not user32 or not user32.IsWindow(janela):
        return False
    user32.keybd_event(_VK_MENU, 0, 0, 0)
    user32.keybd_event(_VK_MENU, 0, _KEYEVENTF_KEYUP, 0)
    return bool(user32.SetForegroundWindow(janela))


def devolver_se_roubado(antes: int, ladrao: int, espera: float = 3.0) -> bool:
    """Devolve o foco a `antes` se o processo `ladrao` o tomou; diz se devolveu.

    A janela nova aparece um pouco DEPOIS de o processo responder, e devolver
    antes do roubo seria devolver nada — então esperamos o roubo, até `espera`.
    Nunca levanta: não conseguir devolver é um incômodo, não motivo para o
    upload falhar.
    """
    if not _user32() or not antes:
        return False
    try:
        limite = time.monotonic() + espera
        while janela_da_frente() == antes and time.monotonic() < limite:
            time.sleep(_INTERVALO_S)
        frente = janela_da_frente()
        if frente == antes or _processo_da_janela(frente) != ladrao:
            return False
        if _devolver(antes):
            return True
        logger.info("[Foco] nao consegui devolver o foco a janela anterior")
    except Exception as exc:  # noqa: BLE001 — foco nunca derruba o robo
        logger.debug("[Foco] %s", exc)
    return False
