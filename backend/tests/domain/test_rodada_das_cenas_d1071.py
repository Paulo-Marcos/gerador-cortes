"""A regra da rodada das cenas, pura: qual fica guardada e o diff entre as duas (D-1071, RN-37)."""

from __future__ import annotations

import json
from datetime import datetime

from app.domain.corte.rodada_das_cenas import (
    RodadaDasCenas,
    anterior_depois_de_gerar,
    comparar_rodadas,
    versao_das_rodadas,
)

_ENFASE = {"tipo": "enfase", "texto": "Tese", "inicio": 10.0, "fim": 13.0}
_FICHA = {"tipo": "ficha_biografica", "texto": "Nietzsche", "inicio": 25.0, "fim": 28.0}
_CITACAO = {"tipo": "citacao_autor", "texto": "Deus está morto", "inicio": 40.0, "fim": 44.0}


def _rodada(cenas: list, origem: str | None = "claude") -> RodadaDasCenas:
    return RodadaDasCenas(
        cenas=json.dumps({"formato": "cortes", "cenas": cenas}),
        origem=origem,
        gerada_em=datetime(2026, 11, 6, 10, 0),
        validadas=False,
        validadas_em=None,
    )


def test_a_rodada_com_cenas_vira_a_anterior():
    atual, guardada = _rodada([_ENFASE]), _rodada([_FICHA], "gemini")

    assert anterior_depois_de_gerar(atual, guardada) is atual


def test_o_plano_vazio_nao_apaga_a_anterior_guardada():
    guardada = _rodada([_FICHA], "gemini")

    assert anterior_depois_de_gerar(_rodada([]), guardada) is guardada
    assert anterior_depois_de_gerar(_rodada([]), None) is None


def test_payload_fora_do_formato_e_plano_vazio():
    estragada = RodadaDasCenas("{nao e json", "manual", None, False, None)

    assert estragada.lista() == []
    assert anterior_depois_de_gerar(estragada, None) is None


def test_o_diff_diz_o_que_entrou_o_que_saiu_e_o_que_mudou():
    ficha_nova = {**_FICHA, "texto": "Friedrich Nietzsche"}

    diff = comparar_rodadas([_ENFASE, ficha_nova], [_FICHA, _CITACAO])

    assert [c["tipo"] for c in diff["entraram"]] == ["enfase"]
    assert [c["tipo"] for c in diff["sairam"]] == ["citacao_autor"]
    assert len(diff["mudaram"]) == 1
    mudou = diff["mudaram"][0]
    assert mudou["campos"] == ["texto"]
    assert mudou["atual"]["texto"] == "Friedrich Nietzsche"
    assert mudou["anterior"]["texto"] == "Nietzsche"


def test_a_cena_igual_nao_aparece_no_diff():
    assert comparar_rodadas([_ENFASE], [dict(_ENFASE)]) == {
        "entraram": [],
        "sairam": [],
        "mudaram": [],
    }


def test_o_mesmo_instante_escrito_de_outro_jeito_e_a_mesma_cena():
    """`inicio` e `inicio_seg` são o mesmo tempo: a normalização evita mudança falsa."""
    em_segundos = {"tipo": "enfase", "texto": "Tese", "inicio_seg": 10.0, "fim_seg": 13.0}

    assert comparar_rodadas([em_segundos], [_ENFASE])["mudaram"] == []


def test_campo_que_a_regra_nao_conhece_conta_como_mudanca():
    """A cena é opaca: um campo novo do roteiro aparece sem esta regra saber o que é."""
    marcada = {**_ENFASE, "campo_novo_qualquer": True}

    diff = comparar_rodadas([marcada], [_ENFASE])

    assert diff["mudaram"][0]["campos"] == ["campo_novo_qualquer"]


def test_cenas_repetidas_no_mesmo_instante_pareiam_na_ordem():
    outra = {**_ENFASE, "texto": "Outra"}

    diff = comparar_rodadas([_ENFASE, outra, _ENFASE], [_ENFASE, outra])

    assert diff["mudaram"] == []
    assert diff["sairam"] == []
    assert [c["texto"] for c in diff["entraram"]] == ["Tese"]


def test_sem_rodada_anterior_tudo_entrou():
    diff = comparar_rodadas([_ENFASE, _FICHA], [])

    assert len(diff["entraram"]) == 2 and diff["sairam"] == [] and diff["mudaram"] == []


def test_a_versao_muda_quando_qualquer_rodada_muda():
    atual, anterior = json.dumps([_ENFASE]), json.dumps([_FICHA])
    base = versao_das_rodadas(atual, anterior)

    assert versao_das_rodadas(atual, anterior) == base
    assert versao_das_rodadas(json.dumps([_FICHA]), anterior) != base
    assert versao_das_rodadas(atual, None) != base
    assert versao_das_rodadas(anterior, atual) != base
