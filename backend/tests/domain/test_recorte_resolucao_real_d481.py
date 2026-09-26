"""D-481: o recorte 9:16 tem de caber no arquivo, qualquer que seja a resolucao.

O erro que originou estes testes, em PROD:

    [Parsed_crop_0] Invalid too big or non positive size for width '608' or
    height '1080'

608x1080 e o recorte 9:16 de um quadro 1920x1080. O bruto nao era 1080p. O
comando trazia `origem=HORIZONTAL` como DEFAULT e o servico nunca passava a
resolucao medida, entao a conta era feita sobre um quadro imaginario.

O que estes testes travam nao e a aritmetica — essa ja estava certa. E o
CONTRATO: a janela nunca excede o arquivo, e a resolucao e obrigatoria.
"""

import inspect
from pathlib import Path

import pytest
from app.domain.short.formato_video import VERTICAL, Resolucao, calcular_recorte
from app.infrastructure.render.ffmpeg_short import build_recorte_vertical_cmd

# Resolucoes que aparecem de verdade num acervo de lives.
RESOLUCOES = [
    Resolucao(1920, 1080),
    Resolucao(1280, 720),  # a que quebrou
    Resolucao(854, 480),
    Resolucao(3840, 2160),
    Resolucao(1080, 1920),  # ja vertical
    Resolucao(1440, 1080),  # 4:3
]


@pytest.mark.parametrize("origem", RESOLUCOES, ids=str)
@pytest.mark.parametrize("foco_x", [0.0, 0.101, 0.5, 0.9, 1.0])
def test_a_janela_nunca_sai_do_quadro(origem, foco_x):
    r = calcular_recorte(origem, VERTICAL, foco_x)

    assert r.largura <= origem.largura, "crop mais largo que o arquivo"
    assert r.altura <= origem.altura, "crop mais alto que o arquivo — foi este o erro em PROD"
    assert r.x >= 0 and r.x + r.largura <= origem.largura
    assert r.y >= 0 and r.y + r.altura <= origem.altura


@pytest.mark.parametrize("origem", RESOLUCOES, ids=str)
def test_dimensoes_pares_em_toda_resolucao(origem):
    """Impar quebra o encode em yuv420p com 'width not divisible by 2'."""
    r = calcular_recorte(origem, VERTICAL, 0.5)

    assert r.largura % 2 == 0 and r.altura % 2 == 0


def test_bruto_720p_nao_gera_mais_o_crop_de_1080_de_altura():
    """O caso exato do erro, escrito como caso."""
    r = calcular_recorte(Resolucao(1280, 720), VERTICAL, 0.5)

    assert (r.largura, r.altura) != (608, 1080)
    assert r.altura == 720


def test_resolucao_de_origem_e_obrigatoria():
    """Sem default nao ha como esquecer de passar — foi o default que mentiu."""
    parametro = inspect.signature(build_recorte_vertical_cmd).parameters["origem"]

    assert parametro.default is inspect.Parameter.empty


def test_comando_de_720p_pede_crop_que_cabe():
    cmd = build_recorte_vertical_cmd(
        Path("bruto.mkv"),
        Path("base.mp4"),
        inicio_seg=0.0,
        duracao_seg=10.0,
        filtro=None,
        origem=Resolucao(1280, 720),
    )
    vf = cmd[cmd.index("-vf") + 1]
    largura, altura = (int(v) for v in vf.split("crop=")[1].split(",")[0].split(":")[:2])

    assert largura <= 1280 and altura <= 720
