"""A invariante dos pesos do ranking, no domínio (D-762).

`validar_pesos` morava em `services/canal/ranking_settings.py` e só era testada
através do banco de settings. É regra do `PesosRanking`: sem ela o reescalonamento
0-100 divide por zero ou o decay de recência deixa de fazer sentido.
"""

from dataclasses import fields

import pytest
from app.domain.live_candidata.ranking_lives import (
    CHAVE_MEIA_VIDA,
    CHAVES_CRITERIO,
    CHAVES_PESO,
    PesosRanking,
    validar_pesos,
)


def _validos(**mudancas) -> dict:
    valores = {f.name: getattr(PesosRanking(), f.name) for f in fields(PesosRanking)}
    return {**valores, **mudancas}


def test_as_chaves_sao_os_campos_do_pesos_ranking():
    assert set(CHAVES_CRITERIO) == {f.name for f in fields(PesosRanking)}
    assert CHAVE_MEIA_VIDA not in CHAVES_PESO


def test_os_pesos_padrao_sao_validos():
    validar_pesos(_validos())


def test_um_unico_peso_positivo_basta():
    so_views = _validos(**{**dict.fromkeys(CHAVES_PESO, 0), "views": 1})

    validar_pesos(so_views)


@pytest.mark.parametrize(
    ("valores", "mensagem"),
    [
        ({k: v for k, v in _validos().items() if k != "vph"}, "Faltam critérios: vph"),
        (_validos(views="muito"), "'views' deve ser numérico"),
        (_validos(sentimento=-0.1), "'sentimento' não pode ser negativo"),
        (_validos(**dict.fromkeys(CHAVES_PESO, 0)), "Ao menos um peso"),
        (_validos(meia_vida_dias=0), "meia-vida"),
    ],
)
def test_pesos_invalidos_sao_recusados(valores, mensagem):
    with pytest.raises(ValueError, match=mensagem):
        validar_pesos(valores)
