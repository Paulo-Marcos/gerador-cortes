"""D-929: ler o bruto, medir a região do apresentador e salvar os recortes.

Como no detector do short (D-477), o classificador é um dublê de posição
conhecida: o teste guarda o código deste módulo (o instante pedido, a fração do
quadro, o recorte e a ampliação), não a qualidade do Haar. O vídeo é gerado
pelo próprio OpenCV, sem ffmpeg.
"""

from __future__ import annotations

import cv2
import numpy as np
import pytest
from app.domain.canal.quadros_do_apresentador import Caixa
from app.infrastructure import quadros_do_video
from app.infrastructure.quadros_do_video import VideoIlegivel

LARGURA, ALTURA, FPS, SEGUNDOS = 320, 180, 10, 3


class CascataDeMentira:
    """Um rosto quadrado no canto esquerdo de qualquer imagem que receber."""

    def __init__(self) -> None:
        self.recebidas: list[tuple[int, int]] = []

    def detectMultiScale(self, imagem, **_kwargs):  # noqa: N802 — assinatura do cv2
        altura, largura = imagem.shape[:2]
        self.recebidas.append((largura, altura))
        return [(largura // 10, altura // 4, largura // 5, largura // 5)]


@pytest.fixture
def cascata(monkeypatch):
    dublê = CascataDeMentira()
    monkeypatch.setattr(quadros_do_video, "_carregar_cascata", lambda: dublê)
    return dublê


@pytest.fixture
def video(tmp_path):
    """Cada segundo tem um tom: o quadro lido diz de que instante ele veio."""
    caminho = tmp_path / "clip_raw_1.avi"
    gravador = cv2.VideoWriter(
        str(caminho), cv2.VideoWriter_fourcc(*"MJPG"), FPS, (LARGURA, ALTURA)
    )
    for i in range(FPS * SEGUNDOS):
        quadro = np.full((ALTURA, LARGURA, 3), 40 + 80 * (i // FPS), np.uint8)
        cv2.rectangle(quadro, (20 + i, 40), (80 + i, 100), (255, 255, 255), -1)
        gravador.write(quadro)
    gravador.release()
    return caminho


REGIAO = Caixa(0.0, 0.0, 0.5, 0.5)


class TestRostos:
    def test_volta_em_fracao_do_quadro_inteiro_sem_reduzir(self, video, cascata):
        rostos = quadros_do_video.rostos_nos_instantes(video, [0.5, 1.5])

        assert cascata.recebidas[0] == (LARGURA, ALTURA)
        assert rostos[0] == [Caixa(0.1, 0.25, 0.2, 64 / ALTURA)]
        assert len(rostos) == 2

    def test_instante_depois_do_fim_vira_quadro_sem_rosto(self, video, cascata):
        assert quadros_do_video.rostos_nos_instantes(video, [60.0]) == [[]]

    def test_proporcao_do_quadro(self, video):
        assert quadros_do_video.proporcao(video) == pytest.approx(16 / 9)

    def test_video_que_nao_abre_e_ilegivel(self, tmp_path):
        with pytest.raises(VideoIlegivel):
            quadros_do_video.rostos_nos_instantes(tmp_path / "nao-existe.mkv", [1.0])


class TestMedir:
    def test_mede_so_a_regiao_no_instante_pedido(self, video, cascata):
        candidatos = quadros_do_video.medir_candidatos(video, [0.5, 2.5, 60.0], REGIAO)

        assert [c.instante for c in candidatos] == [0.5, 2.5]
        assert cascata.recebidas[0] == (LARGURA // 2, ALTURA // 2)
        primeiro, ultimo = candidatos
        assert len(primeiro.assinatura) == 16 * 16
        assert all(0.0 <= v <= 1.0 for v in primeiro.assinatura)
        # O quadrado anda um pixel por quadro: a miniatura de 2,5 s não é a de 0,5 s.
        assert ultimo.assinatura != primeiro.assinatura
        assert primeiro.nitidez > 0
        assert primeiro.tem_rosto is True


class TestSalvar:
    def test_salva_um_jpeg_ampliado_por_instante_legivel(self, video, tmp_path):
        pasta = tmp_path / "quadros"
        pasta.mkdir()

        salvos = quadros_do_video.salvar_recortes(
            video, [0.5, 60.0, 1.5], REGIAO, pasta, lambda _w, _h: 2.0
        )

        assert [s.name for s in salvos] == ["quadro-da-live-1.jpg", "quadro-da-live-3.jpg"]
        imagem = cv2.imread(str(salvos[0]))
        assert imagem.shape[:2] == (ALTURA, LARGURA)  # metade do quadro, ampliada 2x
