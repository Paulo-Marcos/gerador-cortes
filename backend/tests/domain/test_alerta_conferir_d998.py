"""D-998: o alerta "conferir" aponta um trecho que FICA no corte.

Quando a dúvida factual virava desvio (`imprecisao`), o trecho saía do corte e o
operador desfez 77% deles (D-989). O alerta é um canal separado: a resposta da
trechos-expert se divide em desvios (saem) e alertas (ficam), e o que calcula
o corte só recebe os desvios.
"""

import pytest
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte.alerta_conferir import (
    alerta_de_trecho,
    alertas_da_resposta,
    alertas_gravados,
    marcar_conferido,
    somar_alertas,
)
from app.domain.corte.segment_calculator import calcular_segmentos, duracao_liquida

_REPETICAO = {
    "inicio_hms": "00:00:30",
    "fim_hms": "00:00:40",
    "categoria": "repeticao",
    "motivo": "repete a tese",
}
_CONFERIR = {"inicio_hms": "00:01:00", "fim_hms": "00:01:10", "motivo": "cita 40% sem fonte"}


def test_alerta_da_resposta_nao_entra_nos_desvios_nem_no_liquido():
    desvios, alertas = alertas_da_resposta(
        {"desvios": [_REPETICAO], "conferir": [_CONFERIR]}, "claude"
    )

    assert desvios == [_REPETICAO]
    assert [(a["inicio_seg"], a["fim_seg"]) for a in alertas] == [(60.0, 70.0)]
    # Só a repetição sai: os 10 s do alerta continuam no vídeo.
    assert duracao_liquida(0.0, 120.0, desvios) == 110.0
    assert calcular_segmentos(0.0, 120.0, desvios) == [
        {"start": 0.0, "end": 30.0},
        {"start": 40.0, "end": 120.0},
    ]


def test_imprecisao_proposta_como_desvio_vira_alerta_e_o_trecho_fica():
    """Skill anterior à v8 ainda manda `imprecisao` em `desvios`."""
    imprecisao = {
        "inicio_hms": "00:00:50",
        "fim_hms": "00:00:55",
        "categoria": "imprecisao",
        "motivo": "Possível imprecisão — data trocada",
    }

    desvios, alertas = alertas_da_resposta({"desvios": [_REPETICAO, imprecisao]}, "gemini")

    assert desvios == [_REPETICAO]
    assert len(alertas) == 1
    assert alertas[0]["motivo"] == "Possível imprecisão — data trocada"
    assert alertas[0]["origem"] == "gemini"
    assert duracao_liquida(0.0, 120.0, desvios) == 110.0


def test_alerta_nasce_pendente_com_id_das_bordas():
    alerta = alerta_de_trecho(_CONFERIR, "claude")

    assert alerta == {
        "id": "60000-70000",
        "inicio_hms": "00:01:00.000",
        "fim_hms": "00:01:10.000",
        "inicio_seg": 60.0,
        "fim_seg": 70.0,
        "motivo": "cita 40% sem fonte",
        "origem": "claude",
        "conferido": False,
    }


def test_trecho_sem_bordas_validas_nao_vira_alerta():
    assert alerta_de_trecho({"inicio_hms": "00:01:00", "motivo": "sem fim"}, "claude") is None
    assert alerta_de_trecho({"inicio_hms": "00:01:10", "fim_hms": "00:01:00"}, "claude") is None


def test_alerta_conferido_nao_volta_na_geracao_seguinte():
    conferido = {**alerta_de_trecho(_CONFERIR, "claude"), "conferido": True}
    novo = alerta_de_trecho(
        {**_CONFERIR, "inicio_hms": "00:00:05", "fim_hms": "00:00:08"}, "claude"
    )

    somados, adicionados = somar_alertas([conferido], [alerta_de_trecho(_CONFERIR, "claude"), novo])

    assert adicionados == 1
    assert [a["id"] for a in somados] == [novo["id"], conferido["id"]]
    assert somados[1]["conferido"] is True


def test_marcar_conferido_so_muda_o_alerta_pedido():
    um = alerta_de_trecho(_CONFERIR, "claude")
    outro = alerta_de_trecho(
        {**_CONFERIR, "inicio_hms": "00:00:05", "fim_hms": "00:00:08"}, "claude"
    )

    resultado = marcar_conferido([um, outro], um["id"])

    assert [a["conferido"] for a in resultado] == [True, False]
    assert um["conferido"] is False  # não muta a entrada


def test_marcar_conferido_de_alerta_inexistente_e_nao_encontrado():
    with pytest.raises(NaoEncontrado):
        marcar_conferido([], "0-1")


def test_coluna_sem_texto_le_como_lista_vazia():
    """Corte de antes da D-998 pode ter a coluna NULL."""
    assert alertas_gravados(None) == []
    assert alertas_gravados("") == []
    assert alertas_gravados('[{"id": "0-1"}]') == [{"id": "0-1"}]
