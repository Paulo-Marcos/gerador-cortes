"""Testes da biblioteca versionada de temas (D-174)."""

from __future__ import annotations

import json
from pathlib import Path

from app.domain.canal import theme_library
from app.domain.canal.theme_library import PALETA_CHAVES, TEMA_DEFAULT_ID

_REPO_ROOT = Path(__file__).resolve().parents[3]
_THEME_CONFIG = _REPO_ROOT / "video-renderer" / "theme.config.json"


class TestBibliotecaDeTemas:
    def test_default_e_o_primeiro_e_tem_id_atual(self):
        temas = theme_library.listar_temas()
        assert temas[0].id == TEMA_DEFAULT_ID
        assert theme_library.tema_ou_default(None).id == TEMA_DEFAULT_ID

    def test_todo_tema_cobre_a_paleta_completa(self):
        for tema in theme_library.listar_temas():
            assert set(tema.paleta) == set(PALETA_CHAVES), tema.id
            assert all(tema.paleta[c] for c in PALETA_CHAVES), tema.id

    def test_todo_tema_usa_um_preset_conhecido(self):
        presets_validos = {"atual", "moderna", "cientifica", "minimalista", "tecnica"}
        for tema in theme_library.listar_temas():
            assert tema.fonte_preset in presets_validos, tema.id

    def test_ids_sao_unicos(self):
        ids = [t.id for t in theme_library.listar_temas()]
        assert len(ids) == len(set(ids))

    def test_obter_tema_desconhecido_e_none(self):
        assert theme_library.obter_tema("nao-existe") is None
        assert theme_library.obter_tema("") is None
        assert theme_library.obter_tema(None) is None

    def test_tema_ou_default_cai_no_atual(self):
        assert theme_library.tema_ou_default("nao-existe").id == TEMA_DEFAULT_ID
        assert theme_library.tema_ou_default("ambar-quente").id == "ambar-quente"


class TestParidadeComThemeConfigVersionado:
    """O tema `atual` DEVE reproduzir exatamente o `theme.config.json` versionado —
    é a garantia de que um canal sem tema selecionado renderiza idêntico."""

    def test_theme_config_versionado_tem_todas_as_chaves(self):
        palette = json.loads(_THEME_CONFIG.read_text(encoding="utf-8"))["palette"]
        assert set(palette) == set(PALETA_CHAVES)

    def test_tema_atual_bate_com_o_arquivo_versionado(self):
        palette = json.loads(_THEME_CONFIG.read_text(encoding="utf-8"))["palette"]
        atual = theme_library.tema_ou_default(TEMA_DEFAULT_ID)
        assert atual.paleta == palette
