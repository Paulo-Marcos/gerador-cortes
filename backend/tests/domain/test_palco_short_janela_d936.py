"""D-936: a prévia do short desenha as janelas pelo que o vídeo ocupa no render."""

from __future__ import annotations

from app.domain.short.palco_short import Ajuste, Recorte, Slot, escalar


def _recorte(ajuste: Ajuste) -> Recorte:
    tela = {"x": 0, "y": 0, "w": 1325, "h": 720}
    slot = Slot(x=0, y=352, w=1080, h=608, ajuste=ajuste)
    return Recorte("tela", tela, slot, escalar(tela, slot))


def test_o_desenho_leva_a_janela_do_render():
    recorte = _recorte(Ajuste.CABER)
    assert recorte.desenho["janela"] == recorte.janela


def test_em_caber_a_janela_e_menor_que_o_slot_pela_tarja():
    """Era a divergência: a prévia usava o slot (608 de altura), o PNG a janela."""
    desenho = _recorte(Ajuste.CABER).desenho
    assert desenho["recorta"]["h"] == 608
    assert desenho["janela"] == {"x": 0, "y": 363, "w": 1080, "h": 586}


def test_em_cobrir_janela_e_slot_coincidem():
    desenho = _recorte(Ajuste.COBRIR).desenho
    assert desenho["janela"] == desenho["recorta"]
