"""D-1017 (RN-35): a marca da IA só entra se a citação existir naquele ponto da fala.

Hoje, citação que não bate não muda nada: a borda fica no tempo que a IA disse e
ninguém fica sabendo. Em 12 cortes reais, 3,6% das bordas citadas estavam assim.
"""

from __future__ import annotations

from app.domain.corte.ancora_match import (
    RECUSA_CITACAO_NAO_CONFERE,
    ancorar_borda,
    recusa_da_citacao,
)

_FALA = "a gloriosa classe media de varios paises nao tem como pagar essa conta agora".split()
PALAVRAS = [{"texto": p, "inicio_seg": 100.0 + i * 0.5} for i, p in enumerate(_FALA)]


def _marca(**campos) -> dict:
    return {"inicio_seg": 100.0, "fim_seg": 106.0, "motivo": "tangente", **campos}


def test_citacao_que_existe_nos_dois_lados_passa():
    marca = _marca(inicio_texto="a gloriosa classe", fim_texto="essa conta agora")
    assert recusa_da_citacao(marca, PALAVRAS) is None


def test_marca_sem_citacao_passa_como_antes():
    # O corpo da skill é do canal: recusar aqui riscaria tudo num canal que não peça citação.
    assert recusa_da_citacao(_marca(), PALAVRAS) is None


def test_citacao_so_de_espacos_conta_como_sem_citacao():
    assert recusa_da_citacao(_marca(inicio_texto="  ", fim_texto=""), PALAVRAS) is None


def test_citacao_do_inicio_que_nao_existe_e_recusada():
    marca = _marca(inicio_texto="ninguem disse isso aqui", fim_texto="essa conta agora")
    assert recusa_da_citacao(marca, PALAVRAS) == RECUSA_CITACAO_NAO_CONFERE


def test_citacao_do_fim_que_nao_existe_e_recusada():
    marca = _marca(inicio_texto="a gloriosa classe", fim_texto="ninguem disse isso aqui")
    assert recusa_da_citacao(marca, PALAVRAS) == RECUSA_CITACAO_NAO_CONFERE


def test_citacao_certa_longe_do_tempo_da_marca_e_recusada():
    # O caso real: o texto existe, mas o tempo e o texto discordam em mais de 5 s.
    marca = _marca(inicio_seg=120.0, fim_seg=126.0, inicio_texto="a gloriosa classe")
    assert recusa_da_citacao(marca, PALAVRAS) == RECUSA_CITACAO_NAO_CONFERE


def test_um_lado_so_citado_confere_esse_lado():
    assert recusa_da_citacao(_marca(inicio_texto="a gloriosa classe"), PALAVRAS) is None
    assert (
        recusa_da_citacao(_marca(fim_texto="ninguem disse isso aqui"), PALAVRAS)
        == RECUSA_CITACAO_NAO_CONFERE
    )


def test_sem_palavras_nao_ha_o_que_conferir():
    # Transcrição legada, sem tempo por palavra: recusar aqui jogaria tudo fora.
    assert recusa_da_citacao(_marca(), []) is None
    assert recusa_da_citacao(_marca(inicio_texto="ninguem disse isso"), []) is None


def test_citacao_so_de_pontuacao_conta_como_sem_citacao():
    assert recusa_da_citacao(_marca(inicio_texto="..."), PALAVRAS) is None


def test_frase_repetida_o_fim_fica_na_ocorrencia_certa():
    # "sobe todo ano" duas vezes: a marca acaba na primeira, e a âncora não pode puxá-la.
    fala = "o imposto sobe todo ano o imposto sobe todo ano e acabou".split()
    palavras = [{"texto": p, "inicio_seg": 30.0 + i * 0.4} for i, p in enumerate(fala)]
    fim_da_primeira = palavras[5]["inicio_seg"]

    fim = ancorar_borda(
        "o imposto sobe todo ano", fim_da_primeira, palavras, janela_seg=5.0, is_inicio=False
    )

    assert fim == fim_da_primeira
