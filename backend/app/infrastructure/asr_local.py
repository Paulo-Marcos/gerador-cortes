"""Cliente de ASR local — faster-whisper (D-461).

Isola a dependência pesada (faster-whisper + modelo baixado) atrás de uma função
async simples, no mesmo arranjo do `diarizacao_client` (D-286). Tudo aqui é
TOLERANTE A FALHA: se a lib não estiver instalada ou a inferência estourar,
retornamos `None` e o chamador cai na auto-legenda do YouTube — nunca derrubamos
a geração do short.

Instalação (opcional): `pip install faster-whisper`. O modelo é baixado na
primeira execução e fica em cache. `settings.asr_modelo` escolhe o tamanho
(`small` é o equilíbrio padrão entre grafia e tempo em CPU).

POR QUE ASR local e não a auto-legenda: 85% das visualizações de short são no
mudo, então a legenda é o conteúdo. Erro de grafia do YouTube, que passa
despercebido num texto auxiliar, vira o próprio produto quando está queimado no
vídeo em corpo grande.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.config import settings
from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

logger = logging.getLogger(__name__)

_AUDIO_WAV = "asr_audio.wav"


async def transcrever_palavras(video_path: Path) -> list[dict] | None:
    """Palavras com tempo do áudio do vídeo, ou `None` quando o ASR não roda.

    `None` não é erro: é o sinal de "use a outra fonte". O chamador decide.
    """
    if not settings.asr_local_habilitado:
        logger.info("[ASR] desligado por configuracao (asr_local_habilitado=false)")
        return None

    try:
        from faster_whisper import WhisperModel  # type: ignore[import-not-found]
    except ImportError:
        logger.info("[ASR] faster-whisper nao instalado; usando a auto-legenda como fonte")
        return None

    wav_path: Path | None = None
    try:
        wav_path = await _extrair_audio(video_path)
        return await asyncio.to_thread(_transcrever_sync, WhisperModel, wav_path)
    except Exception as exc:  # noqa: BLE001 — ASR nunca derruba a geracao do short
        logger.warning("[ASR] falhou em %s: %s", video_path.name, exc)
        return None
    finally:
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)


async def _extrair_audio(video_path: Path) -> Path:
    """WAV mono 16 kHz — o formato que os modelos de ASR esperam."""
    wav_path = video_path.with_name(_AUDIO_WAV)
    await run_ffmpeg_simple(
        [
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(wav_path),
        ]
    )
    return wav_path


def _transcrever_sync(modelo_cls, wav_path: Path) -> list[dict]:
    """Roda o modelo (bloqueante, por isso vive numa thread) e achata as palavras."""
    modelo = modelo_cls(
        settings.asr_modelo,
        device="auto",
        compute_type="int8",
    )
    segmentos, _info = modelo.transcribe(
        str(wav_path),
        language=settings.asr_idioma or None,
        word_timestamps=True,
        vad_filter=True,
    )

    palavras: list[dict] = []
    for segmento in segmentos:
        for palavra in getattr(segmento, "words", None) or []:
            texto = str(getattr(palavra, "word", "")).strip()
            if not texto:
                continue
            palavras.append(
                {
                    "texto": texto,
                    "inicio_seg": float(getattr(palavra, "start", 0.0) or 0.0),
                    "fim_seg": float(getattr(palavra, "end", 0.0) or 0.0),
                }
            )
    logger.info("[ASR] %d palavras transcritas de %s", len(palavras), wav_path.name)
    return palavras
