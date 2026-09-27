"""O score da proposta v2 chega ao editor só com notas numéricas (D-722)."""

from app.domain.corte.corte_mapper import score_do_corte


def test_score_completo_passa_igual():
    gravado = '{"hook": 8, "flow": 7, "value": 9, "total": 24}'

    assert score_do_corte(gravado) == {"hook": 8, "flow": 7, "value": 9, "total": 24}


def test_corte_antigo_ou_manual_fica_sem_score():
    assert score_do_corte("{}") == {}
    assert score_do_corte(None) == {}


def test_nota_que_nao_e_numero_sai():
    assert score_do_corte('{"hook": "alto", "flow": 7.5, "value": null, "x": true}') == {
        "flow": 7.5
    }


def test_o_que_nao_e_objeto_ou_nao_e_json_fica_sem_score():
    assert score_do_corte("[1, 2]") == {}
    assert score_do_corte("<<quebrado>>") == {}
