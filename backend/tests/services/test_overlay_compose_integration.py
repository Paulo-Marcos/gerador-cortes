"""Integração FFMPEG real: prova que a composição de overlay com alpha
funciona para os dois codecs (ProRes 4444 e VP9) através do comando de
produção `build_compose_and_encode_cmd`.

Cada teste:
  1. Gera uma base AZUL 128x128 (libx264, com áudio silencioso p/ loudnorm).
  2. Gera um overlay no codec alvo: metade ESQUERDA vermelha OPACA, metade
     direita TRANSPARENTE (alpha=0).
  3. Compõe overlay sobre base pelo comando real do pipeline (h264_qsv).
  4. Lê pixels do resultado: esquerda deve ficar VERMELHA (overlay opaco),
     direita deve mostrar o AZUL da base (overlay transparente).

Se o alpha não funcionasse (ex.: VP9 sem `-c:v libvpx-vp9`, ou ProRes mal
configurado), a direita sairia vermelha/preta — e o teste falha. É a prova
direta de "o overlay continua funcionando" ao trocar o codec.

Marca `integration`: requer ffmpeg com h264_qsv, libvpx-vp9 e prores_ks.
Pulado automaticamente onde esses encoders não existem.
"""

import shutil
import subprocess
from pathlib import Path

import pytest
from app.domain.ffmpeg_commands import build_compose_and_encode_cmd

pytestmark = pytest.mark.integration

_FFMPEG = shutil.which("ffmpeg")
_W, _H, _DUR, _FPS = 128, 128, 0.3, 30


def _encoders() -> str:
    if not _FFMPEG:
        return ""
    return subprocess.run(
        [_FFMPEG, "-hide_banner", "-encoders"],
        capture_output=True,
        text=True,
    ).stdout


_ENCODERS = _encoders()


def _has(encoder: str) -> bool:
    return encoder in _ENCODERS


def _qsv_funciona() -> bool:
    if not _FFMPEG or not _has("h264_qsv"):
        return False
    res = subprocess.run(
        [
            _FFMPEG,
            "-hide_banner",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=64x64:d=0.1",
            "-c:v",
            "h264_qsv",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    return res.returncode == 0


def _run(cmd: list) -> None:
    res = subprocess.run([str(c) for c in cmd], capture_output=True, text=True)
    if res.returncode != 0:
        raise AssertionError(
            f"ffmpeg falhou (rc={res.returncode})\nCMD: {' '.join(map(str, cmd))}\n"
            f"STDERR:\n{res.stderr[-1500:]}"
        )


def _gerar_base(dest: Path) -> None:
    """Base AZUL 128x128 com um tom senoidal real.

    Um tom (não silêncio): loudnorm sobre silêncio digital gera ganho NaN e
    quebra o encoder AAC — então usamos sinal de verdade, o que de quebra
    exercita o loudnorm do comando de produção.
    """
    _run(
        [
            _FFMPEG,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color=c=blue:s={_W}x{_H}:d={_DUR}:r={_FPS}",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000",
            "-t",
            str(_DUR),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            str(dest),
        ]
    )


def _gerar_overlay(dest: Path, *, codec: str) -> None:
    """Overlay: metade esquerda VERMELHA opaca, metade direita TRANSPARENTE.

    geq monta o alpha por coluna (X<64 => opaco). Depois converte para o
    pixel format com alpha do codec alvo.
    """
    if codec == "prores":
        pix, venc, extra = "yuva444p10le", "prores_ks", ["-profile:v", "4444"]
    else:  # vp9
        pix, venc, extra = "yuva420p", "libvpx-vp9", []
    vf = f"format=rgba,geq=r='255':g='0':b='0':a='if(lt(X,{_W // 2}),255,0)',format={pix}"
    _run(
        [
            _FFMPEG,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"nullsrc=s={_W}x{_H}:d={_DUR}:r={_FPS}",
            "-vf",
            vf,
            "-c:v",
            venc,
            *extra,
            "-pix_fmt",
            pix,
            str(dest),
        ]
    )


def _probe_width(video: Path) -> int:
    res = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width",
            "-of",
            "default=nk=1:nw=1",
            str(video),
        ],
        capture_output=True,
        text=True,
    )
    return int(res.stdout.strip())


def _frame_rgb24(video: Path) -> bytes:
    """1º frame inteiro como rawvideo rgb24 (sem crop — crop=1:1 quebra em
    algumas builds do ffmpeg). Indexamos o pixel em Python."""
    res = subprocess.run(
        [
            _FFMPEG,
            "-v",
            "error",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ],
        capture_output=True,
    )
    assert res.stdout, f"não consegui ler o frame; stderr={res.stderr[-500:]}"
    return res.stdout


def _pixel(frame: bytes, width: int, x: int, y: int) -> tuple:
    off = (y * width + x) * 3
    assert len(frame) >= off + 3, f"frame pequeno demais ({len(frame)}B) p/ ({x},{y})"
    return frame[off], frame[off + 1], frame[off + 2]


@pytest.mark.skipif(not _FFMPEG, reason="ffmpeg não encontrado no PATH")
@pytest.mark.skipif(not _qsv_funciona(), reason="h264_qsv indisponível neste ambiente")
@pytest.mark.parametrize(
    "codec, ext, encoder_necessario",
    [
        ("prores", ".mov", "prores_ks"),
        ("vp9", ".webm", "libvpx-vp9"),
    ],
)
def test_overlay_alpha_compoe_pelo_comando_de_producao(tmp_path, codec, ext, encoder_necessario):
    if not _has(encoder_necessario):
        pytest.skip(f"encoder {encoder_necessario} indisponível")

    base = tmp_path / "clip_graded.mp4"
    overlay = tmp_path / f"chunk_001{ext}"
    saida = tmp_path / "video.mp4"

    _gerar_base(base)
    _gerar_overlay(overlay, codec=codec)

    # COMANDO DE PRODUÇÃO — o mesmo usado na Fase 3 do pipeline.
    cmd = build_compose_and_encode_cmd(
        base,
        [overlay],
        [{"start_sec": 0.0, "end_sec": _DUR}],
        saida,
    )
    _run(cmd)

    assert saida.exists() and saida.stat().st_size > 0

    width = _probe_width(saida)
    frame = _frame_rgb24(saida)
    # O overlay (128x128) é composto SEM escala no topo-esquerdo do quadro
    # normalizado (1920x1080), então lemos pixels dentro de 0..128.

    # Esquerda (x=32): overlay vermelho OPACO deve dominar.
    lr, lg, lb = _pixel(frame, width, _W // 4, _H // 2)
    assert lr > 140 and lg < 90 and lb < 90, f"esquerda não ficou vermelha: {(lr, lg, lb)}"

    # Direita (x=96): overlay TRANSPARENTE -> base AZUL deve aparecer.
    rr, rg, rb = _pixel(frame, width, (_W * 3) // 4, _H // 2)
    assert rb > 140 and rr < 90 and rg < 110, f"direita não mostrou o azul da base: {(rr, rg, rb)}"
