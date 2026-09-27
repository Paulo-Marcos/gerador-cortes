"""As listas do metadado chegam à tela como listas de textos (D-722)."""

from app.domain.corte.metadado_corte import lista_de_textos


def test_lista_de_textos_passa_igual():
    assert lista_de_textos('["#live", "#politica"]') == ["#live", "#politica"]


def test_vazio_ou_nulo_vira_lista_vazia():
    assert lista_de_textos("") == []
    assert lista_de_textos(None) == []


def test_item_que_nao_e_texto_vira_texto_e_nulo_sai():
    assert lista_de_textos('["a", 2, null]') == ["a", "2"]


def test_o_que_nao_e_lista_ou_nao_e_json_vira_lista_vazia():
    assert lista_de_textos('{"a": 1}') == []
    assert lista_de_textos("<<quebrado>>") == []
