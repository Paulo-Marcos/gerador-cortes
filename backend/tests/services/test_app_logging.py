import logging
import re

import pytest
from app.services import app_logging
from app.services.app_logging import AccessLogFilter, AppLogLevelFilter, operational_info
from app.services.app_settings import AppSettingsService, LogLevel


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


_CLOCK_PREFIX = re.compile(r"^\[\d{2}:\d{2}:\d{2}\] ")


def _record(level: int) -> logging.LogRecord:
    return logging.LogRecord("test", level, __file__, 1, "msg", (), None)


def test_disabled_filters_info_but_keeps_errors(tmp_path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.DISABLED)
    filter_ = AppLogLevelFilter()

    assert filter_.filter(_record(logging.INFO)) is False
    assert filter_.filter(_record(logging.ERROR)) is True


def test_info_keeps_info_and_above(tmp_path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    filter_ = AppLogLevelFilter()

    assert filter_.filter(_record(logging.DEBUG)) is False
    assert filter_.filter(_record(logging.INFO)) is True


def test_debug_keeps_debug(tmp_path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.DEBUG)

    assert AppLogLevelFilter().filter(_record(logging.DEBUG)) is True


# --- log de acesso HTTP do uvicorn ---
#
# O uvicorn registra `uvicorn.access` com handler proprio e propagate=False, entao
# o filtro instalado no root nunca o via: o polling da fila global enchia o
# console em QUALQUER nivel, inclusive Desabilitado.


def _acesso(status: int, metodo: str = "GET") -> logging.LogRecord:
    args = ("127.0.0.1:58493", metodo, "/api/export/fila-global", "1.1", status)
    return logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', args, None
    )


