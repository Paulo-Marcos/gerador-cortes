"""Controle centralizado de logging operacional."""

from __future__ import annotations

import builtins
import logging
import time
from collections.abc import Callable
from typing import Any

from app.domain.time_convert import epoch_to_hora_local, seg_to_duracao_humana
from app.services.app_settings import AppSettingsService, LogLevel

_ORIGINAL_PRINT: Callable[..., None] = builtins.print
_ERROR_MARKERS = (
    "erro",
    "error",
    "falha",
    "failed",
    "fatal",
    "critical",
    "exception",
    "excecao",
    "exceção",
    "timeout",
)
_DEBUG_MARKERS = (
    "[debug]",
    "debug",
    "cmd:",
    "comando",
    "payload",
    "props",
    "ffprobe",
    "stderr",
    "stdout",
)
_INFO_MARKERS = (
    "iniciando",
    "iniciado",
    "fase",
    "etapa",
    "conclu",
    "finalizando",
    "processando",
    "enfileir",
    "aguardando",
    "pulando",
    "pular",
    "tempo",
    "modo continuar",
)


def current_log_level() -> LogLevel:
    return AppSettingsService.get().log_level


def is_debug_enabled() -> bool:
    return current_log_level() == LogLevel.DEBUG


def is_info_enabled() -> bool:
    return current_log_level() in {LogLevel.INFO, LogLevel.DEBUG}


def operational_info(scope: str, message: str, *, started_at: float | None = None) -> None:
    if not is_info_enabled():
        return

    agora = time.time()
    elapsed = ""
    if started_at is not None:
        elapsed = f" | decorrido={seg_to_duracao_humana(agora - started_at)}"
    # Prefixo com a HORA REAL de relogio (HH:MM:SS) em cada linha, para o
    # usuario saber a que horas cada etapa aconteceu — nao so quanto durou.
    _print_seguro(f"[{epoch_to_hora_local(agora)}] [{scope}] {message}{elapsed}")


def _print_seguro(linha: str) -> None:
    """Imprime sem nunca derrubar quem chamou por causa de encoding.

    Os logs usam emojis (▶ ✅) e acentos. Num console nao-UTF-8 (ex.: cmd.exe
    em cp1252) `print` levantaria UnicodeEncodeError — e um log JAMAIS pode
    abortar o render. Em caso de erro, degrada para a codificacao do console
    com `errors='replace'`.
    """
    try:
        _ORIGINAL_PRINT(linha, flush=True)
    except UnicodeEncodeError:
        # Console nao-UTF-8 (cp1252/ascii): degrada para ASCII em vez de
        # abortar o render. Emojis/acentos nao codificaveis viram '?'.
        _ORIGINAL_PRINT(linha.encode("ascii", errors="replace").decode("ascii"), flush=True)


def operational_debug(scope: str, message: str) -> None:
    if is_debug_enabled():
        _ORIGINAL_PRINT(f"[{scope}] {message}", flush=True)


def operational_error(scope: str, message: str) -> None:
    _ORIGINAL_PRINT(f"[{scope}] {message}", flush=True)


class AppLogLevelFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        level = current_log_level()
        if record.levelno >= logging.WARNING:
            return True
        if level == LogLevel.DEBUG:
            return True
        if level == LogLevel.INFO:
            return record.levelno >= logging.INFO
        return False


def install_log_controls() -> None:
    """Aplica filtro dinâmico para logging e prints operacionais."""
    root_logger = logging.getLogger()
    if not any(isinstance(item, AppLogLevelFilter) for item in root_logger.filters):
        root_logger.addFilter(AppLogLevelFilter())
    for handler in root_logger.handlers:
        if not any(isinstance(item, AppLogLevelFilter) for item in handler.filters):
            handler.addFilter(AppLogLevelFilter())
    root_logger.setLevel(logging.DEBUG)

    if getattr(builtins.print, "_app_log_controlled", False):
        return

    def controlled_print(*args: Any, **kwargs: Any) -> None:
        text = " ".join(str(arg) for arg in args).lower()
        level = current_log_level()

        if level == LogLevel.DEBUG:
            _ORIGINAL_PRINT(*args, **kwargs)
            return

        if any(marker in text for marker in _ERROR_MARKERS):
            _ORIGINAL_PRINT(*args, **kwargs)
            return

        if (
            level == LogLevel.INFO
            and any(marker in text for marker in _INFO_MARKERS)
            and not any(marker in text for marker in _DEBUG_MARKERS)
        ):
            _ORIGINAL_PRINT(*args, **kwargs)

    controlled_print._app_log_controlled = True  # type: ignore[attr-defined]
    builtins.print = controlled_print
