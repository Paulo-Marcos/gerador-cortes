"""D-1021 / RN-33: qual título do corte pode sair para o público."""

import pytest
from app.domain.corte.metadado_corte import rotulo_de_corte_manual, titulo_de_publicacao


def test_o_rotulo_que_o_corte_manual_recebe_nunca_e_publicavel():
    """Quem grava e quem recusa falam do mesmo texto: mudar um sem o outro falha aqui."""
    assert titulo_de_publicacao(None, rotulo_de_corte_manual(7)) == ""


def test_o_gerado_vence_o_proposto():
    assert titulo_de_publicacao("O gerado", "O proposto") == "O gerado"


def test_rotulo_no_metadado_cede_ao_proposto_que_o_operador_renomeou():
    """Fire ligado antes de gerar copia o rótulo; depois o corte ganhou nome na edição."""
    assert titulo_de_publicacao("🔥 Corte manual #3", "Hegel de cabeça") == "Hegel de cabeça"


@pytest.mark.parametrize(
    "titulo",
    ["Corte manual #3 sobre Hegel", "O Corte manual #3", "Corte manual", "Corte manual #"],
)
def test_titulo_que_so_lembra_o_rotulo_e_titulo(titulo):
    """Só o rótulo exato é provisório: recusar um título real travaria o envio à toa."""
    assert titulo_de_publicacao(titulo, "") == titulo


@pytest.mark.parametrize("vazio", [None, "", "   ", "🔥", "🔥 "])
def test_titulo_sem_texto_nao_conta_como_gerado(vazio):
    assert titulo_de_publicacao(vazio, "O proposto") == "O proposto"
    assert titulo_de_publicacao(vazio, vazio) == ""
