"""D-983: conferir a data que o TikTok mostra, agora por extenso."""

import pytest
from app.domain.publicacao.agendamento import Agendamento


class TestDataMostradaNaTela:
    """D-983: o TikTok passou a mostrar a data por extenso, na lingua da conta.

    A conferencia e o que impede entregar a aba com o dia certo no mes errado:
    um clique no calendario que erra o alvo nao da erro, so marca outra data.
    """

    def test_reconhece_o_texto_medido_em_portugues(self):
        assert Agendamento.de_texto("2026-10-23T00:05").mostrada_em("23 de out de 2026")

    def test_reconhece_a_conta_em_ingles(self):
        assert Agendamento.de_texto("2026-03-05T10:00").mostrada_em("Mar 5, 2026")

    def test_aceita_acento_e_ponto_da_abreviacao(self):
        assert Agendamento.de_texto("2026-03-05T10:00").mostrada_em("5 de març. de 2026")

    @pytest.mark.parametrize(
        "exibido",
        ["23 de set de 2026", "22 de out de 2026", "23 de out de 2027", "", "Select date"],
    )
    def test_recusa_dia_mes_ou_ano_diferente(self, exibido):
        assert not Agendamento.de_texto("2026-10-23T00:05").mostrada_em(exibido)
