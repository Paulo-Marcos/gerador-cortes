"""Testes do domínio puro `avaliacao_thumbnail` (D-066)."""

import pytest
from app.domain.avaliacao_thumbnail import (
    agregar_avaliacoes,
    normalizar_nota,
    normalizar_veredito,
    veredito_e_positivo,
)


class TestNormalizarVeredito:
    def test_aceita_e_normaliza_caixa(self):
        assert normalizar_veredito("BOM") == "bom"
        assert normalizar_veredito("  Otimo ") == "otimo"

    def test_rejeita_vazio(self):
        with pytest.raises(ValueError):
            normalizar_veredito("")
        with pytest.raises(ValueError):
            normalizar_veredito(None)

    def test_rejeita_desconhecido(self):
        with pytest.raises(ValueError):
            normalizar_veredito("maravilhoso")


class TestNormalizarNota:
    def test_none_e_vazio_viram_none(self):
        assert normalizar_nota(None) is None
        assert normalizar_nota("") is None

    def test_aceita_intervalo(self):
        assert normalizar_nota(1) == 1
        assert normalizar_nota(5) == 5
        assert normalizar_nota("4") == 4

    def test_rejeita_fora_do_intervalo(self):
        with pytest.raises(ValueError):
            normalizar_nota(0)
        with pytest.raises(ValueError):
            normalizar_nota(6)


class TestVeredictoPositivo:
    def test_otimo_e_bom_sao_positivos(self):
        assert veredito_e_positivo("otimo") is True
        assert veredito_e_positivo("BOM") is True

    def test_regular_e_ruim_nao_sao(self):
        assert veredito_e_positivo("regular") is False
        assert veredito_e_positivo("ruim") is False


class TestAgregarAvaliacoes:
    def test_conjunto_vazio_zera(self):
        resumo = agregar_avaliacoes([])
        assert resumo["total"] == 0
        assert resumo["positivos"] == 0
        assert resumo["por_veredito"]["bom"] == 0
        assert resumo["medias_criterios"]["beleza"] is None

    def test_conta_vereditos_e_positivos(self):
        resumo = agregar_avaliacoes(
            [
                {"veredito": "otimo"},
                {"veredito": "bom"},
                {"veredito": "ruim"},
            ]
        )
        assert resumo["total"] == 3
        assert resumo["positivos"] == 2
        assert resumo["por_veredito"] == {
            "otimo": 1,
            "bom": 1,
            "regular": 0,
            "ruim": 1,
        }

    def test_media_ignora_criterios_nao_avaliados(self):
        resumo = agregar_avaliacoes(
            [
                {"veredito": "bom", "nota_beleza": 4},
                {"veredito": "bom", "nota_beleza": None},
                {"veredito": "bom", "nota_beleza": 2},
            ]
        )
        # Apenas as duas notas presentes contam: média (4+2)/2 = 3.0
        assert resumo["medias_criterios"]["beleza"] == 3.0
        assert resumo["medias_criterios"]["clareza"] is None
