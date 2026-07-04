"""Testes do domínio puro `render_etapas` (alcance de fases do render parcial)."""

from app.domain.render_etapas import (
    eh_render_parcial,
    fase_dentro_do_alcance,
    normalizar_fase,
)


class TestNormalizarFase:
    def test_none_permanece_none(self):
        assert normalizar_fase(None) is None

    def test_alias_compose_vira_render_final(self):
        assert normalizar_fase("compose") == "render_final"

    def test_alias_encode_vira_render_final(self):
        assert normalizar_fase("encode") == "render_final"

    def test_fase_canonica_inalterada(self):
        assert normalizar_fase("grade") == "grade"

    def test_desconhecida_inalterada(self):
        assert normalizar_fase("xpto") == "xpto"


class TestFaseDentroDoAlcance:
    def test_sem_limite_roda_tudo(self):
        assert fase_dentro_do_alcance("render_final", None) is True

    def test_parar_em_grade_bloqueia_overlays(self):
        assert fase_dentro_do_alcance("overlays", "grade") is False

    def test_parar_em_grade_permite_grade(self):
        assert fase_dentro_do_alcance("grade", "grade") is True

    def test_parar_em_overlays_permite_overlays(self):
        assert fase_dentro_do_alcance("overlays", "overlays") is True

    def test_parar_em_overlays_bloqueia_render_final(self):
        assert fase_dentro_do_alcance("render_final", "overlays") is False

    def test_alias_no_limite_resolve(self):
        # parar_em="encode" == render_final → tudo no alcance
        assert fase_dentro_do_alcance("overlays", "encode") is True

    def test_limite_desconhecido_roda_tudo(self):
        assert fase_dentro_do_alcance("render_final", "xpto") is True


class TestEhRenderParcial:
    def test_grade_e_parcial(self):
        assert eh_render_parcial("grade") is True

    def test_overlays_e_parcial(self):
        assert eh_render_parcial("overlays") is True

    def test_render_final_nao_e_parcial(self):
        assert eh_render_parcial("render_final") is False

    def test_alias_encode_nao_e_parcial(self):
        assert eh_render_parcial("encode") is False

    def test_none_nao_e_parcial(self):
        assert eh_render_parcial(None) is False
