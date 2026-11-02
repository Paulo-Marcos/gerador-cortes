"""D-1016: o pico final fica abaixo do teto do boletim (RN-34).

Medido em cortes da PROD: o loudnorm entrega -1,0 dBTP no PCM, e o AAC a 192k sobe
para até +3,2 dBTP. Com alvo de -1,5 dBTP e AAC a 256k, 7 de 7 cortes ficaram
entre -1,4 e -1,5 dBTP.

O teste olha os argumentos, não o áudio: o estouro do codificador é caótico (o mesmo
corte deu +3,2, +1,8 e -0,2 dBTP em três codificações), então um sinal sintético
provaria pouco e quebraria com a versão do FFmpeg.
"""

import re
from pathlib import Path

from app.domain.corte.boletim_tecnico import PICO_MAXIMO_DBTP
from app.infrastructure.render.ffmpeg_commands import build_compose_and_encode_cmd
from app.infrastructure.render.ffmpeg_short import build_composicao_short_cmd


def _valor(cmd: list[str], flag: str) -> str:
    return cmd[cmd.index(flag) + 1]


def _comandos_finais() -> dict[str, list[str]]:
    return {
        "horizontal": build_compose_and_encode_cmd(Path("g.mp4"), [], [], Path("f.mp4")),
        "short": build_composicao_short_cmd(Path("b.mp4"), Path("o.mov"), Path("f.mp4")),
    }


def test_alvo_de_pico_deixa_margem_abaixo_do_teto_do_boletim():
    for nome, cmd in _comandos_finais().items():
        alvo = re.search(r"TP=(-?[\d.]+)", _valor(cmd, "-af"))
        assert alvo, nome
        assert float(alvo.group(1)) <= PICO_MAXIMO_DBTP - 0.5, nome


def test_audio_final_sai_em_aac_de_256k():
    for nome, cmd in _comandos_finais().items():
        assert _valor(cmd, "-c:a") == "aac", nome
        assert _valor(cmd, "-b:a") == "256k", nome


def test_horizontal_e_short_usam_o_mesmo_audio():
    comandos = _comandos_finais()
    for flag in ("-af", "-c:a", "-b:a", "-ar"):
        assert _valor(comandos["horizontal"], flag) == _valor(comandos["short"], flag), flag


def test_audio_final_normaliza_uma_vez_so():
    for nome, cmd in _comandos_finais().items():
        assert cmd.count("-af") == 1, nome
        assert sum("loudnorm" in arg for arg in cmd) == 1, nome
