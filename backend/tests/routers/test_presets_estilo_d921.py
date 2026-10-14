"""D-921: o preset de palco lembra o estilo em que foi montado.

Parcial (RN-10): o preset que não declara estilo continua sem a chave — vale como
o estilo de sempre para quem lê —, e só os tipos de palco a guardam.
"""

import pytest
from app.routers.presets import _normalizar_payload


@pytest.mark.parametrize("tipo", ["posicionamento", "posicionamento_full", "palco_short"])
def test_preset_de_palco_guarda_o_estilo_declarado(tipo):
    assert _normalizar_payload(tipo, {"estilo": "limpo"})["estilo"] == "limpo"


@pytest.mark.parametrize("tipo", ["posicionamento", "posicionamento_full", "palco_short"])
def test_preset_sem_estilo_ou_com_estilo_invalido_nao_ganha_a_chave(tipo):
    assert "estilo" not in _normalizar_payload(tipo, {})
    assert "estilo" not in _normalizar_payload(tipo, {"estilo": "neon"})


def test_preset_de_gancho_nao_tem_estilo_de_palco():
    assert "estilo" not in _normalizar_payload("gancho_short", {"estilo": "limpo"})


@pytest.mark.parametrize("tipo", ["posicionamento", "palco_short"])
def test_preset_de_palco_leva_o_palco_do_tipo_sem_a_imagem_d923(tipo):
    palco = {"cabecalho": {"mostrar_nome": False, "imagem": "x.png"}, "contorno_short": 0}
    salvo = _normalizar_payload(tipo, {"estilo": "limpo", "palco": palco})["palco"]
    assert salvo["cabecalho"]["mostrar_nome"] is False
    assert "imagem" not in salvo["cabecalho"]
    assert salvo["contorno_short"] == 0
    assert "palco" not in _normalizar_payload("gancho_short", {"palco": palco})
