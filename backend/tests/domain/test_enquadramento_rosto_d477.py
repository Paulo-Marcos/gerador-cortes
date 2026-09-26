"""D-477: do rosto detectado ao enquadramento.

A deteccao em si nao e testada aqui — ela e do cv2, e um teste que a repetisse
so provaria que o cv2 faz o que faz. O que se guarda e a DECISAO, que e onde os
erros sao caros e silenciosos:

  - um falso positivo virando o enquadramento;
  - um rosto de slide ganhando do apresentador;
  - "nao achei" saindo como 0.5 e passando por uma escolha.
"""

import pytest
from app.domain.short.enquadramento_rosto import (
    DISPERSAO_QUE_INCOMODA,
    RostoDetectado,
    decidir,
    instantes,
)


def rosto(x: float, tamanho: float = 0.3) -> RostoDetectado:
    return RostoDetectado(centro_x=x, largura=tamanho)


class TestDecisao:
    def test_rosto_estavel_vira_o_foco(self):
        veredito = decidir([[rosto(0.62)], [rosto(0.63)], [rosto(0.61)]])

        assert veredito.foco_x == 0.62
        assert veredito.achou

    def test_o_falso_positivo_nao_arrasta_o_enquadramento(self):
        """A mediana e a escolha; a media enquadraria o vazio.

        Nao e hipotese: no quadro real desta demanda o cascade `default` achou o
        rosto (738px) E um retrato na parede (153px).
        """
        veredito = decidir([[rosto(0.6)], [rosto(0.61)], [rosto(0.05)], [rosto(0.62)]])

        assert veredito.foco_x == pytest.approx(0.605, abs=0.01)

    def test_o_maior_rosto_de_cada_quadro_e_o_apresentador(self):
        """Numa live com tela compartilhada aparece rosto que nao e o de quem fala."""
        veredito = decidir(
            [
                [rosto(0.2, tamanho=0.05), rosto(0.8, tamanho=0.35)],
                [rosto(0.19, tamanho=0.05), rosto(0.81, tamanho=0.34)],
            ]
        )

        assert veredito.foco_x == pytest.approx(0.805, abs=0.01)

    def test_o_foco_nunca_sai_do_quadro(self):
        veredito = decidir([[rosto(1.4)], [rosto(1.5)], [rosto(1.6)]])

        assert 0.0 <= veredito.foco_x <= 1.0


class TestNaoSei:
    def test_sem_rosto_nenhum_nao_ha_foco(self):
        """0.5 seria indistinguivel de ter decidido pelo centro."""
        veredito = decidir([[], [], [], []])

        assert veredito.foco_x is None
        assert not veredito.achou

    def test_um_rosto_em_dez_quadros_nao_decide(self):
        quadros = [[rosto(0.8)]] + [[] for _ in range(9)]

        veredito = decidir(quadros)

        assert veredito.foco_x is None

    def test_um_terco_dos_quadros_ja_decide(self):
        """A pessoa vira o rosto, abaixa para ler, passa a mao na frente.

        Exigir a maioria recusaria trechos perfeitamente enquadraveis.
        """
        quadros = [[rosto(0.8)], [rosto(0.79)], [rosto(0.81)], [], [], []]

        veredito = decidir(quadros)

        assert veredito.foco_x == pytest.approx(0.8, abs=0.01)

    def test_o_motivo_diz_a_contagem(self):
        """Sem numero, "nao achei" e indistinguivel de "nao rodei"."""
        veredito = decidir([[rosto(0.8)], [], [], []])

        assert "1 de 4" in veredito.motivo

    def test_lista_vazia_nao_levanta(self):
        veredito = decidir([])

        assert veredito.foco_x is None
        assert veredito.quadros_analisados == 0


class TestPessoaQueSeMove:
    def test_rosto_parado_nao_gera_aviso(self):
        veredito = decidir([[rosto(0.6)], [rosto(0.61)], [rosto(0.6)]])

        assert not veredito.pessoa_se_move

    def test_rosto_que_atravessa_o_quadro_avisa(self):
        """Um ponto fixo ainda e melhor que o centro — mas e um meio-termo.

        Calar aqui faria o operador culpar o detector por um video em que a
        pessoa realmente andou.
        """
        veredito = decidir([[rosto(0.2)], [rosto(0.5)], [rosto(0.8)]])

        assert veredito.achou, "mover-se nao invalida o enquadramento"
        assert veredito.pessoa_se_move
        assert veredito.dispersao > DISPERSAO_QUE_INCOMODA

    def test_sem_deteccao_nao_ha_aviso_de_movimento(self):
        """Aviso sobre um enquadramento que nao existe so confunde."""
        assert not decidir([[], []]).pessoa_se_move


class TestInstantes:
    def test_as_bordas_ficam_de_fora(self):
        """No primeiro quadro pode haver transicao; no ultimo, a fala seguinte."""
        momentos = instantes(10.0, 20.0, 4)

        assert min(momentos) > 10.0
        assert max(momentos) < 20.0

    def test_sao_igualmente_espacados(self):
        momentos = instantes(0.0, 12.0, 3)
        vaos = [round(b - a, 3) for a, b in zip(momentos, momentos[1:], strict=False)]

        assert len(set(vaos)) == 1

    def test_a_quantidade_pedida_e_a_entregue(self):
        assert len(instantes(0.0, 30.0, 12)) == 12

    @pytest.mark.parametrize(
        ("inicio", "fim", "quantidade"),
        [(10.0, 10.0, 4), (20.0, 10.0, 4), (0.0, 30.0, 0)],
    )
    def test_janela_ou_pedido_invalido_nao_amostra(self, inicio, fim, quantidade):
        assert instantes(inicio, fim, quantidade) == []
