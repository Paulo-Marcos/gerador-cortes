"""O que a normalização do layout faz com a entrada que não serve (D-716).

Teste de caracterização, antes de fatiar `normalizar_layout_youtube`
(complexidade 25). A suíte cobria quase tudo e deixava três ramos: o JSON
quebrado no layout e no fallback, e a região que não vale. A regra é a mesma
nos três — o que não se lê vira ausência, nunca erro.
"""

from app.domain.corte.youtube_layout import MODO_COMPARTILHADA, normalizar_layout_youtube

normalizar = normalizar_layout_youtube


def test_layout_em_json_quebrado_e_o_mesmo_que_layout_ausente():
    assert normalizar("{nao e json") == normalizar(None)


def test_fallback_em_json_quebrado_e_o_mesmo_que_fallback_ausente():
    assert normalizar({}, fallback_layout="{nao e json") == normalizar({})


def test_fallback_em_texto_valido_e_lido():
    fallback = '{"modo_padrao": "compartilhada"}'

    assert normalizar(None, fallback_layout=fallback)["modo_padrao"] == MODO_COMPARTILHADA


def test_regiao_que_nao_vale_sai_e_as_demais_ficam_em_ordem():
    regioes = [
        {"inicio": 30, "fim": 40, "modo": "full"},
        "lixo",
        {"inicio": 10, "fim": 10},
        {"inicio": 5, "fim": 8},
    ]

    resultado = normalizar({"regioes": regioes})["regioes"]

    assert [(r["inicio"], r["fim"], r["modo"]) for r in resultado] == [
        (5.0, 8.0, MODO_COMPARTILHADA),
        (30.0, 40.0, "full"),
    ]
