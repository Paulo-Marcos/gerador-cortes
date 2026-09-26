"""A cena que a IA devolve vira a cena gravada (D-716).

Teste de caracterização, antes de fatiar `_converter_startleg` (complexidade
36, 18 ramos sem teste). Fixa o que a conversão faz: o tempo vem do `startLeg`,
os campos conhecidos passam, os padrões de layout entram quando faltam, e cada
tipo de cena aceita os nomes alternativos que a IA às vezes usa — com as
nuances de cada um: o número do destaque preserva int/float, a ficha só aceita
nome não vazio. O `startLeg` é resolvido por outro método, trocado aqui pela
identidade para isolar a conversão.
"""

import pytest
from app.services.cenas_remotion import CenasRemotionService

converter = CenasRemotionService._converter_startleg


@pytest.fixture(autouse=True)
def _startleg_e_o_segundo(monkeypatch):
    monkeypatch.setattr(
        CenasRemotionService, "_resolver_startleg", staticmethod(lambda leg, _t: float(leg))
    )


def _uma(cena: dict) -> dict:
    (convertida,) = converter([cena], [])
    return convertida


def test_tempo_campos_conhecidos_e_ordem_por_inicio():
    cenas = converter(
        [
            {"tipo": "barra_inferior", "startLeg": 20, "duracao_s": 3, "texto": "B", "extra": 1},
            {"startLeg": 5, "texto": "A", "cor": None},
        ],
        [],
    )

    assert [c["inicio"] for c in cenas] == [5.0, 20.0]
    assert cenas[0] == {
        "tipo": "barra_inferior",
        "inicio": 5.0,
        "fim": 10.0,
        "texto": "A",
        "layout_card": "auto",
        "sombra_nivel": "auto",
        "modelo_cena": "card",
    }
    assert cenas[1]["fim"] == 23.0 and "extra" not in cenas[1]


def test_o_mascote_legado_vira_as_chaves_novas():
    convertida = _uma({"startLeg": 0, "sapoMood": "feliz", "sapoPosicao": "direita"})

    assert (convertida["mascotMood"], convertida["mascotPosicao"]) == ("feliz", "direita")


@pytest.mark.parametrize(
    ("cena", "modelo"),
    [
        ({"tipo": "tela_cheia", "modelo_cena": "faixa"}, "card"),
        ({"modelo_cena": "auto"}, "card"),
        ({"modelo_cena": ""}, "card"),
        ({"modelo_cena": "faixa"}, "faixa"),
    ],
)
def test_modelo_da_cena(cena, modelo):
    assert _uma({"startLeg": 0, **cena})["modelo_cena"] == modelo


def test_layout_e_sombra_escolhidos_ficam():
    convertida = _uma({"startLeg": 0, "layout_card": "vertical", "sombra_nivel": "forte"})

    assert (convertida["layout_card"], convertida["sombra_nivel"]) == ("vertical", "forte")


@pytest.mark.parametrize(
    ("cena", "numero"),
    [
        ({"valor": 45.7}, 45.7),
        ({"data": " 15/09/1850 "}, "15/09/1850"),
        ({"stat": 3, "valor": 9}, 9),
        ({"numero": "12%", "valor": 99}, "12%"),
    ],
)
def test_o_destaque_aceita_nomes_alternativos_para_o_numero(cena, numero):
    assert _uma({"startLeg": 0, "tipo": "destaque_numerico", **cena})["numero"] == numero


@pytest.mark.parametrize(
    ("cena", "fonte"),
    [
        ({"referencia": "IBGE"}, "IBGE"),
        ({"source": 2024}, "2024"),
        ({"ref": "x", "fonte": "Folha"}, "Folha"),
    ],
)
def test_a_fonte_aceita_nomes_alternativos(cena, fonte):
    assert _uma({"startLeg": 0, "tipo": "fonte_referencia", **cena})["fonte"] == fonte


def test_a_fonte_sem_nenhum_nome_fica_sem_fonte():
    assert "fonte" not in _uma({"startLeg": 0, "tipo": "fonte_referencia"})


def test_a_chamada_final_aceita_nomes_alternativos():
    convertida = _uma({"startLeg": 0, "tipo": "chamada_final", "headline": "Inscreva", "botao": 7})

    assert (convertida["texto"], convertida["subtexto"]) == ("Inscreva", "7")


def test_a_chamada_final_nao_troca_o_que_veio_certo():
    convertida = _uma(
        {
            "startLeg": 0,
            "tipo": "chamada_final",
            "texto": "T",
            "subtexto": "S",
            "titulo": "outro",
            "cta": "outro",
        }
    )

    assert (convertida["texto"], convertida["subtexto"]) == ("T", "S")


def test_o_marco_historico_aceita_nomes_alternativos():
    convertida = _uma({"startLeg": 0, "tipo": "marco_historico", "title": "Queda", "data": 1989})

    assert (convertida["texto"], convertida["subtexto"]) == ("Queda", "1989")


def test_o_marco_historico_sem_alternativos_fica_como_veio():
    convertida = _uma({"startLeg": 0, "tipo": "marco_historico", "texto": "T"})

    assert convertida["texto"] == "T" and "subtexto" not in convertida


@pytest.mark.parametrize(
    ("cena", "nome"),
    [
        ({"nome_exibicao": "", "nomeConhecido": "Marx"}, "Marx"),
        ({"nomeExibicao": "Hegel"}, "Hegel"),
        ({"nome_curto": "Kant", "nome_exibicao": "outro"}, "Kant"),
    ],
)
def test_a_ficha_so_aceita_nome_alternativo_nao_vazio(cena, nome):
    assert _uma({"startLeg": 0, "tipo": "ficha_biografica", **cena})["nome_curto"] == nome


def test_listas_de_marcos_e_itens_so_passam_com_conteudo():
    convertida = _uma({"startLeg": 0, "marcos": [{"ano": 1}], "itens": []})

    assert convertida["marcos"] == [{"ano": 1}] and "itens" not in convertida


def test_a_chamada_final_sem_nenhum_nome_alternativo_fica_sem_texto():
    convertida = _uma({"startLeg": 0, "tipo": "chamada_final"})

    assert "texto" not in convertida and "subtexto" not in convertida


def test_o_marco_com_subtexto_e_sem_alternativos_mantem_o_subtexto():
    convertida = _uma({"startLeg": 0, "tipo": "marco_historico", "subtexto": "S"})

    assert convertida["subtexto"] == "S" and "texto" not in convertida
