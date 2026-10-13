"""D-909: o bloco MODO DA CAPA, que diz à skill qual seção seguir."""

import pytest
from app.domain.canal.fotos_do_apresentador import expressoes_do_prompt
from app.domain.canal.protagonista_da_capa import (
    PROTAGONISTA_PADRAO,
    bloco_do_modo,
    protagonista_valido,
)
from app.domain.compartilhado.erros import PedidoInvalido


def test_o_canal_nasce_com_o_mascote():
    assert PROTAGONISTA_PADRAO == "mascote"


@pytest.mark.parametrize("valor", ["mascote", " Apresentador "])
def test_aceita_os_dois_protagonistas(valor):
    assert protagonista_valido(valor) == valor.strip().lower()


@pytest.mark.parametrize("valor", ["", "os dois", "convidado"])
def test_recusa_o_que_nao_e_protagonista(valor):
    with pytest.raises(PedidoInvalido):
        protagonista_valido(valor)


def test_modo_mascote_segue_como_sempre():
    bloco = bloco_do_modo("mascote", mascote="Sapo", expressoes=["pensativo"])

    assert bloco.startswith("=== MODO DA CAPA: mascote ===")
    assert "o Sapo é o protagonista" in bloco
    assert "[APRESENTADOR" not in bloco


def test_modo_apresentador_tira_o_mascote_e_lista_as_expressoes():
    bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=["indignado", "pensativo"])

    assert bloco.startswith("=== MODO DA CAPA: apresentador ===")
    assert "O Sapo NÃO entra nesta capa" in bloco
    assert "indignado, pensativo" in bloco


def test_a_linha_que_o_bloco_ensina_e_a_que_o_robo_le():
    """O formato pedido ao Capista precisa ser o que `expressoes_do_prompt` entende."""
    bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=[])
    linha_modelo = next(lin for lin in bloco.splitlines() if lin.startswith("[APRESENTADOR"))

    assert expressoes_do_prompt(linha_modelo) == ["expressao-1", "expressao-2"]


def test_banco_vazio_ainda_pede_a_linha():
    bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=[])

    assert "banco de fotos ainda está vazio" in bloco
