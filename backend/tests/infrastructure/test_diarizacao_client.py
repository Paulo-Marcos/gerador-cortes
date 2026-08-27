"""Testes para `app.infrastructure.diarizacao_client`.

Cobre a chamada a `Pipeline.from_pretrained` (D-375): o pyannote.audio instalado
renomeou o kwarg `use_auth_token` para `token` — sem esse teste, a regressão
passa batido porque o cliente degrada silenciosamente (`except Exception` →
`None`).
"""

from __future__ import annotations

import sys
import types
import wave
from pathlib import Path

import pytest
from app.infrastructure import diarizacao_client as client

# O cliente carrega o áudio como tensor torch antes de entregá-lo ao pipeline,
# então estes testes precisam do torch — que é dependência OPT-IN (comentada no
# requirements por pesar 2+ GB). Sem o skip, a suíte só passava em máquina que
# tivesse torch instalado por outro motivo: no venv limpo do checkout, os três
# testes quebravam com ModuleNotFoundError. Pular espelha o que o código de
# produção faz — degradar quando a dependência opcional não está lá.
pytest.importorskip("torch", reason="diarização é opt-in; sem torch não há o que testar")


def _escrever_wav(path: Path, n_frames: int = 1600, sample_rate: int = 16000) -> None:
    """Grava um WAV mono 16 kHz PCM16 mínimo — mesmo formato que o ffmpeg gera."""
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * n_frames)


class _FakeTurn:
    def __init__(self, start: float, end: float):
        self.start = start
        self.end = end


class _FakeDiarizacao:
    def itertracks(self, yield_label: bool = True):
        yield _FakeTurn(0.0, 1.5), None, "SPEAKER_00"
        yield _FakeTurn(1.5, 3.0), None, "SPEAKER_01"


class _FakeDiarizeOutput:
    """Formato da pyannote 4.x: a anotação vai ANINHADA, não solta.

    O objeto de saída não tem `itertracks` — quem tem é o
    `.speaker_diarization` lá dentro. Era exatamente essa diferença que
    fazia a diarização falhar em silêncio em produção enquanto o teste
    (que dublava o formato 3.x) seguia verde.
    """

    def __init__(self):
        self.speaker_diarization = _FakeDiarizacao()
        self.speaker_embeddings = None


class _FakePipeline:
    def __init__(self, saida_v4: bool = False):
        self._saida_v4 = saida_v4

    def __call__(self, audio):
        return _FakeDiarizeOutput() if self._saida_v4 else _FakeDiarizacao()


@pytest.fixture
def _pyannote_fake(monkeypatch, request):
    """Injeta um módulo `pyannote.audio` falso para não depender do modelo real.

    `request.param=True` faz o pipeline devolver o formato da 4.x (anotação
    aninhada em `DiarizeOutput`); sem param, mantém o formato 3.x.
    """
    calls: dict = {}
    saida_v4 = getattr(request, "param", False)

    class _FakePipelineClass:
        @staticmethod
        def from_pretrained(checkpoint, **kwargs):
            calls["checkpoint"] = checkpoint
            calls["kwargs"] = kwargs
            return _FakePipeline(saida_v4=saida_v4)

    fake_module = types.ModuleType("pyannote.audio")
    fake_module.Pipeline = _FakePipelineClass
    monkeypatch.setitem(sys.modules, "pyannote.audio", fake_module)
    monkeypatch.setitem(sys.modules, "pyannote", types.ModuleType("pyannote"))
    return calls


def test_carregar_waveform_le_wav_em_memoria(tmp_path):
    """O áudio vai pré-carregado (D-385): pyannote 4.x exigiria torchcodec p/ arquivo."""
    wav_path = tmp_path / "audio.wav"
    _escrever_wav(wav_path, n_frames=1600)

    audio = client._carregar_waveform(wav_path)

    assert audio["sample_rate"] == 16000
    assert tuple(audio["waveform"].shape) == (1, 1600)  # (channel, time)
    assert audio["waveform"].dtype.is_floating_point


def test_rodar_pipeline_sync_usa_kwarg_token(_pyannote_fake, monkeypatch, tmp_path):
    monkeypatch.setattr(client.settings, "huggingface_token", "hf_fake")
    wav_path = tmp_path / "audio.wav"
    _escrever_wav(wav_path)

    turns = client._rodar_pipeline_sync(wav_path)

    assert "token" in _pyannote_fake["kwargs"]
    assert "use_auth_token" not in _pyannote_fake["kwargs"]
    assert _pyannote_fake["kwargs"]["token"] == "hf_fake"
    assert turns == [
        {"start": 0.0, "end": 1.5, "speaker": "SPEAKER_00"},
        {"start": 1.5, "end": 3.0, "speaker": "SPEAKER_01"},
    ]


@pytest.mark.parametrize("_pyannote_fake", [True], indirect=True)
def test_le_a_anotacao_aninhada_da_pyannote_4x(_pyannote_fake, monkeypatch, tmp_path):
    """A 4.x embrulha a anotação num `DiarizeOutput` sem `itertracks`.

    Regressão: a lib subiu para 4.x e o cliente seguiu chamando
    `itertracks()` no objeto de fora. Como o cliente engole exceções para
    degradar em vez de derrubar a análise, a diarização passou a falhar em
    silêncio — 135 projetos ficaram com o mapa de falantes vazio sem que
    nada aparecesse na tela.
    """
    monkeypatch.setattr(client.settings, "huggingface_token", "hf_fake")
    wav_path = tmp_path / "audio.wav"
    _escrever_wav(wav_path)

    turns = client._rodar_pipeline_sync(wav_path)

    assert turns == [
        {"start": 0.0, "end": 1.5, "speaker": "SPEAKER_00"},
        {"start": 1.5, "end": 3.0, "speaker": "SPEAKER_01"},
    ]
