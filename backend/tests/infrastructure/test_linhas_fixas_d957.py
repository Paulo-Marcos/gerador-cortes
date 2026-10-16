"""D-957: achar no bruto as bordas horizontais fixas que cruzam a região.

Vídeo gerado pelo OpenCV: uma faixa clara de quadro cheio embaixo (a faixa da
live, desenhada por cima de tudo), uma prateleira escura atrás do apresentador
que só cobre metade da largura e um quadrado que anda (o apresentador).
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from app.domain.canal.quadros_do_apresentador import Caixa
from app.infrastructure import quadros_do_video
from app.infrastructure.quadros_do_video import VideoIlegivel

LARGURA, ALTURA, FPS, SEGUNDOS = 320, 180, 10, 3
FAIXA_Y = 150  # a faixa da live começa nesta linha
PRATELEIRA_Y = 40


@pytest.fixture
def video(tmp_path):
    caminho = tmp_path / "clip_raw_1.avi"
    gravador = cv2.VideoWriter(
        str(caminho), cv2.VideoWriter_fourcc(*"MJPG"), FPS, (LARGURA, ALTURA)
    )
    for i in range(FPS * SEGUNDOS):
        quadro = np.full((ALTURA, LARGURA, 3), 120, np.uint8)
        cv2.rectangle(quadro, (0, PRATELEIRA_Y), (LARGURA // 2, PRATELEIRA_Y + 6), (20, 20, 20), -1)
        cv2.rectangle(quadro, (100 + i, 60), (160 + i, 160), (230, 230, 230), -1)
        cv2.rectangle(quadro, (0, FAIXA_Y), (LARGURA, ALTURA), (60, 220, 160), -1)
        gravador.write(quadro)
    gravador.release()
    return caminho


INTEIRO = Caixa(0.0, 0.0, 1.0, 1.0)


def test_a_faixa_desenhada_por_cima_e_linha_fixa(video):
    linhas = quadros_do_video.linhas_fixas(video, [0.5, 1.5, 2.5], INTEIRO, 0.8)

    assert linhas
    assert all(abs(y * ALTURA - FAIXA_Y) <= 2 for y in linhas)


def test_o_que_so_cobre_parte_da_largura_nao_e_moldura(video):
    linhas = quadros_do_video.linhas_fixas(video, [0.5, 1.5, 2.5], INTEIRO, 0.8)

    assert not [y for y in linhas if abs(y * ALTURA - PRATELEIRA_Y) <= 8]


def test_mede_so_dentro_da_regiao(video):
    em_cima = Caixa(0.0, 0.0, 1.0, 0.5)

    assert quadros_do_video.linhas_fixas(video, [0.5, 1.5], em_cima, 0.8) == []


def test_instante_fora_do_video_nao_tem_linha(video):
    assert quadros_do_video.linhas_fixas(video, [60.0], INTEIRO, 0.8) == []


def test_video_que_nao_abre_e_ilegivel(tmp_path):
    with pytest.raises(VideoIlegivel):
        quadros_do_video.linhas_fixas(tmp_path / "nao-existe.mkv", [1.0], INTEIRO, 0.8)
