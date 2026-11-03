"""D-1030: a fala da cena pode cruzar duas emendas e ainda assim ter saído por recorte.

Corte real tem emendas a cada poucos segundos. Palavras vizinhas na transcrição final podem
não ser vizinhas na live, então procurar só as 8 palavras da cena deixava passar o recorte.
"""

import json
from unittest.mock import patch

from app.domain.corte import ancora_da_cena
from app.domain.corte.ancora_da_cena import seguir_recorte

_LIVE = [f"p{i}" for i in range(200)]


def _transcricao(palavras: list[str]) -> list[dict]:
    com_tempo = [{"texto": p, "inicio_seg": 2.0 + i} for i, p in enumerate(palavras)]
    return [{"start": 2.0, "end": 2.0 + len(palavras), "texto": "", "palavras": com_tempo}]


def _cena(inicio: float) -> dict:
    return {"tipo": "enfase", "texto": "T", "inicio": inicio, "fim": inicio + 2}


def _seguir(cenas: list[dict], antiga: list[str], nova: list[str], live: list[str]) -> list[dict]:
    saida = seguir_recorte(
        json.dumps(cenas), json.dumps(_transcricao(antiga)), _transcricao(nova), _transcricao(live)
    )
    assert saida is not None
    return json.loads(saida)


def test_fala_que_cruza_duas_emendas_e_sai_ainda_e_recorte():
    # Ilhas de 3 palavras sob a cena: nenhum trecho de 4 seguidas existe na live.
    ilhas = _LIVE[10:13] + _LIVE[30:33] + _LIVE[50:53]
    depois = _LIVE[70:110]
    cenas = _seguir([_cena(2.0 + 1)], ilhas + depois, depois, _LIVE)
    assert cenas[0]["ancora_perdida"] is True


def test_cena_na_ultima_palavra_do_corte_ainda_e_recorte():
    antes = _LIVE[70:110]
    ilhas = _LIVE[10:13] + _LIVE[30:33] + _LIVE[50:53]
    inicio = 2.0 + len(antes) + len(ilhas) - 1
    cenas = _seguir([_cena(inicio)], antes + ilhas, antes, _LIVE)
    assert cenas[0]["ancora_perdida"] is True


def test_transcricao_refeita_em_volta_da_cena_continua_sem_acusar():
    refeita = [f"outra{i}" for i in range(200)]
    antiga = _LIVE[:60]
    cenas = _seguir([_cena(30.0)], antiga, refeita[:60], refeita)
    assert "ancora_perdida" not in cenas[0]
    assert cenas[0]["inicio"] == 30.0


def test_uma_palavra_comum_nao_faz_passar_por_recorte():
    # Só a primeira palavra da fala ainda existe na live: exige o trecho inteiro, não uma parte.
    antiga = ["comum"] + [f"velha{i}" for i in range(60)]
    live = ["comum"] + [f"nova{i}" for i in range(60)]
    cenas = _seguir([_cena(2.0 + 5)], antiga, live, live)
    assert "ancora_perdida" not in cenas[0]


def test_palavra_da_live_com_texto_nao_textual_nao_derruba():
    live = _transcricao(_LIVE)
    live[0]["palavras"][0]["texto"] = 7
    saida = seguir_recorte(
        json.dumps([_cena(30.0)]),
        json.dumps(_transcricao(_LIVE[:60])),
        _transcricao(_LIVE[:5]),
        live,
    )
    assert json.loads(saida)[0]["ancora_perdida"] is True


def test_nao_monta_os_trechos_da_live_quando_nenhuma_cena_perdeu_a_fala():
    # A live pode ter 100 mil palavras, e o lote roda isto em cada corte.
    with patch.object(ancora_da_cena, "_trechos_da_live") as montar:
        seguir_recorte(
            json.dumps([_cena(30.0)]),
            json.dumps(_transcricao(_LIVE[:60])),
            _transcricao(_LIVE[:2] + _LIVE[5:60]),
            _transcricao(_LIVE),
        )
    montar.assert_not_called()


def test_monta_os_trechos_da_live_uma_vez_so():
    with patch.object(ancora_da_cena, "_trechos_da_live", return_value=set()) as montar:
        seguir_recorte(
            json.dumps([_cena(30.0), _cena(40.0)]),
            json.dumps(_transcricao(_LIVE[:60])),
            _transcricao(_LIVE[:5]),
            _transcricao(_LIVE),
        )
    montar.assert_called_once()
