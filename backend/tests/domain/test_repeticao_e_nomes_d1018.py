"""D-1018: a frase que volta não se confunde com a repetição, e nome curto continua sendo nome."""

import json

import pytest
from app.domain.corte.ancora_da_cena import seguir_recorte
from app.domain.corte.origem_da_cena import conferir_cenas


def _transcricao(palavras: list[str]) -> list[dict]:
    com_tempo = [{"texto": p, "inicio_seg": 2.0 + i} for i, p in enumerate(palavras)]
    return [{"start": 2.0, "end": 2.0 + len(palavras), "texto": "", "palavras": com_tempo}]


def _seguir(cenas: list[dict], antiga: list[dict], nova: list[dict]) -> list[dict]:
    saida = seguir_recorte(json.dumps(cenas), json.dumps(antiga), nova)
    return cenas if saida is None else json.loads(saida)


def test_frase_que_volta_nao_pula_para_a_repeticao_que_vem_antes():
    # A repetição que já estava no corte vem ANTES do trecho que volta: sem separar o que
    # acabou de entrar, a busca pararia nela.
    frase = ["a", "agenda", "dela", "é", "agenda", "do", "crime", "organizado"]
    comeco = [f"antes{i}" for i in range(10)]
    meio = [f"meio{i}" for i in range(10)]
    fim = [f"fim{i}" for i in range(6)]
    completa = _transcricao(comeco + frase + meio + frase + fim)
    cortada = _transcricao(comeco + frase + meio + fim)
    inicio_da_segunda = 2.0 + len(comeco) + len(frase) + len(meio)
    cena = {
        "tipo": "enfase",
        "texto": "T",
        "inicio": inicio_da_segunda,
        "fim": inicio_da_segunda + 5,
    }

    perdida = _seguir([cena], completa, cortada)
    assert perdida[0]["ancora_perdida"] is True

    de_volta = _seguir(perdida, cortada, completa)
    assert de_volta[0]["inicio"] == inicio_da_segunda
    assert "ancora_perdida" not in de_volta[0]


def _codigos(autor: str, quem_disse: str) -> list[str]:
    frase = "a verdade é o todo e sempre foi assim"
    cena = {
        "tipo": "citacao_autor",
        "inicio": 12.0,
        "fim": 18.0,
        "texto": frase,
        "autor": autor,
        "frase_da_fala": frase,
        "quem_disse": quem_disse,
    }
    palavras = [{"texto": p, "inicio_seg": 10.0 + i} for i, p in enumerate(frase.split())]
    fala = [{"start": 10.0, "end": 30.0, "texto": frase, "palavras": palavras}]
    return [aviso["codigo"] for aviso in conferir_cenas([cena], fala)]


@pytest.mark.parametrize(
    ("autor", "quem_disse"),
    [
        ("Lao Tsé", "Lao Tsé"),
        ("Mao", "Mao"),
        ("Rui Paz", "Rui Paz"),
        ("Ana", "Ana Lima"),
        ("Bia", "Bia"),
    ],
)
def test_nome_curto_e_o_mesmo_nome(autor, quem_disse):
    assert _codigos(autor, quem_disse) == []


@pytest.mark.parametrize(
    ("autor", "quem_disse"),
    [("João de Souza", "Maria de Lima"), ("Ana dos Santos", "Rui dos Reis"), ("Mao", "Lao Tsé")],
)
def test_conectivo_nao_faz_de_duas_pessoas_a_mesma(autor, quem_disse):
    assert _codigos(autor, quem_disse) == ["autor_nao_e_quem_disse"]


@pytest.mark.parametrize("tipo", [None, ["lista"], 7])
def test_tipo_fora_do_formato_com_frase_nao_derruba_a_conferencia(tipo):
    cena = {"tipo": tipo, "inicio": 3.0, "fim": 5.0, "frase_da_fala": "uma frase"}
    assert isinstance(conferir_cenas([cena], _transcricao(["uma", "frase"])), list)
