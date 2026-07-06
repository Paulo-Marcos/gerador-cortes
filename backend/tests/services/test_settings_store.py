"""Testes do backend de settings no banco (D-191).

Cobrem o `settings_store` (round-trip de app settings e identidade, merge raso,
listagem) e a disciplina DB-first + fallback/migração do `AppSettingsService`:
sem linha no banco, lê o arquivo legado e SEMEIA o banco; depois passa a ler do
banco mesmo que o arquivo suma.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.services import settings_store
from app.services.app_settings import AppSettingsService, LogLevel, RenderSettings


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


# --------------------------------------------------------------------------- #
# settings_store
# --------------------------------------------------------------------------- #


def test_app_settings_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    valores = {
        "log_level": "debug",
        "filtro_global_padrao": "cinematic_iii",
        "youtube_layout_padrao_global": '{"modo_padrao":"full"}',
        "render_cooldown_sec": 5,
        "render_overlay_concurrency": 2,
        "render_bundle_cache_enabled": 0,
        "render_overlay_codec": "vp9",
        "render_overlay_max_attempts": 4,
        "render_grade_global_quality": 27,
    }
    settings_store.gravar_app_settings(db, "canal-a", valores)

    assert settings_store.ler_app_settings(db, "canal-a") == valores
    # Canal sem linha → None (sinaliza fallback ao arquivo legado).
    assert settings_store.ler_app_settings(db, "outro") is None


def test_app_settings_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    base = {
        "log_level": "info",
        "filtro_global_padrao": "bypass_dourado_aberto",
        "youtube_layout_padrao_global": "{}",
        "render_cooldown_sec": 0,
        "render_overlay_concurrency": 4,
        "render_bundle_cache_enabled": 1,
        "render_overlay_codec": "prores_4444",
        "render_overlay_max_attempts": 3,
        "render_grade_global_quality": 30,
    }
    settings_store.gravar_app_settings(db, "c", base)
    settings_store.gravar_app_settings(db, "c", {**base, "log_level": "debug"})

    assert settings_store.ler_app_settings(db, "c")["log_level"] == "debug"


def test_identidade_merge_preserva_campos(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_identidade(
        db, "canal-a", {"handle": "@meu", "nome": "Meu Canal", "credito": "@meu"}
    )
    # Merge raso: só altera o handle; nome/credito preservados.
    settings_store.gravar_identidade(db, "canal-a", {"handle": "@novo"})

    linha = settings_store.ler_identidade(db, "canal-a")
    assert linha["handle"] == "@novo"
    assert linha["nome"] == "Meu Canal"
    assert linha["credito"] == "@meu"


def test_listar_identidades_indexa_por_canal(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_identidade(db, "a", {"handle": "@a"})
    settings_store.gravar_identidade(db, "b", {"handle": "@b"})

    todas = settings_store.listar_identidades(db)
    assert set(todas) == {"a", "b"}
    assert todas["a"]["handle"] == "@a"


def test_mascote_round_trip(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_mascote(db, "canal-a", {"nome": "Sapo"})

    assert settings_store.ler_mascote(db, "canal-a") == {"nome": "Sapo"}
    # Canal sem linha → None (sinaliza fallback ao mascote.yaml legado).
    assert settings_store.ler_mascote(db, "outro") is None


def test_mascote_upsert_sobrescreve(tmp_path: Path):
    db = tmp_path / "settings.db"
    settings_store.gravar_mascote(db, "c", {"nome": "Antigo"})
    settings_store.gravar_mascote(db, "c", {"nome": "Novo"})

    assert settings_store.ler_mascote(db, "c") == {"nome": "Novo"}


# --------------------------------------------------------------------------- #
# AppSettingsService: DB-first + fallback/migração do arquivo legado
# --------------------------------------------------------------------------- #


def test_migra_arquivo_legado_para_o_banco(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text(
        json.dumps({"log_level": "debug", "render": {"overlay_max_attempts": 5}}),
        encoding="utf-8",
    )
    AppSettingsService.set_settings_path_for_tests(settings_path)

    # Primeira leitura: sem linha no banco → lê o arquivo e SEMEIA o banco.
    app = AppSettingsService.get()
    assert app.log_level == LogLevel.DEBUG
    assert app.render.overlay_max_attempts == 5

    db = tmp_path / "settings.db"
    linha = settings_store.ler_app_settings(db, "default")
    assert linha is not None
    assert linha["log_level"] == "debug"
    assert linha["render_overlay_max_attempts"] == 5


def test_banco_e_fonte_da_verdade_apos_semear(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    settings_path.write_text(json.dumps({"log_level": "info"}), encoding="utf-8")
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.get()  # semeia o banco a partir do arquivo
    settings_path.unlink()  # arquivo some — o banco deve bastar

    AppSettingsService.set_settings_path_for_tests(settings_path)  # zera cache, mesmo db
    assert AppSettingsService.get().log_level == LogLevel.INFO


def test_update_grava_no_banco_e_no_espelho(tmp_path: Path):
    settings_path = tmp_path / "app_settings.json"
    AppSettingsService.set_settings_path_for_tests(settings_path)

    AppSettingsService.update_render(RenderSettings(cooldown_sec=9))

    # Espelho (arquivo) atualizado.
    espelho = json.loads(settings_path.read_text(encoding="utf-8"))
    assert espelho["render"]["cooldown_sec"] == 9
    # Banco (fonte da verdade) atualizado.
    linha = settings_store.ler_app_settings(tmp_path / "settings.db", "default")
    assert linha["render_cooldown_sec"] == 9


def test_update_log_level_preserva_youtube_layout(tmp_path: Path):
    """Regressão: o update legado esquecia o youtube_layout ao mudar o log level."""
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")

    AppSettingsService.update_youtube_layout_padrao_global('{"modo_padrao":"full"}')
    AppSettingsService.update_log_level(LogLevel.DEBUG)

    assert AppSettingsService.get().youtube_layout_padrao_global == '{"modo_padrao":"full"}'
