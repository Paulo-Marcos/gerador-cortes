"""Testes para `app.infrastructure.diarizacao_client`.

Cobre a chamada a `Pipeline.from_pretrained` (D-375): o pyannote.audio instalado
renomeou o kwarg `use_auth_token` para `token` — sem esse teste, a regressão
passa batido porque o cliente degrada silenciosamente (`except Exception` →
`None`).
"""

from __future__ import annotations

import sys
import types

import pytest
from app.infrastructure import diarizacao_client as client


class _FakeTurn:
    def __init__(self, start: float, end: float):
        self.start = start
        self.end = end


class _FakeDiarizacao:
    def itertracks(self, yield_label: bool = True):
        yield _FakeTurn(0.0, 1.5), None, "SPEAKER_00"
        yield _FakeTurn(1.5, 3.0), None, "SPEAKER_01"


class _FakePipeline:
    def __call__(self, wav_path: str):
        return _FakeDiarizacao()


@pytest.fixture
def _pyannote_fake(monkeypatch):
    """Injeta um módulo `pyannote.audio` falso para não depender do modelo real."""
    calls: dict = {}

    class _FakePipelineClass:
        @staticmethod
        def from_pretrained(checkpoint, **kwargs):
            calls["checkpoint"] = checkpoint
            calls["kwargs"] = kwargs
            return _FakePipeline()

    fake_module = types.ModuleType("pyannote.audio")
    fake_module.Pipeline = _FakePipelineClass
    monkeypatch.setitem(sys.modules, "pyannote.audio", fake_module)
    monkeypatch.setitem(sys.modules, "pyannote", types.ModuleType("pyannote"))
    return calls


def test_rodar_pipeline_sync_usa_kwarg_token(_pyannote_fake, monkeypatch, tmp_path):
    monkeypatch.setattr(client.settings, "huggingface_token", "hf_fake")
    wav_path = tmp_path / "audio.wav"

    turns = client._rodar_pipeline_sync(wav_path)

    assert "token" in _pyannote_fake["kwargs"]
    assert "use_auth_token" not in _pyannote_fake["kwargs"]
    assert _pyannote_fake["kwargs"]["token"] == "hf_fake"
    assert turns == [
        {"start": 0.0, "end": 1.5, "speaker": "SPEAKER_00"},
        {"start": 1.5, "end": 3.0, "speaker": "SPEAKER_01"},
    ]
