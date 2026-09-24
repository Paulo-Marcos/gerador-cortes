"""Encoder de vídeo H.264 do render final (D-622).

A produção nasceu no Intel Quick Sync (`h264_qsv`), que só existe em máquina com
iGPU Intel. Sem ela, o render final falhava no encode. `libx264` roda em
qualquer CPU e recebe o MESMO filtergraph; só os argumentos de encode mudam.

Regra de não-regressão: com `QSV`, os argumentos são exatamente os que os
builders sempre emitiram (garantido por teste de retrato dos comandos).
"""

from enum import StrEnum


class VideoEncoder(StrEnum):
    QSV = "h264_qsv"
    LIBX264 = "libx264"


def argumentos_codec_qualidade(
    encoder: VideoEncoder, *, preset: str, global_quality: int
) -> list[str]:
    """Codec + preset + qualidade constante da grade.

    `-global_quality` é o ICQ do QSV; no libx264 o equivalente é `-crf`, na
    mesma escala (maior = mais comprimido). Medido no D-622 com os comandos
    reais de PROD: gq 30 ↔ crf 30 dá PSNR ~42 dB entre os dois.
    """
    flag_qualidade = "-global_quality" if encoder is VideoEncoder.QSV else "-crf"
    return ["-c:v", encoder.value, "-preset", preset, flag_qualidade, str(global_quality)]


def argumentos_codec(encoder: VideoEncoder, *, preset: str) -> list[str]:
    """Codec + preset do encode por bitrate (compose final)."""
    return ["-c:v", encoder.value, "-preset", preset]


def argumentos_async_depth(encoder: VideoEncoder) -> list[str]:
    """`-async_depth 1` é opção privada do QSV (limita surfaces em voo, D-065).
    O libx264 não a conhece, então ela só entra no QSV."""
    return ["-async_depth", "1"] if encoder is VideoEncoder.QSV else []


def permite_decode_qsv(encoder: VideoEncoder) -> bool:
    """Decode QSV só existe onde o encode QSV existe (mesma iGPU)."""
    return encoder is VideoEncoder.QSV
