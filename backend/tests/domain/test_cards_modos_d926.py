"""D-926: como o card se apresenta dentro do espaço dele (a zona dos cards)."""

from __future__ import annotations

import pytest
from app.domain.canal import cards_do_canal as cards
from app.domain.canal import palco_componentes as pc
from app.domain.compartilhado.erros import PedidoInvalido


def test_padrao_preenche_o_espaco_e_centraliza():
    padrao = cards.Cards()
    assert (padrao.ajuste, padrao.alinhamento_vertical, padrao.alinhamento_horizontal) == (
        "preencher",
        "centro",
        "centro",
    )


def test_edicao_parcial_muda_so_o_que_veio():
    novo = cards.mesclar(cards.Cards(), {"alinhamento_vertical": "Topo"})
    assert novo.alinhamento_vertical == "topo"
    assert novo.ajuste == "preencher"


def test_opcao_desconhecida_e_recusada_na_edicao_e_ignorada_na_leitura():
    with pytest.raises(PedidoInvalido):
        cards.mesclar(cards.Cards(), {"ajuste": "esticar"})
    lido = cards.mesclar(cards.Cards(), {"ajuste": "esticar"}, tolerante=True)
    assert lido.ajuste == "preencher"


def test_o_renderer_recebe_os_modos():
    props = cards.props_para_renderer(
        "limpo",
        cards.mesclar(cards.Cards(), {"ajuste": "natural", "alinhamento_horizontal": "esquerda"}),
    )
    assert (props["ajuste"], props["alinhamento_vertical"], props["alinhamento_horizontal"]) == (
        "natural",
        "centro",
        "esquerda",
    )


def test_o_palco_guarda_e_devolve_os_modos():
    palco = pc.mesclar(pc.PADRAO, {"cards": {"alinhamento_vertical": "base"}})
    assert pc.normalizar(palco.para_dict()).cards.alinhamento_vertical == "base"
