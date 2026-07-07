"""Cliente de diarização de falantes — pyannote.audio (D-286).

Isola a dependência pesada (pyannote/torch) e o token do HuggingFace atrás de
uma função async simples. Tudo aqui é TOLERANTE A FALHA: se a lib não estiver
instalada, o token faltar ou a inferência estourar, retornamos `None` e o
pipeline segue sem rótulo de falante — nunca derrubamos a análise.

Instalação (ver README/SETUP): `pip install pyannote.audio`, aceitar os termos
do modelo em huggingface.co e exportar `HUGGINGFACE_TOKEN` no `.env`.
"""

import asyncio
import logging
from pathlib import Path

from app.config import settings
from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple

logger = logging.getLogger(__name__)

_AUDIO_WAV = "diarizacao_audio.wav"


async def _extrair_audio(video_path: Path) -> Path:
    """Extrai um WAV mono 16 kHz do vídeo (formato ideal para o pyannote)."""
    wav_path = video_path.with_name(_AUDIO_WAV)
    await run_ffmpeg_simple(
        [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",  # descarta o vídeo
            "-ac",
            "1",  # mono
            "-ar",
            "16000",  # 16 kHz
            "-f",
            "wav",
            str(wav_path),
        ],
        label="diarizacao-audio",
    )
    return wav_path


def _rodar_pipeline_sync(wav_path: Path) -> list[dict]:
    """Roda a diarização pyannote de forma síncrona (chamada via thread).

    Import local: mantém pyannote/torch fora do caminho de import do app, que
    precisa subir mesmo sem a dependência pesada instalada.
    """
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        settings.diarizacao_modelo,
        use_auth_token=settings.huggingface_token,
    )
    diarizacao = pipeline(str(wav_path))

    turns: list[dict] = []
    for turno, _track, speaker in diarizacao.itertracks(yield_label=True):
        turns.append(
            {"start": float(turno.start), "end": float(turno.end), "speaker": str(speaker)}
        )
    return turns


async def diarizar(video_path: str | Path) -> list[dict] | None:
    """Diariza o áudio do vídeo, devolvendo os turnos `{start, end, speaker}`.

    Retorna `None` (degradação graciosa) quando a diarização não pode rodar:
    token ausente, pyannote não instalado, ou qualquer erro de inferência.
    """
    if not settings.huggingface_token:
        logger.warning(
            "[Diarizacao] HUGGINGFACE_TOKEN ausente — diarização desativada "
            "(transcrição segue sem rótulo de falante)."
        )
        return None

    video = Path(video_path)
    if not video.exists():
        logger.error("[Diarizacao] Vídeo não encontrado: %s", video)
        return None

    wav_path: Path | None = None
    try:
        wav_path = await _extrair_audio(video)
        turns = await asyncio.to_thread(_rodar_pipeline_sync, wav_path)
        logger.info(
            "[Diarizacao] %d turnos, %d falantes distintos.",
            len(turns),
            len({t["speaker"] for t in turns}),
        )
        return turns
    except ImportError:
        logger.warning(
            "[Diarizacao] pyannote.audio não instalado — diarização desativada. "
            "Instale com `pip install pyannote.audio`."
        )
        return None
    except Exception as exc:  # noqa: BLE001 — degrada em vez de derrubar a análise
        logger.error("[Diarizacao] Falha na diarização: %s", exc)
        return None
    finally:
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)
