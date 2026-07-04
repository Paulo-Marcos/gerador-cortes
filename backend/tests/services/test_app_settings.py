import json
from pathlib import Path

import pytest
from app.domain.overlay_codec import OverlayCodec
from app.services.app_settings import (
    AppSettings,
    AppSettingsService,
    LogLevel,
    RenderSettings,
)


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


# ─────────────────────────────────────────────────────────────
# Log level
# ─────────────────────────────────────────────────────────────


def test_default_log_level_is_disabled(tmp_path: Path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")

    assert AppSettingsService.get().log_level == LogLevel.DISABLED


def test_update_log_level_persists_to_json(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.update_log_level(LogLevel.DEBUG)

    data = json.loads(settings_path.read_text(encoding="utf-8"))
    assert data["log_level"] == "debug"


def test_invalid_json_falls_back_to_disabled(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text("{invalid", encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().log_level == LogLevel.DISABLED


def test_update_log_level_preserva_render_settings(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    custom = RenderSettings(cooldown_sec=7, overlay_concurrency=6, bundle_cache_enabled=False)
    AppSettingsService.update_render(custom)
    AppSettingsService.update_log_level(LogLevel.INFO)

    reloaded = AppSettings(
        log_level=AppSettingsService.get().log_level,
        render=AppSettingsService.get().render,
    )
    assert reloaded.log_level == LogLevel.INFO
    assert reloaded.render == custom


# ─────────────────────────────────────────────────────────────
# Render settings
# ─────────────────────────────────────────────────────────────


def test_default_render_settings_quando_arquivo_inexistente(tmp_path: Path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")

    render = AppSettingsService.get().render
    assert render.cooldown_sec == 0
    assert render.overlay_concurrency == 4
    assert render.bundle_cache_enabled is True
    assert render.overlay_codec == OverlayCodec.PRORES_4444
    assert render.overlay_max_attempts == 3
    assert render.grade_global_quality == 30


def test_update_render_persiste_no_json(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.update_render(
        RenderSettings(
            cooldown_sec=15,
            overlay_concurrency=2,
            bundle_cache_enabled=False,
            overlay_codec=OverlayCodec.PRORES_4444,
            overlay_max_attempts=5,
            grade_global_quality=27,
        )
    )

    data = json.loads(settings_path.read_text(encoding="utf-8"))
    assert data["render"] == {
        "cooldown_sec": 15,
        "overlay_concurrency": 2,
        "bundle_cache_enabled": False,
        "overlay_codec": "prores_4444",
        "overlay_max_attempts": 5,
        "grade_global_quality": 27,
    }


@pytest.mark.parametrize("valor_invalido", [0, -1, "x", None])
def test_overlay_max_attempts_invalido_cai_no_default(tmp_path: Path, valor_invalido):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_max_attempts": valor_invalido}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_max_attempts == 3


@pytest.mark.parametrize("valor", [1, 2, 5, 10])
def test_overlay_max_attempts_aceita_inteiros_positivos(tmp_path: Path, valor):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_max_attempts": valor}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_max_attempts == valor


@pytest.mark.parametrize("valor", [1, 18, 27, 30, 33, 51])
def test_grade_global_quality_aceita_faixa_qsv(tmp_path: Path, valor):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"grade_global_quality": valor}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.grade_global_quality == valor


@pytest.mark.parametrize("valor_invalido", [0, 52, 100, -5, "x", None])
def test_grade_global_quality_fora_da_faixa_cai_no_default(tmp_path: Path, valor_invalido):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"grade_global_quality": valor_invalido}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.grade_global_quality == 30


def test_overlay_codec_aceita_vp9_string(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_codec": "vp9"}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_codec == OverlayCodec.VP9


def test_overlay_codec_aceita_prores_string(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_codec": "prores_4444"}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_codec == OverlayCodec.PRORES_4444


@pytest.mark.parametrize("valor_invalido", ["av1", "x264", None, 0])
def test_overlay_codec_invalido_cai_no_default_prores(tmp_path: Path, valor_invalido):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_codec": valor_invalido}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_codec == OverlayCodec.PRORES_4444


def test_update_render_preserva_log_level(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.update_log_level(LogLevel.DEBUG)
    AppSettingsService.update_render(RenderSettings(cooldown_sec=3))

    assert AppSettingsService.get().log_level == LogLevel.DEBUG
    assert AppSettingsService.get().render.cooldown_sec == 3


def test_log_level_legado_sem_chave_render_recebe_defaults(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    app = AppSettingsService.get()
    assert app.log_level == LogLevel.INFO
    assert app.render == RenderSettings()


@pytest.mark.parametrize("valor_invalido", [-3, "x", None])
def test_cooldown_invalido_cai_no_default(tmp_path: Path, valor_invalido):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"cooldown_sec": valor_invalido}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.cooldown_sec == 0


@pytest.mark.parametrize("valor_invalido", [0, -2, "y", None])
def test_overlay_concurrency_invalido_cai_no_default(tmp_path: Path, valor_invalido):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"overlay_concurrency": valor_invalido}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.overlay_concurrency == 4


@pytest.mark.parametrize("valor", [0, 1, 12])
def test_cooldown_aceita_inteiros_nao_negativos(tmp_path: Path, valor):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"cooldown_sec": valor}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.cooldown_sec == valor


def test_bundle_cache_pode_ser_desativado(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    payload = {"render": {"bundle_cache_enabled": False}}
    settings_path.write_text(json.dumps(payload), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    assert AppSettingsService.get().render.bundle_cache_enabled is False


def test_render_settings_imutavel():
    render = RenderSettings()
    with pytest.raises(Exception):
        render.cooldown_sec = 99  # type: ignore[misc]
