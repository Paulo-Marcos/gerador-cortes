"""D-1014: o áudio do short sai em -14 LUFS, como o do corte horizontal.

Medido em três `short.mp4` da PROD: -16,2, -14,1 e -19,8 LUFS, com picos de +0,1
e +0,2 dBFS (clipando). O short codificava `-c:a aac` sem loudnorm nos três
estágios; o horizontal normaliza (`ffmpeg_overlay._LOUDNORM_YOUTUBE`).

A normalização mora num ÚNICO ponto, a composição final: é o único estágio que
vê o short inteiro. No recorte, uma colagem de N fatias (D-604) seria normalizada
fatia a fatia, cada uma com um ganho, e o volume pularia nas emendas.
"""

from pathlib import Path

from app.domain.short.arranjo_short import Arranjo, montar_modelo
from app.domain.short.formato_video import HORIZONTAL
from app.domain.short.palco_short import montar_plano
from app.infrastructure.render.ffmpeg_overlay import _LOUDNORM_YOUTUBE
from app.infrastructure.render.ffmpeg_short import (
    build_composicao_short_cmd,
    build_palco_vertical_cmd,
    build_recorte_vertical_cmd,
)


def _valor(cmd: list[str], flag: str) -> str:
    return cmd[cmd.index(flag) + 1]


def test_composicao_normaliza_com_o_filtro_do_horizontal():
    cmd = build_composicao_short_cmd(Path("b.mp4"), Path("o.mov"), Path("f.mp4"))

    assert _valor(cmd, "-af") == _LOUDNORM_YOUTUBE
    assert _valor(cmd, "-c:a") == "aac"
    assert "copy" not in cmd[cmd.index("-c:a") : cmd.index("-c:a") + 2]


def test_composicao_normaliza_uma_vez_so():
    cmd = build_composicao_short_cmd(Path("b.mp4"), Path("o.mov"), Path("f.mp4"))

    assert cmd.count("-af") == 1
    assert "loudnorm" not in cmd[cmd.index("-filter_complex") + 1]


def test_recorte_e_palco_nao_normalizam():
    # Normalizar aqui de novo aplicaria o ganho duas vezes — e, na colagem,
    # fatia por fatia.
    recorte = build_recorte_vertical_cmd(
        Path("b.mkv"), Path("o.mp4"), inicio_seg=0.0, duracao_seg=5.0, origem=HORIZONTAL
    )
    regioes = {"pessoa": {"x": 24, "y": 410, "w": 340, "h": 260}}
    plano = montar_plano(montar_modelo(Arranjo(), regioes), regioes)
    palco = build_palco_vertical_cmd(
        Path("b.mkv"), Path("o.mp4"), inicio_seg=0.0, duracao_seg=5.0, plano=plano
    )

    for cmd in (recorte, palco):
        assert "-af" not in cmd
        assert not any("loudnorm" in arg for arg in cmd)
