"""Leitura da memória RAM disponível do sistema, sem dependência externa.

D-441: o pool de render usa isto como back-pressure — o segundo slot só
libera com RAM sobrando. Falha de leitura retorna None (o chamador decide;
o pool trata None como "sem veto").
"""

from __future__ import annotations

import ctypes
import sys


def ram_disponivel_mb() -> float | None:
    """Memória física disponível em MB, ou None se não der para medir."""
    try:
        if sys.platform == "win32":
            return _ram_disponivel_windows_mb()
        return _ram_disponivel_linux_mb()
    except Exception:  # noqa: BLE001 — medida opcional: sem leitura, sem limite por RAM
        return None


class _MemoryStatusEx(ctypes.Structure):
    _fields_ = [
        ("dwLength", ctypes.c_ulong),
        ("dwMemoryLoad", ctypes.c_ulong),
        ("ullTotalPhys", ctypes.c_ulonglong),
        ("ullAvailPhys", ctypes.c_ulonglong),
        ("ullTotalPageFile", ctypes.c_ulonglong),
        ("ullAvailPageFile", ctypes.c_ulonglong),
        ("ullTotalVirtual", ctypes.c_ulonglong),
        ("ullAvailVirtual", ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]


def _ram_disponivel_windows_mb() -> float | None:
    status = _MemoryStatusEx()
    status.dwLength = ctypes.sizeof(_MemoryStatusEx)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
        return None
    return status.ullAvailPhys / (1024 * 1024)


def _ram_disponivel_linux_mb() -> float | None:
    with open("/proc/meminfo", encoding="ascii") as f:
        for linha in f:
            if linha.startswith("MemAvailable:"):
                return float(linha.split()[1]) / 1024
    return None
