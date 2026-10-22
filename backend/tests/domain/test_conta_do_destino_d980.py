"""A regra da conta do destino (RN-31, D-980): aprende a primeira, barra a outra."""

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.publicacao.conta_do_destino import (
    DESTINOS,
    Conta,
    ContaDivergente,
    ContaIlegivel,
    conferir,
)


def test_sem_conta_esperada_aprende_a_logada():
    assert conferir("tiktok", None, Conta("123", "@canal")) is True


def test_a_mesma_conta_passa_sem_aprender_de_novo():
    assert conferir("tiktok", Conta("123", "@canal"), Conta("123", "@canal")) is False


def test_compara_pelo_id_e_nao_pelo_nome():
    """O dono troca o @ quando quer; o id é o que diz que a conta é a mesma."""
    assert conferir("tiktok", Conta("123", "@antigo"), Conta("123", "@novo")) is False


def test_outra_conta_barra_o_envio_e_diz_as_duas():
    with pytest.raises(ContaDivergente) as erro:
        conferir("youtube", Conta("UC-certo", "Canal A"), Conta("UC-outro", "Canal B"))

    mensagem = str(erro.value)
    assert "Canal B (UC-outro)" in mensagem
    assert "Canal A (UC-certo)" in mensagem
    assert "Esquecer" in mensagem


def test_conta_que_nao_se_le_barra_mesmo_sem_esperada():
    """Na dúvida, não publica: sem id lido não há o que aprender nem comparar."""
    with pytest.raises(ContaIlegivel):
        conferir("instagram_web", None, Conta(""))


def test_destino_desconhecido_e_pedido_invalido():
    with pytest.raises(PedidoInvalido):
        conferir("orkut", None, Conta("1"))


def test_os_quatro_destinos_na_ordem_da_tela():
    assert DESTINOS == ("youtube", "tiktok", "instagram", "instagram_web")
