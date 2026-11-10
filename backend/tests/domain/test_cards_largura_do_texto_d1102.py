"""D-1102: até onde vai o texto do card (largura do texto), configurável."""

from __future__ import annotations

from app.domain.canal import cards_do_canal as cards
from app.domain.canal import palco_do_escopo
from app.domain.canal.palco_componentes import PADRAO, mesclar


def test_sem_pedido_a_largura_e_automatica_como_antes():
    assert cards.Cards().largura_do_texto == 0
    assert cards.Cards().para_dict()["largura_do_texto"] == 0
    assert cards.props_para_renderer("limpo", cards.Cards())["largura_do_texto"] == 0


def test_a_largura_grava_e_chega_ao_renderer():
    novo = cards.mesclar(cards.Cards(), {"largura_do_texto": 1200})
    assert novo.largura_do_texto == 1200
    assert cards.props_para_renderer("limpo", novo)["largura_do_texto"] == 1200


def test_a_largura_e_presa_ao_minimo_e_ao_quadro_mas_zero_segue_automatica():
    assert (
        cards.mesclar(cards.Cards(), {"largura_do_texto": 50}).largura_do_texto
        == cards.LARGURA_MINIMA_DO_TEXTO
    )
    assert (
        cards.mesclar(cards.Cards(), {"largura_do_texto": 9000}).largura_do_texto == cards.QUADRO[0]
    )
    assert (
        cards.mesclar(cards.Cards(largura_do_texto=900), {"largura_do_texto": 0}).largura_do_texto
        == 0
    )


def test_edicao_que_nao_fala_da_largura_nao_a_muda():
    assert cards.mesclar(cards.Cards(largura_do_texto=900), {"escala": 1.5}).largura_do_texto == 900


def test_lixo_na_leitura_nao_derruba():
    assert (
        cards.mesclar(
            cards.Cards(largura_do_texto=900), {"largura_do_texto": "x"}, tolerante=True
        ).largura_do_texto
        == 900
    )


def test_o_escopo_grava_a_largura():
    canal = mesclar(PADRAO, {})
    corte = mesclar(canal, {"cards": {"largura_do_texto": 1100}})
    escolha = palco_do_escopo.diferenca(canal.para_dict(), corte.para_dict())
    assert escolha == {"cards": {"largura_do_texto": 1100}}
    assert palco_do_escopo.aplicar(canal, escolha).cards.largura_do_texto == 1100
