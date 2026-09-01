"""D-463: a aritmética do enquadramento vertical.

Todo teste aqui existe porque a falha correspondente aparece como vídeo torto ou
como um ffmpeg que morre no meio do render — nunca como exceção que alguém veja
no momento do erro.
"""

from app.domain.formato_video import (
    HORIZONTAL,
    VERTICAL,
    Resolucao,
    calcular_recorte,
    filtro_reenquadrar,
)


def test_recorte_vertical_ocupa_toda_a_altura_da_origem():
    """9:16 dentro de 16:9 e limitado pela LARGURA; a altura vai inteira."""
    recorte = calcular_recorte(HORIZONTAL, VERTICAL)

    assert recorte.altura == 1080
    assert recorte.largura < HORIZONTAL.largura
    assert recorte.y == 0


def test_recorte_respeita_o_aspecto_do_destino():
    recorte = calcular_recorte(HORIZONTAL, VERTICAL)

    assert abs(recorte.largura / recorte.altura - VERTICAL.aspecto) < 0.01


def test_dimensoes_sao_sempre_pares():
    """yuv420p recusa dimensao impar: o encode morre com 'not divisible by 2'."""
    for origem in (Resolucao(1919, 1079), Resolucao(1280, 719), Resolucao(3841, 2161)):
        recorte = calcular_recorte(origem, VERTICAL)

        assert recorte.largura % 2 == 0, origem
        assert recorte.altura % 2 == 0, origem


def test_foco_move_a_janela_na_horizontal():
    esquerda = calcular_recorte(HORIZONTAL, VERTICAL, foco_x=0.25)
    centro = calcular_recorte(HORIZONTAL, VERTICAL, foco_x=0.5)
    direita = calcular_recorte(HORIZONTAL, VERTICAL, foco_x=0.75)

    assert esquerda.x < centro.x < direita.x


def test_foco_na_borda_nao_gera_coordenada_negativa():
    """Coordenada negativa faria o ffmpeg falhar so no meio do render."""
    for foco in (-1.0, 0.0, 1.0, 2.0):
        recorte = calcular_recorte(HORIZONTAL, VERTICAL, foco_x=foco)

        assert recorte.x >= 0
        assert recorte.x + recorte.largura <= HORIZONTAL.largura


def test_origem_ja_vertical_nao_e_recortada_na_altura():
    recorte = calcular_recorte(VERTICAL, VERTICAL)

    assert (recorte.largura, recorte.altura) == (1080, 1920)
    assert (recorte.x, recorte.y) == (0, 0)


def test_filtro_recorta_antes_de_escalar():
    """Escalar antes gastaria pixels que o crop jogaria fora."""
    filtro = filtro_reenquadrar(HORIZONTAL, VERTICAL)

    assert filtro.index("crop=") < filtro.index("scale=")


def test_filtro_usa_dois_pontos_no_scale():
    """`scale=1080x1920` e sintaxe invalida — o ffmpeg recusa o filtro inteiro."""
    filtro = filtro_reenquadrar(HORIZONTAL, VERTICAL)

    assert "scale=1080:1920" in filtro
    assert "1080x1920" not in filtro


def test_filtro_fixa_o_sar():
    """Sem setsar=1 o player pode esticar o quadro de volta ao aspecto antigo."""
    assert filtro_reenquadrar(HORIZONTAL, VERTICAL).endswith("setsar=1")
