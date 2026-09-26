"""D-507: modo e disposicao no lugar dos quatro modelos.

O feedback que gerou isto foi "posso fazer um monte de combo que nao faz
sentido". Entao a metade mais importante deste arquivo nao testa o que o
arranjo MONTA — testa o que ele RECUSA, e se a recusa chega a tempo de aparecer
na tela em vez de virar um palco torto no arquivo.
"""

import pytest
from app.domain.short.arranjo_short import (
    Arranjo,
    Disposicao,
    ModoPalco,
    catalogo,
    de_chave,
    fonte_efetiva,
    slots_de,
    sugerir,
)
from app.domain.short.palco_short import CANVAS

SO_PESSOA = {"pessoa": {"x": 0, "y": 0, "w": 640, "h": 480}}
AS_DUAS = {**SO_PESSOA, "tela": {"x": 700, "y": 100, "w": 1200, "h": 700}}
SO_QUADRO = {"quadro": {"x": 0, "y": 0, "w": 1920, "h": 1080}}

DIVIDIDA = Arranjo(modo=ModoPalco.DIVIDIDA)
INSERT = Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.INSERT)


class TestChave:
    def test_a_disposicao_nao_aparece_em_cheia(self):
        """Dois campos deixariam gravar 'cheia + insert', que nao quer dizer nada."""
        com_disposicao = Arranjo(modo=ModoPalco.CHEIA, disposicao=Disposicao.INSERT)

        assert com_disposicao.chave == "cheia"

    @pytest.mark.parametrize("chave", ["cheia", "dividida_empilhada", "dividida_insert"])
    def test_ida_e_volta(self, chave):
        assert de_chave(chave).chave == chave

    def test_chave_desconhecida_cai_no_padrao(self):
        """Um arranjo que saiu do codigo tem de sair MONTADO, nao com erro."""
        assert de_chave("arranjo-que-nao-existe-mais").chave == "cheia"

    def test_a_fonte_atravessa_a_conversao(self):
        assert de_chave("cheia", fonte="tela").fonte == "tela"


class TestOQueOArranjoMonta:
    def test_cheia_ocupa_o_quadro_inteiro(self):
        slots = slots_de(Arranjo(), SO_PESSOA)

        assert list(slots) == ["pessoa"]
        assert (slots["pessoa"].w, slots["pessoa"].h) == (CANVAS.largura, CANVAS.altura)

    def test_empilhada_fecha_no_meio_do_quadro(self):
        """As duas metades encostam: um vao entre elas mostraria o fundo no meio."""
        slots = slots_de(DIVIDIDA, AS_DUAS)

        assert slots["tela"].y + slots["tela"].h == slots["pessoa"].y

    def test_insert_poe_a_tela_por_dentro_da_pessoa(self):
        slots = slots_de(INSERT, AS_DUAS)

        assert slots["pessoa"].h == CANVAS.altura
        assert slots["tela"].x > 0, "o insert precisa de margem para ler como card"
        assert slots["tela"].w < CANVAS.largura

    def test_a_tela_compartilhada_cabe_inteira_e_o_rosto_cobre(self):
        """Cortar a tela esconderia o que a pessoa esta mostrando; cortar o rosto nao."""
        slots = slots_de(DIVIDIDA, AS_DUAS)

        assert slots["tela"].ajuste.value == "caber"
        assert slots["pessoa"].ajuste.value == "cobrir"


class TestOQueOArranjoRecusa:
    """O coracao da D-507: combinacao impossivel nao monta, e diz o porque."""

    def test_dividida_sem_as_duas_regioes_nao_monta(self):
        assert slots_de(DIVIDIDA, SO_PESSOA) == {}
        assert slots_de(INSERT, SO_QUADRO) == {}

    def test_cheia_sem_regiao_nenhuma_nao_monta(self):
        assert slots_de(Arranjo(), {}) == {}

    def test_o_catalogo_marca_o_que_nao_serve_para_estas_regioes(self):
        """Oferecer o impossivel e mentir devagar: o operador escolhe, o palco
        cai no recorte simples, e nada na tela liga uma coisa a outra."""
        itens = {i["chave"]: i for i in catalogo(SO_PESSOA)}

        assert itens["cheia"]["possivel"] is True
        assert itens["dividida_empilhada"]["possivel"] is False
        assert itens["dividida_insert"]["possivel"] is False

    def test_o_impedimento_diz_o_que_falta_marcar(self):
        """ "Nao disponivel" sozinho manda o operador adivinhar o proximo passo."""
        item = next(i for i in catalogo(SO_PESSOA) if i["chave"] == "dividida_empilhada")

        assert "tela" in item["impedimento"]

    def test_sem_regiao_nenhuma_ate_a_cheia_e_impossivel(self):
        itens = {i["chave"]: i for i in catalogo({})}

        assert itens["cheia"]["possivel"] is False
        assert "região" in itens["cheia"]["impedimento"]

    def test_o_catalogo_cru_nao_julga(self):
        """Sem regioes informadas, quem chama so quer os nomes."""
        assert all(i["possivel"] for i in catalogo())


class TestFonte:
    def test_a_escolha_do_operador_vence(self):
        assert fonte_efetiva("tela", AS_DUAS) == "tela"

    def test_fonte_que_nao_foi_marcada_nao_e_usada(self):
        """Apontar para regiao inexistente montaria uma janela vazia — short preto."""
        assert fonte_efetiva("tela", SO_PESSOA) == "pessoa"

    def test_sem_escolha_a_pessoa_vem_primeiro(self):
        """E ela que segura um short; o quadro arrasta o chrome da live junto."""
        assert fonte_efetiva("", {**SO_PESSOA, **SO_QUADRO}) == "pessoa"

    def test_sem_regiao_nenhuma_nao_ha_fonte(self):
        assert fonte_efetiva("", {}) == ""

    def test_a_fonte_escolhida_e_quem_preenche_a_janela(self):
        """A prova de que 'pessoa cheia' e 'quadro com moldura' eram o MESMO
        arranjo: muda a fonte, muda o conteudo, o layout fica igual."""
        com_pessoa = slots_de(Arranjo(fonte="pessoa"), {**SO_PESSOA, **SO_QUADRO})
        com_quadro = slots_de(Arranjo(fonte="quadro"), {**SO_PESSOA, **SO_QUADRO})

        assert list(com_pessoa) == ["pessoa"]
        assert list(com_quadro) == ["quadro"]
        assert list(com_pessoa.values()) == list(com_quadro.values())


class TestSugestao:
    def test_duas_regioes_pedem_tela_dividida(self):
        assert sugerir(AS_DUAS).chave == "dividida_empilhada"

    def test_uma_regiao_pede_tela_cheia_alimentada_por_ela(self):
        sugerido = sugerir(SO_QUADRO)

        assert sugerido.modo is ModoPalco.CHEIA
        assert sugerido.fonte == "quadro"

    def test_o_sugerido_sempre_monta(self):
        """Sugerir o que nao monta seria o combo sem sentido nascendo de fabrica."""
        for regioes in (SO_PESSOA, AS_DUAS, SO_QUADRO):
            assert slots_de(sugerir(regioes), regioes) != {}
