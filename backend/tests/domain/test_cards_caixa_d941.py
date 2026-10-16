"""D-941: a caixa do card no vídeo cheio (largura e altura separadas)."""

from __future__ import annotations

from app.domain.canal import cards_do_canal as cards
from app.domain.canal import palco_do_escopo
from app.domain.canal.palco_componentes import PADRAO, mesclar


def test_sem_caixa_o_card_e_posicao_e_escala_como_antes():
    assert cards.Cards().zona_no_cheio is None
    assert cards.props_para_renderer("limpo", cards.Cards())["zona_no_cheio"] is None


def test_a_caixa_grava_largura_e_altura_separadas():
    novo = cards.mesclar(cards.Cards(), {"zona_no_cheio": {"x": 96, "y": 300, "w": 1100, "h": 480}})
    assert novo.para_dict()["zona_no_cheio"] == {"x": 96, "y": 300, "w": 1100, "h": 480}
    assert cards.props_para_renderer("limpo", novo)["zona_no_cheio"]["w"] == 1100


def test_a_caixa_e_presa_ao_quadro_e_ao_lado_minimo():
    novo = cards.mesclar(cards.Cards(), {"zona_no_cheio": {"x": 1900, "y": -5, "w": 30, "h": 9000}})
    x, y, w, h = novo.zona_no_cheio
    assert (w, h) == (cards.LADO_MINIMO_DA_CAIXA, cards.QUADRO[1])
    assert (x, y) == (cards.QUADRO[0] - w, 0)


def test_caixa_vazia_e_o_pedido_de_voltar_ao_proporcional():
    com_caixa = cards.mesclar(
        cards.Cards(), {"zona_no_cheio": {"x": 1, "y": 1, "w": 400, "h": 400}}
    )
    sem = cards.mesclar(com_caixa, {"zona_no_cheio": {"x": 0, "y": 0, "w": 0, "h": 0}})
    assert sem.zona_no_cheio is None


def test_edicao_que_nao_fala_da_caixa_nao_a_tira():
    com_caixa = cards.mesclar(
        cards.Cards(), {"zona_no_cheio": {"x": 1, "y": 1, "w": 400, "h": 400}}
    )
    assert cards.mesclar(com_caixa, {"escala": 1.5}).zona_no_cheio == (1, 1, 400, 400)


def test_o_escopo_grava_a_caixa_inteira_e_nao_pela_metade():
    """Mudar só a largura no corte grava a caixa completa — uma caixa parcial seria ignorada."""
    canal = mesclar(PADRAO, {"cards": {"zona_no_cheio": {"x": 96, "y": 300, "w": 520, "h": 480}}})
    corte = mesclar(canal, {"cards": {"zona_no_cheio": {"x": 96, "y": 300, "w": 1100, "h": 480}}})
    escolha = palco_do_escopo.diferenca(canal.para_dict(), corte.para_dict())
    assert escolha == {"cards": {"zona_no_cheio": {"x": 96, "y": 300, "w": 1100, "h": 480}}}
    assert palco_do_escopo.aplicar(canal, escolha).cards.zona_no_cheio == (96, 300, 1100, 480)


def test_o_escopo_pode_tirar_a_caixa_que_o_canal_tem():
    canal = mesclar(PADRAO, {"cards": {"zona_no_cheio": {"x": 96, "y": 300, "w": 520, "h": 480}}})
    corte = mesclar(canal, {"cards": {"zona_no_cheio": {"x": 0, "y": 0, "w": 0, "h": 0}}})
    escolha = palco_do_escopo.diferenca(canal.para_dict(), corte.para_dict())
    assert palco_do_escopo.aplicar(canal, escolha).cards.zona_no_cheio is None