def test_consulta_http_so_aparece_no_debug(tmp_path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    filtro = AccessLogFilter()

    AppSettingsService.update_log_level(LogLevel.INFO)
    assert filtro.filter(_acesso(200, "GET")) is False
    assert filtro.filter(_acesso(200, "OPTIONS")) is False  # preflight do CORS

    AppSettingsService.update_log_level(LogLevel.DEBUG)
    assert filtro.filter(_acesso(200, "GET")) is True


def test_acao_http_aparece_no_informativo(tmp_path):
    """POST/PUT/PATCH/DELETE e iniciativa do operador; GET e a tela consultando."""
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    filtro = AccessLogFilter()

    AppSettingsService.update_log_level(LogLevel.INFO)
    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        assert filtro.filter(_acesso(200, metodo)) is True

    AppSettingsService.update_log_level(LogLevel.DISABLED)
    assert filtro.filter(_acesso(200, "POST")) is False


def test_requisicao_que_falhou_aparece_no_informativo(tmp_path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    filtro = AccessLogFilter()

    AppSettingsService.update_log_level(LogLevel.INFO)
    assert filtro.filter(_acesso(500)) is True
    assert filtro.filter(_acesso(404)) is True

    AppSettingsService.update_log_level(LogLevel.DISABLED)
    assert filtro.filter(_acesso(500)) is False


def test_filtro_de_acesso_vai_no_proprio_logger_do_uvicorn(monkeypatch):
    access_logger = logging.getLogger("uvicorn.access")
    monkeypatch.setattr(access_logger, "filters", [])

    app_logging.instalar_filtro_de_acesso_http()
    app_logging.instalar_filtro_de_acesso_http()  # idempotente

    assert sum(isinstance(f, AccessLogFilter) for f in access_logger.filters) == 1


# --- saida dos loggers `app.*` ---
#
# TikTok, Instagram, shorts e lote logam com `logging.getLogger(__name__)`. Sem
# handler no logger `app`, o Python so deixava passar WARNING: "subindo video.mp4"
# nunca chegava ao console, em nenhum nivel.


@pytest.fixture
def logger_app_isolado(monkeypatch):
    logger_app = logging.getLogger("app")
    nivel_original = logger_app.level
    monkeypatch.setattr(logger_app, "handlers", [])
    yield logger_app
    logger_app.setLevel(nivel_original)  # setLevel limpa o cache de nivel dos filhos


def test_log_de_acao_da_app_aparece_no_informativo(tmp_path, logger_app_isolado, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    app_logging.instalar_saida_dos_loggers_da_app()
    logger = logging.getLogger("app.services.tiktok_studio")

    logger.info("[TikTokStudio] subindo %s", "short.mp4")
    logger.debug("[TikTokStudio] detalhe")

    saida = capsys.readouterr().out
    assert _CLOCK_PREFIX.match(saida), f"sem prefixo de hora: {saida!r}"
    assert "[TikTokStudio] subindo short.mp4" in saida
    assert "detalhe" not in saida


def test_log_da_app_desabilitado_so_mostra_problema(tmp_path, logger_app_isolado, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.DISABLED)
    app_logging.instalar_saida_dos_loggers_da_app()
    logger = logging.getLogger("app.services.tiktok_studio")

    logger.info("[TikTokStudio] subindo short.mp4")
    logger.warning("[TikTokStudio] capa nao entrou")

    saida = capsys.readouterr().out
    assert "subindo" not in saida
    assert "capa nao entrou" in saida


def test_saida_dos_loggers_da_app_e_idempotente(logger_app_isolado):
    app_logging.instalar_saida_dos_loggers_da_app()
    app_logging.instalar_saida_dos_loggers_da_app()

    assert len(logger_app_isolado.handlers) == 1


def test_operational_info_prefixa_hora_real(tmp_path, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)

    operational_info("Render final", "Fase 1/3 iniciada")

    linha = capsys.readouterr().out.strip()
    assert _CLOCK_PREFIX.match(linha), f"sem prefixo de hora: {linha!r}"
    assert "[Render final] Fase 1/3 iniciada" in linha


def test_operational_info_mostra_duracao_humana(tmp_path, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    import time

    operational_info("Render final", "92% - Fase 3", started_at=time.time() - 979)

    linha = capsys.readouterr().out.strip()
    assert "decorrido=16m 19s" in linha


def test_operational_info_silencioso_quando_desabilitado(tmp_path, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.DISABLED)

    operational_info("Render final", "nao deve aparecer")

    assert capsys.readouterr().out == ""


def test_operational_info_nao_propaga_erro_de_encoding(tmp_path, monkeypatch):
    # Console cp1252 não codifica ▶/✅: o log degrada, mas NUNCA derruba o render.
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)

    import app.services.app_logging as al

    chamadas = []

    def print_cp1252(linha, **_):
        chamadas.append(linha)
        linha.encode("cp1252")  # levanta UnicodeEncodeError no ▶/✅ na 1ª vez

    monkeypatch.setattr(al, "_ORIGINAL_PRINT", print_cp1252)

    # Não deve levantar.
    operational_info("Render final", "▶ Fase 1/4 (Grade) iniciada ✅")

    # Tentou o original e caiu no fallback (2 chamadas), sem propagar.
    assert len(chamadas) == 2


# --- escrita assincrona de log ---
#
# `print` com o stdout num pipe BLOQUEIA quando o pipe enche e quem le nao
# drena. Como `operational_info` roda dentro do event loop do asyncio, isso
# congelava o servidor inteiro: uma rajada de log da geracao de IA prendia o
# backend por ~40s e o editor so respondia quando a IA terminava. Medido no
# dev.ps1 antigo: vazao de 8,7 linhas/s e o processo escritor bloqueado.


def test_print_seguro_e_sincrono_enquanto_a_thread_nao_esta_ligada(capsys):
    """Padrao preservado: sem a thread, escreve direto — o que os testes esperam."""
    app_logging._print_seguro("linha direta")
    assert "linha direta" in capsys.readouterr().out


def test_print_seguro_nao_bloqueia_com_consumidor_travado(monkeypatch):
    """A propriedade que importa: com quem le TRAVADO, emitir log volta na hora."""
    import queue
    import threading
    import time

    liberar = threading.Event()

    def escrita_travada(linha):
        liberar.wait(timeout=30)  # simula o pipe cheio

    monkeypatch.setattr(app_logging, "_escrever_direto", escrita_travada)
    monkeypatch.setattr(app_logging, "_FILA_LOG", queue.Queue(maxsize=50))
    monkeypatch.setattr(app_logging, "_thread_log", None)
    app_logging.iniciar_escrita_assincrona_de_log()
    try:
        inicio = time.monotonic()
        for i in range(500):  # 10x a capacidade da fila
            app_logging._print_seguro(f"linha {i}")
        decorrido = time.monotonic() - inicio
    finally:
        liberar.set()

    # Sem a fila, a primeira linha ja travaria por 30s.
    assert decorrido < 1.0, f"emitir log bloqueou por {decorrido:.2f}s"


def test_fila_cheia_descarta_em_vez_de_bloquear(monkeypatch):
    """Perder linha de log e barato; congelar o servidor nao e."""
    import queue
    import threading

    liberar = threading.Event()
    monkeypatch.setattr(app_logging, "_escrever_direto", lambda linha: liberar.wait(timeout=30))
    monkeypatch.setattr(app_logging, "_FILA_LOG", queue.Queue(maxsize=10))
    monkeypatch.setattr(app_logging, "_thread_log", None)
    monkeypatch.setattr(app_logging, "_descartadas", 0)
    app_logging.iniciar_escrita_assincrona_de_log()
    try:
        for i in range(200):
            app_logging._print_seguro(f"linha {i}")
    finally:
        liberar.set()

    assert app_logging._descartadas > 0, "deveria ter descartado ao encher"


def test_iniciar_escrita_assincrona_e_idempotente(monkeypatch):
    monkeypatch.setattr(app_logging, "_thread_log", None)
    app_logging.iniciar_escrita_assincrona_de_log()
    primeira = app_logging._thread_log
    app_logging.iniciar_escrita_assincrona_de_log()
    assert app_logging._thread_log is primeira
