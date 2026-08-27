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


async def _extrair_audio(
    video_path: Path,
    inicio_seg: float | None = None,
    fim_seg: float | None = None,
) -> Path:
    """Extrai um WAV mono 16 kHz do vídeo (formato ideal para o pyannote).

    Quando `inicio_seg`/`fim_seg` são dados, recorta só essa janela — usado pela
    diarização por corte, que roda pyannote apenas no trecho de interesse (rápido)
    em vez do vídeo inteiro. `-ss`/`-t` vêm ANTES do `-i` para o seek ser rápido.
    """
    wav_path = video_path.with_name(_AUDIO_WAV)
    corte_args: list[str] = []
    if inicio_seg is not None and fim_seg is not None and fim_seg > inicio_seg:
        corte_args = ["-ss", str(inicio_seg), "-t", str(fim_seg - inicio_seg)]
    await run_ffmpeg_simple(
        [
            "ffmpeg",
            "-y",
            *corte_args,
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


def _carregar_waveform(wav_path: Path) -> dict:
    """Lê o WAV como dict `{'waveform', 'sample_rate'}` aceito pelo pyannote.

    O pyannote 4.x delega a decodificação de arquivo ao torchcodec, que no
    Windows exige DLLs de FFmpeg "full-shared" e quebra com facilidade (D-385).
    Como o WAV é gerado por nós com formato conhecido (mono 16 kHz PCM16),
    lemos com a stdlib e entregamos o áudio já em memória — caminho que o
    pyannote aceita sem nenhum decoder externo.
    """
    import wave

    import numpy as np
    import torch

    with wave.open(str(wav_path), "rb") as wav:
        sample_rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())
    amostras = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    waveform = torch.from_numpy(amostras).unsqueeze(0)  # (channel, time)
    return {"waveform": waveform, "sample_rate": sample_rate}


def _rodar_pipeline_sync(wav_path: Path) -> list[dict]:
    """Roda a diarização pyannote de forma síncrona (chamada via thread).

    Import local: mantém pyannote/torch fora do caminho de import do app, que
    precisa subir mesmo sem a dependência pesada instalada.
    """
    from pyannote.audio import Pipeline

    pipeline = Pipeline.from_pretrained(
        settings.diarizacao_modelo,
        token=settings.huggingface_token,
    )
    diarizacao = pipeline(_carregar_waveform(wav_path))

    # pyannote 3.x devolvia a `Annotation` direto; a 4.x embrulha tudo num
    # `DiarizeOutput` e põe a anotação em `.speaker_diarization`. O getattr
    # atende as duas: sem o campo (3.x), o próprio objeto já é a anotação.
    # Sem isso, a 4.x estourava `'DiarizeOutput' object has no attribute
    # 'itertracks'` — e como este cliente engole exceções para não derrubar a
    # análise, a diarização falhava em silêncio desde o upgrade da lib.
    anotacao = getattr(diarizacao, "speaker_diarization", diarizacao)

    turns: list[dict] = []
    for turno, _track, speaker in anotacao.itertracks(yield_label=True):
        turns.append(
            {"start": float(turno.start), "end": float(turno.end), "speaker": str(speaker)}
        )
    return turns


async def diarizar(
    video_path: str | Path,
    inicio_seg: float | None = None,
    fim_seg: float | None = None,
) -> list[dict] | None:
    """Diariza o áudio do vídeo, devolvendo os turnos `{start, end, speaker}`.

    Sem `inicio_seg`/`fim_seg` diariza o vídeo inteiro (fluxo do projeto). Com a
    janela, roda pyannote só nesse trecho (diarização por corte) e reprojeta os
    turnos para o tempo ABSOLUTO do vídeo — somando `inicio_seg` — para casar com
    a transcrição do projeto no alinhamento.

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

    janela = inicio_seg is not None and fim_seg is not None and fim_seg > inicio_seg
    offset = inicio_seg if janela else 0.0

    wav_path: Path | None = None
    try:
        wav_path = await _extrair_audio(video, inicio_seg, fim_seg)
        turns = await asyncio.to_thread(_rodar_pipeline_sync, wav_path)
        if offset:
            turns = [{**t, "start": t["start"] + offset, "end": t["end"] + offset} for t in turns]
        logger.info(
            "[Diarizacao] %d turnos, %d falantes distintos%s.",
            len(turns),
            len({t["speaker"] for t in turns}),
            f" (janela {inicio_seg:.0f}-{fim_seg:.0f}s)" if janela else "",
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
        _logar_dica_setup(exc)
        return None
    finally:
        if wav_path is not None:
            wav_path.unlink(missing_ok=True)


def _logar_dica_setup(exc: Exception) -> None:
    """Traduz erros comuns do HuggingFace numa dica acionável no log.

    A mensagem crua do Hub ("cannot find the requested files ... check your
    connection") esconde a causa real: quase sempre é um token SEM acesso a
    repositórios *gated* (ou termos não aceitos), não falta de conexão. Sem
    esta tradução, um checkbox faltando no token vira uma investigação longa.
    """
    msg = str(exc).lower()
    if any(m in msg for m in ("gated", "403", "enable access", "accept the", "awaiting")):
        logger.error(
            "[Diarizacao] Causa provável: o HUGGINGFACE_TOKEN não tem acesso a "
            "repositórios gated. Habilite 'Read access to public gated repos' no "
            "token (huggingface.co/settings/tokens) OU use um token clássico Read, "
            "e aceite os termos em huggingface.co/pyannote/speaker-diarization-3.1 "
            "e huggingface.co/pyannote/segmentation-3.0."
        )
    elif any(m in msg for m in ("cannot find the requested files", "connection", "offline")):
        logger.error(
            "[Diarizacao] Causa provável: modelo não está em cache e o download "
            "falhou. Confirme a conexão e o acesso do HUGGINGFACE_TOKEN aos modelos "
            "pyannote (repos gated) — a mensagem 'check your connection' do Hub "
            "costuma ser, na verdade, um 403 de permissão."
        )
