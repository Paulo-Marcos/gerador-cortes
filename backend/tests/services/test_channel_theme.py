"""Testes da seleção e materialização de tema por canal (D-174)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.domain.canal import theme_library
from app.domain.canal.theme_library import PALETA_CHAVES
from app.infrastructure import settings_store
from app.services import channel_theme


@pytest.fixture
def db(tmp_path: Path) -> Path:
    return tmp_path / "settings.db"


@pytest.fixture
def renderer_theme(tmp_path: Path) -> Path:
    return tmp_path / "renderer" / "theme.config.json"


class TestSelecaoDeTema:
    def test_sem_selecao_cai_no_default(self, db: Path):
        assert channel_theme.tema_selecionado_id(db_path=db, channel_id="c1") is None
        assert channel_theme.tema_do_canal(db_path=db, channel_id="c1").id == "atual"

    def test_preset_padrao_e_o_do_tema_selecionado(self, db: Path):
        settings_store.gravar_tema(db, "c1", "ambar-quente")
        preset = channel_theme.preset_padrao_do_canal(db_path=db, channel_id="c1")
        assert preset == theme_library.obter_tema("ambar-quente").fonte_preset

    def test_preset_padrao_default_e_atual_sem_selecao(self, db: Path):
        assert channel_theme.preset_padrao_do_canal(db_path=db, channel_id="c1") == "atual"

    def test_selecionar_invalido_levanta(self, db: Path, renderer_theme: Path):
        with pytest.raises(channel_theme.TemaInvalido):
            channel_theme.selecionar_tema(
                "nao-existe", db_path=db, channel_id="c1", renderer_theme=renderer_theme
            )

    def test_selecionar_grava_a_escolha(self, db: Path, renderer_theme: Path):
        # channel_id != canal ativo real → não materializa o renderer real (guard).
        tema = channel_theme.selecionar_tema(
            "editorial-escuro", db_path=db, channel_id="c1", renderer_theme=renderer_theme
        )
        assert tema.id == "editorial-escuro"
        assert channel_theme.tema_selecionado_id(db_path=db, channel_id="c1") == "editorial-escuro"


class TestMaterializacao:
    def test_no_op_sem_selecao(self, db: Path, renderer_theme: Path):
        escrito = channel_theme.materializar_tema_do_canal(
            db_path=db, channel_id="c1", renderer_theme=renderer_theme
        )
        assert escrito is None
        assert not renderer_theme.exists()

    def test_escreve_paleta_completa_quando_selecionado(self, db: Path, renderer_theme: Path):
        settings_store.gravar_tema(db, "c1", "editorial-escuro")
        escrito = channel_theme.materializar_tema_do_canal(
            db_path=db, channel_id="c1", renderer_theme=renderer_theme
        )
        assert escrito == renderer_theme
        palette = json.loads(renderer_theme.read_text(encoding="utf-8"))["palette"]
        assert set(palette) == set(PALETA_CHAVES)
        assert palette == theme_library.obter_tema("editorial-escuro").paleta

    def test_temas_distintos_geram_config_distinta(self, db: Path, renderer_theme: Path):
        """Base da invalidação de cache: trocar o tema muda o conteúdo do
        theme.config.json (que está no fingerprint do bundle Remotion)."""
        settings_store.gravar_tema(db, "c1", "atual")
        channel_theme.materializar_tema_do_canal(
            db_path=db, channel_id="c1", renderer_theme=renderer_theme
        )
        conteudo_atual = renderer_theme.read_text(encoding="utf-8")

        settings_store.gravar_tema(db, "c1", "ambar-quente")
        channel_theme.materializar_tema_do_canal(
            db_path=db, channel_id="c1", renderer_theme=renderer_theme
        )
        conteudo_ambar = renderer_theme.read_text(encoding="utf-8")

        assert conteudo_atual != conteudo_ambar

    def test_selecionar_para_canal_ativo_materializa(
        self, db: Path, renderer_theme: Path, tmp_path: Path, monkeypatch
    ):
        canal_ativo = tmp_path / "instance" / "channels" / "ativo"
        canal_ativo.mkdir(parents=True)
        monkeypatch.setattr(channel_theme.channel_paths, "active_channel_root", lambda: canal_ativo)
        channel_theme.selecionar_tema(
            "ambar-quente", db_path=db, channel_id="ativo", renderer_theme=renderer_theme
        )
        assert renderer_theme.exists()
        palette = json.loads(renderer_theme.read_text(encoding="utf-8"))["palette"]
        assert palette == theme_library.obter_tema("ambar-quente").paleta
