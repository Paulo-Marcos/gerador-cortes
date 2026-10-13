"""D-911: só o insert do estilo limpo ganha máscara de canto no FFmpeg."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from app.domain.short.arranjo_short import Arranjo, Disposicao, ModoPalco, montar_modelo
from app.domain.short.palco_short import montar_plano
from app.services.render import palco_do_short as modulo
from PIL import Image

REGIOES = {
    "pessoa": {"x": 0, "y": 0, "w": 400, "h": 300},
    "tela": {"x": 400, "y": 0, "w": 800, "h": 450},
}


def _plano(disposicao: Disposicao):
    arranjo = Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=disposicao)
    return montar_plano(montar_modelo(arranjo, REGIOES), REGIOES)


@pytest.fixture
def canal(monkeypatch, tmp_path: Path):
    estado = SimpleNamespace(estilo="limpo", eco_no_short=False, contorno_short=32)
    monkeypatch.setattr(modulo.palco_componentes, "ler", lambda: estado)
    monkeypatch.setattr(modulo, "pasta_das_mascaras", lambda: tmp_path)
    return estado


def test_insert_no_limpo_ganha_mascara_do_tamanho_da_janela(canal):
    plano = _plano(Disposicao.INSERT)
    mascaras = modulo.moldes_do_short({"plano": plano, "moldura": "palco"})
    assert list(mascaras) == [1]
    janela = plano.recortes[1].janela
    assert mascaras[1].buraco is None
    assert Image.open(mascaras[1].mascara).size == (janela["w"], janela["h"])


def test_estilo_atual_nao_ganha_mascara(canal):
    canal.estilo = "atual"
    assert modulo.moldes_do_short({"plano": _plano(Disposicao.INSERT), "moldura": "palco"}) == {}


def test_sem_moldura_nao_ganha_mascara(canal):
    assert modulo.moldes_do_short({"plano": _plano(Disposicao.INSERT), "moldura": "nenhuma"}) == {}


def test_sem_plano_nao_ganha_mascara(canal):
    assert modulo.moldes_do_short({"plano": None, "moldura": "palco"}) == {}


def test_fundo_do_quadro_e_a_cor_do_canal_sem_eco(canal):
    palco = {"plano": _plano(Disposicao.INSERT), "moldura": "palco", "fundo": "#112233"}
    assert modulo.fundo_do_quadro(palco) == "0x112233"


def test_fundo_do_quadro_e_o_eco_quando_o_canal_pede(canal):
    canal.eco_no_short = True
    palco = {"plano": _plano(Disposicao.INSERT), "moldura": "palco", "fundo": "#112233"}
    assert modulo.fundo_do_quadro(palco) == "eco"
    # Sem palco (moldura desligada) ou sem plano, volta a cor.
    assert modulo.fundo_do_quadro({**palco, "moldura": "nenhuma"}) == "0x112233"
    assert modulo.fundo_do_quadro({**palco, "plano": None}) == "0x112233"


def test_com_eco_toda_janela_e_aparada_ao_contorno_com_cantos(canal):
    canal.eco_no_short = True
    plano = _plano(Disposicao.EMPILHADA)
    moldes = modulo.moldes_do_short({"plano": plano, "moldura": "palco"})
    assert sorted(moldes) == [0, 1]
    for indice, molde in moldes.items():
        janela = plano.recortes[indice].janela
        buraco = molde.buraco
        # O buraco fica dentro da janela, e a máscara tem o tamanho dele.
        assert janela["x"] <= buraco["x"] and buraco["x"] + buraco["w"] <= janela["x"] + janela["w"]
        assert janela["y"] <= buraco["y"] and buraco["y"] + buraco["h"] <= janela["y"] + janela["h"]
        assert Image.open(molde.mascara).size == (buraco["w"], buraco["h"])
    # A janela de baixo encosta em três bordas: recua o contorno inteiro delas.
    baixo = moldes[1].buraco
    assert baixo["x"] == 32 and baixo["x"] + baixo["w"] == 1080 - 32
