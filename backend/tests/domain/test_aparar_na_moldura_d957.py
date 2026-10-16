"""D-957: a região do apresentador para nas linhas da moldura mais próximas do rosto."""

from __future__ import annotations

from app.domain.canal.quadros_do_apresentador import Caixa, aparar_na_moldura

ROSTO = Caixa(0.44, 0.37, 0.23, 0.4)
REGIAO = Caixa(0.2, 0.04, 0.68, 0.96)


def test_corta_na_linha_mais_proxima_do_rosto_em_cima_e_embaixo():
    # A barra do canal tem duas bordas (0,1 e 0,13); a faixa da live, 0,89 e 0,9.
    aparada = aparar_na_moldura(REGIAO, ROSTO, [0.1, 0.13, 0.89, 0.9])

    assert aparada == Caixa(0.2, 0.13, 0.68, 0.76)


def test_linha_que_cruza_o_rosto_nao_corta():
    # Uma legenda queimada sobre o queixo não é a borda da janela da câmera.
    assert aparar_na_moldura(REGIAO, ROSTO, [0.5, 0.7]) is REGIAO


def test_sem_linha_a_regiao_fica_inteira():
    assert aparar_na_moldura(REGIAO, ROSTO, []) is REGIAO


def test_so_a_faixa_de_baixo_corta_so_embaixo():
    aparada = aparar_na_moldura(REGIAO, ROSTO, [0.9])

    assert (aparada.y, aparada.y + aparada.altura) == (0.04, 0.9)
