"""D-911: a tela do insert sai com os cantos arredondados no estilo limpo.

O palco em PNG não alcança esses cantos (por baixo da tela há o vídeo da
pessoa, não fundo), então o FFmpeg aplica uma máscara com `alphamerge`.
"""

from __future__ import annotations

from pathlib import Path

from app.domain.short.arranjo_short import Arranjo, Disposicao, ModoPalco, montar_modelo
from app.domain.short.palco_short import montar_plano
from app.infrastructure.imagem.mascara_arredondada import mascara_arredondada
from app.infrastructure.render.ffmpeg_short import Molde, build_palco_vertical_cmd
from PIL import Image

REGIOES = {
    "pessoa": {"x": 0, "y": 0, "w": 400, "h": 300},
    "tela": {"x": 400, "y": 0, "w": 800, "h": 450},
}


def _plano_insert():
    insert = Arranjo(modo=ModoPalco.DIVIDIDA, disposicao=Disposicao.INSERT)
    return montar_plano(montar_modelo(insert, REGIOES), REGIOES)


def test_o_insert_e_o_unico_sobreposto():
    assert _plano_insert().sobrepostos() == [1]


def test_mascara_tem_cantos_transparentes_e_miolo_opaco(tmp_path: Path):
    caminho = mascara_arredondada(200, 120, 24, tmp_path)
    imagem = Image.open(caminho)
    assert imagem.size == (200, 120)
    assert imagem.getpixel((0, 0)) == 0
    assert imagem.getpixel((199, 119)) == 0
    assert imagem.getpixel((100, 60)) == 255
    # Em cache: pedir de novo devolve o mesmo arquivo.
    assert mascara_arredondada(200, 120, 24, tmp_path) == caminho


def test_comando_aplica_a_mascara_so_no_recorte_sobreposto(tmp_path: Path):
    palco = tmp_path / "palco.png"
    mascara = tmp_path / "m.png"
    cmd = build_palco_vertical_cmd(
        Path("b.mkv"),
        Path("o.mp4"),
        inicio_seg=0.0,
        duracao_seg=5.0,
        plano=_plano_insert(),
        palco_png=palco,
        moldes={1: Molde(mascara=mascara)},
        filtro=None,
    )
    grafo = cmd[cmd.index("-filter_complex") + 1]
    # A máscara é a entrada 2 (0 = bruto, 1 = palco) e entra em loop.
    assert cmd[cmd.index(str(mascara)) - 3 : cmd.index(str(mascara)) + 1] == [
        "-loop",
        "1",
        "-i",
        str(mascara),
    ]
    assert "[2:v]format=gray[m1]" in grafo
    assert "[s1][m1]alphamerge[r1]" in grafo
    # A pessoa (recorte 0) segue como sempre.
    assert "alphamerge[r0]" not in grafo


def test_sem_mascara_o_comando_e_o_de_sempre():
    plano = _plano_insert()
    com = build_palco_vertical_cmd(
        Path("b.mkv"), Path("o.mp4"), inicio_seg=0.0, duracao_seg=5.0, plano=plano, filtro=None
    )
    assert "alphamerge" not in com[com.index("-filter_complex") + 1]
    assert "-loop" not in com


def test_buraco_apara_o_video_e_reposiciona_o_overlay(tmp_path: Path):
    """D-913: com eco, o vídeo para no contorno, e a máscara tem o tamanho do buraco."""
    plano = _plano_insert()
    janela = plano.recortes[0].janela
    buraco = {
        "x": janela["x"] + 32,
        "y": janela["y"] + 32,
        "w": janela["w"] - 64,
        "h": janela["h"] - 64,
    }
    cmd = build_palco_vertical_cmd(
        Path("b.mkv"),
        Path("o.mp4"),
        inicio_seg=0.0,
        duracao_seg=5.0,
        plano=plano,
        palco_png=tmp_path / "palco.png",
        moldes={0: Molde(buraco=buraco)},
        filtro=None,
    )
    grafo = cmd[cmd.index("-filter_complex") + 1]
    assert f"crop={buraco['w']}:{buraco['h']}:32:32[r0]" in grafo
    assert f"overlay=x={buraco['x']}:y={buraco['y']}" in grafo
