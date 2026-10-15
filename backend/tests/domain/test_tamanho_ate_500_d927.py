"""D-927: o tamanho dos componentes do palco e dos cards vai de 25% a 500%."""

from __future__ import annotations

import pytest
from app.domain.canal import cards_do_canal as cards
from app.domain.canal import palco_componentes as pc


@pytest.mark.parametrize("parte", ["cabecalho", "placa"])
def test_componente_aceita_ate_500_porcento(parte):
    novo = pc.mesclar(pc.PADRAO, {parte: {"escala": 4.5}})
    assert getattr(novo, parte).escala == 4.5
    assert getattr(pc.mesclar(pc.PADRAO, {parte: {"escala": 9}}), parte).escala == 5.0
    assert getattr(pc.mesclar(pc.PADRAO, {parte: {"escala": 0.1}}), parte).escala == 0.25


def test_cards_aceitam_ate_500_porcento():
    assert cards.mesclar(cards.Cards(), {"escala": 3.2}).escala == 3.2
    assert cards.mesclar(cards.Cards(), {"escala": 9}).escala == 5.0
    assert cards.mesclar(cards.Cards(), {"escala": 0.1}).escala == 0.25
