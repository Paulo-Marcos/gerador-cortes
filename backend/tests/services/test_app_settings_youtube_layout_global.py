"""Tests para o campo `youtube_layout_padrao_global` do AppSettings (F-024 fase 4b).

Garantem:
  - Valor default e "{}" (sem padrao definido).
  - Coercao normaliza None/"" para "{}" e rejeita JSON malformado.
  - JSON valido e preservado byte-a-byte.
  - update_youtube_layout_padrao_global persiste no arquivo + cache.
  - Round-trip via file (escrita + leitura) preserva o campo.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.services.app_settings import (
    AppSettings,
    AppSettingsService,
    _coerce_layout_global,
)


@pytest.fixture(autouse=True)
def _isolated_settings(tmp_path: Path):
    """Cada teste tem seu proprio arquivo de settings + cache zerado."""
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    yield
    AppSettingsService.set_settings_path_for_tests(None)


class TestCoerceLayoutGlobal:
    def test_default_para_none(self) -> None:
        assert _coerce_layout_global(None) == "{}"

    def test_default_para_string_vazia(self) -> None:
        assert _coerce_layout_global("") == "{}"
        assert _coerce_layout_global("   ") == "{}"

    def test_default_para_tipo_errado(self) -> None:
        assert _coerce_layout_global(42) == "{}"
        assert _coerce_layout_global({"x": 1}) == "{}"

    def test_default_para_json_malformado(self) -> None:
        assert _coerce_layout_global("{not json") == "{}"

    def test_preserva_json_valido(self) -> None:
        valid = '{"modo_padrao": "compartilhada", "fundo": "hud-topo"}'
        assert _coerce_layout_global(valid) == valid

    def test_preserva_json_vazio(self) -> None:
        assert _coerce_layout_global("{}") == "{}"


class TestAppSettingsDefault:
    def test_youtube_layout_padrao_global_default(self) -> None:
        settings = AppSettings()
        assert settings.youtube_layout_padrao_global == "{}"

    def test_to_dict_inclui_campo(self) -> None:
        settings = AppSettings()
        assert "youtube_layout_padrao_global" in settings.to_dict()


class TestUpdateYoutubeLayoutPadraoGlobal:
    def test_persiste_e_atualiza_cache(self) -> None:
        layout_json = json.dumps(
            {
                "modo_padrao": "compartilhada",
                "fundo": "topographic",
                "placa": {"nome": "Pat Kua", "papel": "CTO"},
            }
        )

        updated = AppSettingsService.update_youtube_layout_padrao_global(layout_json)

        assert updated.youtube_layout_padrao_global == layout_json
        # Cache: leitura subsequente devolve o mesmo valor
        assert AppSettingsService.get().youtube_layout_padrao_global == layout_json

    def test_round_trip_via_arquivo(self) -> None:
        layout_json = '{"modo_padrao": "full", "fundo": "cosmograph"}'
        AppSettingsService.update_youtube_layout_padrao_global(layout_json)

        # Forca releitura do arquivo (cache esvaziado por set_settings_path).
        AppSettingsService.set_settings_path_for_tests(AppSettingsService.settings_path())
        carregado = AppSettingsService.get()
        assert carregado.youtube_layout_padrao_global == layout_json

    def test_invalido_normaliza_para_vazio(self) -> None:
        updated = AppSettingsService.update_youtube_layout_padrao_global("{not json")
        assert updated.youtube_layout_padrao_global == "{}"

    def test_preserva_outros_campos(self) -> None:
        # `cinematic_iii` esta no allowlist FILTROS_CINEMA — qualquer outro
        # cai no default e quebra a asserção da preservacao.
        AppSettingsService.update_filtro_global_padrao("cinematic_iii")
        layout_json = '{"modo_padrao": "compartilhada"}'
        AppSettingsService.update_youtube_layout_padrao_global(layout_json)

        result = AppSettingsService.get()
        assert result.filtro_global_padrao == "cinematic_iii"
        assert result.youtube_layout_padrao_global == layout_json
