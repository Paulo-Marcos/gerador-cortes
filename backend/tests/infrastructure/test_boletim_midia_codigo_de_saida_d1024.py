"""D-1024: FFmpeg que morre no meio não vira boletim parcial."""

from __future__ import annotations

import shutil
import subprocess

import pytest
from app.infrastructure import boletim_midia as m

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="precisa do ffmpeg"),
]


def test_codigo_de_saida_diferente_de_zero_levanta_erro_de_medicao(tmp_path):
    # Arquivo que não existe: o FFmpeg sai com código 1 sem ter lido nada.
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error",
           "-i", str(tmp_path / "nao_existe.mp4"), "-f", "null", "-"]  # fmt: skip
    with pytest.raises(m.ErroDeMedicao, match="código"):
        m._rodar(cmd, 30, lambda p: p.stdout.read(), stderr=subprocess.DEVNULL)


def test_saida_zero_devolve_o_que_o_consumidor_leu():
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-v", "error", "-f", "lavfi",
           "-i", "anullsrc=r=8000", "-t", "0.1", "-f", "s16le", "-"]  # fmt: skip
    assert m._rodar(cmd, 30, lambda p: p.stdout.read(), stderr=subprocess.DEVNULL)
