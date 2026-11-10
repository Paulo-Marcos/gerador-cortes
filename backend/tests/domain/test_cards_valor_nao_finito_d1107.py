"""D-1107: infinito e NaN na leitura tolerante do banco viram "ignorado", não derrubam o render."""

from __future__ import annotations

import pytest
from app.domain.canal import cards_do_canal as cards

NAO_FINITOS = [float("inf"), float("-inf"), float("nan"), "inf", "nan", "-Infinity"]


@pytest.mark.parametrize("lixo", NAO_FINITOS)
def test_largura_do_texto_nao_finita_mantem_a_atual(lixo):
    novo = cards.mesclar(
        cards.Cards(largura_do_texto=900), {"largura_do_texto": lixo}, tolerante=True
    )
    assert novo.largura_do_texto == 900


@pytest.mark.parametrize("lixo", NAO_FINITOS)
def test_caixa_do_cheio_com_valor_nao_finito_mantem_a_atual(lixo):
    atual = cards.Cards(zona_no_cheio=(10, 20, 300, 300))
    novo = cards.mesclar(
        atual, {"zona_no_cheio": {"x": 10, "y": 20, "w": lixo, "h": 300}}, tolerante=True
    )
    assert novo.zona_no_cheio == (10, 20, 300, 300)
