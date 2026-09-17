"""Escolha do encoder H.264 do render final (D-622).

`ffmpeg -encoders` lista `h264_qsv`/`h264_nvenc`/`h264_amf` mesmo sem o
hardware (o build do gyan.dev traz todos), então a lista não prova nada. A
detecção codifica 0,1 s de verdade e só aceita o QSV se o encode sair com
sucesso. O resultado fica em cache: o hardware não muda com o app aberto.

Override: `VIDEO_ENCODER=qsv|libx264` (default `auto`).
"""

import asyncio
import logging
import os
import subprocess
from collections.abc import Callable
from functools import lru_cache

from app.domain.video_encoder import VideoEncoder

logger = logging.getLogger(__name__)

_TIMEOUT_TESTE_SEG = 30

_COMANDO_TESTE_QSV = [
    "ffmpeg",
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=black:s=320x240:r=30:d=0.1",
    "-c:v",
    VideoEncoder.QSV.value,
    "-f",
    "null",
    "-",
]


def _qsv_codifica(executar: Callable[[list[str]], int]) -> bool:
    try:
        return executar(_COMANDO_TESTE_QSV) == 0
    except (OSError, subprocess.SubprocessError) as erro:
        logger.info("[Encoder] teste do QSV falhou: %s", erro)
        return False


def _executar(cmd: list[str]) -> int:
    return subprocess.run(
        cmd, capture_output=True, timeout=_TIMEOUT_TESTE_SEG, check=False
    ).returncode


def escolher_encoder(
    preferencia: str | None, executar: Callable[[list[str]], int] = _executar
) -> VideoEncoder:
    """Resolve a preferência (`auto`/`qsv`/`libx264`) num encoder utilizável."""
    valor = (preferencia or "auto").strip().lower()
    if valor == "libx264":
        return VideoEncoder.LIBX264
    if valor == "qsv":
        return VideoEncoder.QSV
    if valor != "auto":
        logger.warning("[Encoder] VIDEO_ENCODER=%r desconhecido; usando auto.", preferencia)
    if _qsv_codifica(executar):
        return VideoEncoder.QSV
    logger.warning("[Encoder] Intel Quick Sync indisponível; render final em libx264 (CPU).")
    return VideoEncoder.LIBX264


@lru_cache(maxsize=1)
def encoder_da_maquina() -> VideoEncoder:
    encoder = escolher_encoder(os.environ.get("VIDEO_ENCODER"))
    logger.info("[Encoder] render final usando %s", encoder.value)
    return encoder


async def encoder_da_maquina_async() -> VideoEncoder:
    """Versão para o event loop: o teste roda um subprocesso (só na 1ª vez)."""
    return await asyncio.to_thread(encoder_da_maquina)
