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
    estado = SimpleNamespace(estilo="limpo")
    monkeypatch.setattr(modulo.palco_componentes, "ler", lambda: estado)
    monkeypatch.setattr(modulo, "pasta_das_mascaras", lambda: tmp_path)
    return estado


def test_insert_no_limpo_ganha_mascara_do_tamanho_da_janela(canal):
    plano = _plano(Disposicao.INSERT)
    mascaras = modulo.mascaras_do_insert({"plano": plano, "moldura": "palco"})
    assert list(mascaras) == [1]
    janela = plano.recortes[1].janela
    assert Image.open(mascaras[1]).size == (janela["w"], janela["h"])


def test_estilo_atual_nao_ganha_mascara(canal):
    canal.estilo = "atual"
    assert modulo.mascaras_do_insert({"plano": _plano(Disposicao.INSERT), "moldura": "palco"}) == {}


def test_sem_moldura_nao_ganha_mascara(canal):
    assert (
        modulo.mascaras_do_insert({"plano": _plano(Disposicao.INSERT), "moldura": "nenhuma"}) == {}
    )


def test_sem_plano_nao_ganha_mascara(canal):
    assert modulo.mascaras_do_insert({"plano": None, "moldura": "palco"}) == {}
