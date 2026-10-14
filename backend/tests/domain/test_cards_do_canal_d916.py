"""D-916: os cards do canal — tipos escondidos, tamanho e posição."""

from __future__ import annotations

import pytest
from app.domain.canal import cards_do_canal as cards
from app.domain.canal import palco_componentes as pc


def test_padrao_nao_esconde_nada_e_fica_no_canto():
    padrao = pc.PADRAO.cards
    assert padrao.ocultos == ()
    assert padrao.escala == 1.0
    assert padrao.posicao.automatica


def test_edicao_parcial_pelo_palco():
    novo = pc.mesclar(
        pc.PADRAO,
        {
            "cards": {
                "ocultos": ["pergunta_chat"],
                "escala": 1.4,
                "posicao": {"automatica": False, "x": 1200, "y": 80},
            }
        },
    )
    assert novo.cards.ocultos == ("pergunta_chat",)
    assert novo.cards.escala == 1.4
    assert (novo.cards.posicao.automatica, novo.cards.posicao.x, novo.cards.posicao.y) == (
        False,
        1200,
        80,
    )
    # Campo ausente não muda.
    assert pc.mesclar(novo, {"cards": {"escala": 1.0}}).cards.ocultos == ("pergunta_chat",)


def test_limites_de_tamanho_e_posicao():
    novo = cards.mesclar(
        cards.Cards(), {"escala": 0.1, "posicao": {"automatica": False, "x": 99999, "y": -5}}
    )
    assert novo.escala == cards.ESCALA_MINIMA
    assert (novo.posicao.x, novo.posicao.y) == (1920, 0)


def test_tipo_desconhecido_e_recusado_na_edicao_e_ignorado_na_leitura():
    with pytest.raises(cards.TipoDeCenaInvalido):
        pc.mesclar(pc.PADRAO, {"cards": {"ocultos": ["neon"]}})
    lido = pc.normalizar({"cards": {"ocultos": ["neon", "enfase"]}})
    assert lido.cards.ocultos == ("enfase",)


def test_todo_tipo_do_renderer_tem_nome_na_tela():
    assert len(cards.TIPOS_DE_CENA) == 16
    assert all(nome.strip() for nome in cards.TIPOS_DE_CENA.values())


def test_props_do_renderer_levam_o_estilo_e_o_apelido_do_comparativo():
    props = cards.props_para_renderer(
        "limpo", cards.Cards(ocultos=("comparativo_contraponto",), escala=1.2)
    )
    assert props["estilo"] == "limpo"
    assert props["ocultos"] == ["comparativo_contraponto", "comparativo_enfase"]
    assert props["escala"] == 1.2
    assert props["posicao"] == {"automatica": True, "x": 96, "y": 112}
