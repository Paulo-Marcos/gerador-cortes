"""Riscar ou trazer de volta uma cena desfaz a validação do plano (D-1070, D-1030/D-1046).

A Pós grava a cena riscada com `riscada: true`, em vez de apagá-la, e a cena trazida de
volta sem a marca. As duas são mudança nas cenas, e salvar cenas diferentes já desfaz a
marca de validadas. Os testes prendem que a marca nova não escapa da comparação e chega
intacta ao banco, junto com a `manual`.
"""

import json
from types import SimpleNamespace

from app.services.corte import _aplicar_cenas


def _corte(cenas: list) -> SimpleNamespace:
    return SimpleNamespace(
        inicio_seg=0.0,
        fim_seg=60.0,
        cenas_remotion=json.dumps(cenas),
        cenas_validadas=1,
        cenas_validadas_em="2026-11-06T10:00:00",
    )


CENA = {"tipo": "enfase", "inicio": 2.0, "fim": 6.0, "texto": "Tese"}


def test_riscar_uma_cena_desfaz_a_validacao_e_grava_a_marca():
    corte = _corte([CENA])

    _aplicar_cenas(corte, [{**CENA, "riscada": True}])

    assert corte.cenas_validadas == 0
    assert corte.cenas_validadas_em is None
    assert json.loads(corte.cenas_remotion)[0]["riscada"] is True


def test_trazer_de_volta_desfaz_a_validacao_e_tira_a_marca():
    corte = _corte([{**CENA, "riscada": True}])

    _aplicar_cenas(corte, [CENA])

    assert corte.cenas_validadas == 0
    assert "riscada" not in json.loads(corte.cenas_remotion)[0]


def test_salvar_as_mesmas_cenas_mantem_a_validacao():
    """O controle: sem mudança, a marca fica."""
    corte = _corte([{**CENA, "riscada": True, "manual": True}])

    _aplicar_cenas(corte, [{**CENA, "riscada": True, "manual": True}])

    assert corte.cenas_validadas == 1
    assert json.loads(corte.cenas_remotion)[0]["manual"] is True
