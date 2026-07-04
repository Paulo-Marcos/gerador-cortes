import logging
import re

from app.services.app_logging import AppLogLevelFilter, operational_info
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
