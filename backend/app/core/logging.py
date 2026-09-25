"""Controle centralizado de logging operacional."""

from __future__ import annotations

import atexit
import builtins
import logging
import queue
import threading
import time
from collections.abc import Callable
from typing import Any

from app.domain.compartilhado.time_convert import epoch_to_hora_local, seg_to_duracao_humana

# O uvicorn passa (cliente, metodo, caminho, versao, status) no registro de acesso.
_CAMPOS_DO_LOG_DE_ACESSO = 5

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


# Os níveis como texto. O `LogLevel` das configurações é `StrEnum` e compara
# igual ao texto, então este módulo decide sem importar as configurações — que
# moram numa camada acima (ADR-0015 §3). Sempre `==` ou tupla: assim a decisão
# não depende de como o Enum calcula hash.
NIVEL_DESLIGADO = "disabled"
NIVEL_INFORMATIVO = "info"
NIVEL_DEPURACAO = "debug"


def _nivel_padrao() -> str:
    return NIVEL_DESLIGADO


_fonte_do_nivel: Callable[[], str] = _nivel_padrao


def definir_fonte_do_nivel(fonte: Callable[[], str]) -> None:
    """Registra quem sabe o nível configurado — hoje, as configurações da app.

    Sem registro vale o desligado, o mesmo padrão das configurações.
    """
    global _fonte_do_nivel
    _fonte_do_nivel = fonte


def current_log_level() -> str:
    return _fonte_do_nivel()


def is_debug_enabled() -> bool:
    return current_log_level() == NIVEL_DEPURACAO


def is_info_enabled() -> bool:
    return current_log_level() in (NIVEL_INFORMATIVO, NIVEL_DEPURACAO)


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


# Escrita de log em thread separada.
#
# `print` com o stdout num PIPE bloqueia quando o pipe enche (4KB no Windows) e
# quem le nao drena. Como `operational_info` e chamado de dentro do event loop
# do asyncio, esse bloqueio congelava o servidor INTEIRO: uma rajada de log da
# geracao de IA prendia o backend por ~40s e o editor so respondia quando a IA
# terminava. O `dev.ps1` foi corrigido para drenar em laco, mas o backend nao
# pode depender da velocidade de quem le a saida dele — qualquer consumidor
# lento (console minimizado, terminal fechado, redirecionamento para um disco
# ocupado) traria o congelamento de volta.
#
# A fila e LIMITADA e DESCARTA quando enche: perder linha de log operacional e
# barato; congelar o servidor nao e. O descarte e contabilizado e sai no log
# assim que houver espaco, para nunca esconder que houve perda.
_FILA_LOG: queue.Queue[str] = queue.Queue(maxsize=20_000)
_thread_log: threading.Thread | None = None
_descartadas = 0
_lock_descarte = threading.Lock()


def _escrever_direto(linha: str) -> None:
    """Escreve no stdout tolerando console nao-UTF-8.

    Os logs usam emojis (▶ ✅) e acentos. Num console cp1252 `print` levantaria
    UnicodeEncodeError — e um log JAMAIS pode abortar o render.
    """
    try:
        _ORIGINAL_PRINT(linha, flush=True)
    except UnicodeEncodeError:
        _ORIGINAL_PRINT(linha.encode("ascii", errors="replace").decode("ascii"), flush=True)


def _drenar_fila_de_log() -> None:
    """Consome a fila para sempre. Roda numa thread daemon."""
    global _descartadas
    while True:
        linha = _FILA_LOG.get()
        with _lock_descarte:
            perdidas, _descartadas = _descartadas, 0
        if perdidas:
            _escrever_direto(f"[LOG] {perdidas} linha(s) descartada(s): fila cheia.")
        _escrever_direto(linha)


def iniciar_escrita_assincrona_de_log() -> None:
    """Liga a escrita em thread. Idempotente.

    Fica DESLIGADA por padrao: sem ela `_print_seguro` escreve direto, que e o
    comportamento historico e o que os testes esperam (saida sincrona, capturavel
    por capsys). O boot da aplicacao liga via `install_log_controls`.
    """
    global _thread_log
    if _thread_log is not None and _thread_log.is_alive():
        return
    _thread_log = threading.Thread(target=_drenar_fila_de_log, name="app-log-writer", daemon=True)
    _thread_log.start()
    atexit.register(_drenar_restante_do_log)


def _drenar_restante_do_log(timeout: float = 2.0) -> None:
    """Da chance de a fila esvaziar no shutdown — a thread e daemon e morreria
    com o processo, levando as ultimas linhas junto."""
    fim = time.monotonic() + timeout
    while not _FILA_LOG.empty() and time.monotonic() < fim:
        time.sleep(0.01)


