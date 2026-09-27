"""Os descartados da análise chegam à auditoria como `tema` e `motivo` (D-722).

Vêm da resposta da IA sem conferência; a auditoria normaliza na leitura.
"""

from app.domain.projeto.analise_aditiva import normalizar_descartados


def test_descartado_bem_formado_passa_igual():
    bruto = [{"tema": "treta", "motivo": "off-topic"}]

    assert normalizar_descartados(bruto) == bruto


def test_campo_ausente_ou_nulo_vira_texto_vazio_e_extra_sai():
    bruto = [{"tema": "treta"}, {"tema": None, "motivo": "fora do tom", "nota": 3}]

    assert normalizar_descartados(bruto) == [
        {"tema": "treta", "motivo": ""},
        {"tema": "", "motivo": "fora do tom"},
    ]


def test_o_que_nao_e_objeto_sai():
    assert normalizar_descartados(["solto", 3, {"tema": "a", "motivo": "b"}]) == [
        {"tema": "a", "motivo": "b"}
    ]


def test_o_que_nao_e_lista_vira_lista_vazia():
    assert normalizar_descartados({"oops": "deveria ser array"}) == []
