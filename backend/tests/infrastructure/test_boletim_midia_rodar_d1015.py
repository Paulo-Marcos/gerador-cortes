"""D-1015: o FFmpeg da medição não fica órfão quando a leitura da saída falha."""

from __future__ import annotations

import shutil
import subprocess

import pytest
from app.infrastructure import boletim_midia as m

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="precisa do ffmpeg"),
]


def test_leitura_que_falha_mata_o_ffmpeg_e_o_erro_sobe():
    vistos: list[subprocess.Popen] = []

    def consumir_que_levanta(processo: subprocess.Popen):
        vistos.append(processo)
        raise ValueError("leitura quebrou")

    # Fonte longa: sem a morte explícita, o processo seguiria vivo depois do erro.
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-re",
           "-f", "lavfi", "-i", "testsrc=size=64x64:rate=30", "-t", "60", "-f", "null", "-"]  # fmt: skip
    with pytest.raises(ValueError, match="leitura quebrou"):
        m._rodar(cmd, 120, consumir_que_levanta, stderr=subprocess.DEVNULL)
    # A morte é pedida ao sistema e leva um instante; viva depois de 10 s seria órfão.
    vistos[0].wait(timeout=10)
    assert vistos[0].returncode is not None