def _print_seguro(linha: str) -> None:
    """Emite uma linha de log sem NUNCA bloquear quem chamou.

    Com a escrita assincrona ligada, enfileira e volta na hora. Sem ela (testes,
    scripts), escreve direto — mesmo comportamento de antes.
    """
    global _descartadas
    if _thread_log is None or not _thread_log.is_alive():
        _escrever_direto(linha)
        return
    try:
        _FILA_LOG.put_nowait(linha)
    except queue.Full:
        with _lock_descarte:
            _descartadas += 1


def operational_debug(scope: str, message: str) -> None:
    if is_debug_enabled():
        _print_seguro(f"[{scope}] {message}")


def operational_error(scope: str, message: str) -> None:
    _print_seguro(f"[{scope}] {message}")


class AppLogLevelFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        level = current_log_level()
        if record.levelno >= logging.WARNING:
            return True
        if level == NIVEL_DEPURACAO:
            return True
        if level == NIVEL_INFORMATIVO:
            return record.levelno >= logging.INFO
        return False


_STATUS_DE_FALHA = 400
# GET/HEAD e a tela consultando sozinha (polling); OPTIONS e o preflight do CORS
# que o navegador manda antes de cada acao. Nenhum dos tres e iniciativa do operador.
_METODOS_DE_CONSULTA = frozenset({"GET", "HEAD", "OPTIONS"})


class AccessLogFilter(logging.Filter):
    """No Informativo, o log de acesso HTTP mostra acao e falha — nunca consulta.

    O front faz polling (ex.: fila global de export a cada segundo), e cada GET
    virava uma linha no Informativo, enterrando as etapas reais. POST/PUT/PATCH/
    DELETE nascem de um clique do operador; requisicao que FALHOU conta o que deu
    errado. O resto so no Debug.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        level = current_log_level()
        if level == NIVEL_DEPURACAO:
            return True
        if level != NIVEL_INFORMATIVO:
            return False
        metodo, status = _metodo_e_status_http(record)
        return metodo not in _METODOS_DE_CONSULTA or status >= _STATUS_DE_FALHA


def _metodo_e_status_http(record: logging.LogRecord) -> tuple[str, int]:
    """O uvicorn passa (cliente, metodo, caminho, versao, status) em `args`."""
    args = record.args
    if (
        isinstance(args, tuple)
        and len(args) == _CAMPOS_DO_LOG_DE_ACESSO
        and isinstance(args[4], int)
    ):
        return str(args[1]).upper(), args[4]
    return "GET", 0


class _SaidaOperacional(logging.Handler):
    """Leva os loggers `app.*` ao console pelo mesmo caminho do `operational_info`:
    hora real na frente e escrita que nunca bloqueia o event loop."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            _print_seguro(f"[{epoch_to_hora_local(record.created)}] {self.format(record)}")
        except Exception:  # noqa: BLE001 — log jamais derruba quem logou
            self.handleError(record)


def instalar_saida_dos_loggers_da_app() -> None:
    # Sem handler no logger `app`, o Python usa o `lastResort`, que so passa
    # WARNING: todo `logger.info` de TikTok, Instagram, shorts e lote sumia.
    logger_app = logging.getLogger("app")
    if any(isinstance(item, _SaidaOperacional) for item in logger_app.handlers):
        return
    saida = _SaidaOperacional()
    saida.addFilter(AppLogLevelFilter())
    logger_app.addHandler(saida)
    # Quem decide o que aparece e o filtro (muda em runtime pela tela); o nivel
    # herdado do root cortaria o INFO antes de chegar nele.
    logger_app.setLevel(logging.DEBUG)


def instalar_filtro_de_acesso_http() -> None:
    # `uvicorn.access` nao propaga para o root: precisa do filtro no proprio logger.
    access_logger = logging.getLogger("uvicorn.access")
    if not any(isinstance(item, AccessLogFilter) for item in access_logger.filters):
        access_logger.addFilter(AccessLogFilter())


def install_log_controls() -> None:
    """Aplica filtro dinâmico para logging e prints operacionais."""
    iniciar_escrita_assincrona_de_log()
    instalar_filtro_de_acesso_http()
    instalar_saida_dos_loggers_da_app()
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

        if level == NIVEL_DEPURACAO:
            _ORIGINAL_PRINT(*args, **kwargs)
            return

        if any(marker in text for marker in _ERROR_MARKERS):
            _ORIGINAL_PRINT(*args, **kwargs)
            return

        if (
            level == NIVEL_INFORMATIVO
            and any(marker in text for marker in _INFO_MARKERS)
            and not any(marker in text for marker in _DEBUG_MARKERS)
        ):
            _ORIGINAL_PRINT(*args, **kwargs)

    controlled_print._app_log_controlled = True  # type: ignore[attr-defined]
    builtins.print = controlled_print
