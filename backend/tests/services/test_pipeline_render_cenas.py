"""As cenas que o render lê do corte, e o filtro que a grade respeita.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import json
from unittest.mock import MagicMock

import pytest
from app.services.render.pipeline_render import (
    _extrair_cenas,
)


def _mock_corte(cenas_remotion=None):
    corte = MagicMock()
    corte.cenas_remotion = cenas_remotion
    return corte


# ─────────────────────────────────────────────────────────────
# _extrair_cenas
# ─────────────────────────────────────────────────────────────


class TestExtrairCenas:
    def test_cenas_remotion_none_retorna_lista_vazia(self):
        corte = _mock_corte(cenas_remotion=None)
        assert _extrair_cenas(corte) == []

    def test_cenas_remotion_string_vazia_retorna_vazia(self):
        corte = _mock_corte(cenas_remotion="")
        assert _extrair_cenas(corte) == []

    def test_cenas_remotion_dict_com_chave_cenas(self):
        payload = {"cenas": [{"tipo": "card_informacao", "inicio": 0.0, "fim": 5.0}]}
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        result = _extrair_cenas(corte)
        assert len(result) == 1
        assert result[0]["tipo"] == "card_informacao"

    def test_cenas_remotion_lista_direta(self):
        payload = [{"tipo": "barra_inferior", "inicio": 0.0, "fim": 3.0}]
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        result = _extrair_cenas(corte)
        assert len(result) == 1

    def test_cenas_remotion_dict_sem_chave_cenas_retorna_vazia(self):
        payload = {"outro_campo": []}
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        assert _extrair_cenas(corte) == []

    def test_json_invalido_retorna_vazia_sem_explodir(self):
        corte = _mock_corte(cenas_remotion="nao_e_json{{{")
        assert _extrair_cenas(corte) == []

    def test_lista_com_multiplas_cenas(self):
        payload = {
            "cenas": [
                {"tipo": "card_informacao", "inicio": 0.0, "fim": 5.0},
                {"tipo": "barra_inferior", "inicio": 10.0, "fim": 13.0},
            ]
        }
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        assert len(_extrair_cenas(corte)) == 2

    def test_aceita_objeto_nao_string(self):
        # cenas_remotion pode vir como objeto Python (não serializado) em alguns fluxos
        payload = [{"tipo": "marco_historico", "inicio": 0.0, "fim": 5.0}]
        corte = _mock_corte(cenas_remotion=payload)
        result = _extrair_cenas(corte)
        assert len(result) == 1

    def test_aceita_dict_nao_string(self):
        payload = {"cenas": [{"tipo": "ficha_biografica", "inicio": 0.0, "fim": 5.0}]}
        corte = _mock_corte(cenas_remotion=payload)
        result = _extrair_cenas(corte)
        assert len(result) == 1


# ─────────────────────────────────────────────────────────────
# Fonte única do filtro (regressão: nunca mais filtro fantasma)
# ─────────────────────────────────────────────────────────────


class TestFiltroAplicadoNaGradeRespeitaUsuario:
    """Regressão: o pipeline deve usar `cinema_filters.get_filtro_vf` —
    nunca um filtro plano "rápido" que substitua a escolha do usuário."""

    @pytest.mark.parametrize("filtro", ["cinematic_iii"])
    def test_pipeline_usa_filtro_completo_do_domain(self, filtro):
        from app.infrastructure.render.cinema_filters import get_filtro_vf

        resultado = get_filtro_vf(filtro)
        assert "curves" in resultado, (
            f"Filtro '{filtro}' deve incluir 'curves' (foi o sintoma do "
            "filtro fantasma que substituía a escolha do usuário por "
            "apenas eq+drawbox)."
        )
        assert "colorbalance" in resultado
        assert "vignette" in resultado

    def test_nenhum_retorna_none_para_pular_vf(self):
        from app.infrastructure.render.cinema_filters import get_filtro_vf

        assert get_filtro_vf("nenhum") is None
