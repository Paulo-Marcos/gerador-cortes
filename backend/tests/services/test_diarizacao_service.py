"""Testes do serviço de diarização (D-286).

Mockam `AsyncSessionLocal`, o resolvedor de path e o cliente pyannote — não
tocam banco real nem a dependência pesada. Cobrem o caminho feliz (alinha +
persiste) e a degradação graciosa (sem turnos → transcrição intacta).
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.diarizacao import DiarizacaoService

_TRANSCRICAO = [
    {"inicio": "00:00:00", "fim": "00:00:05", "texto": "abertura do host"},
    {"inicio": "00:00:06", "fim": "00:00:09", "texto": "fala reagida"},
]


def _mock_db_factory():
    projeto = MagicMock()
    projeto.transcricao_raw = json.dumps(_TRANSCRICAO, ensure_ascii=False)
    projeto.arquivo_video_path = "video.mkv"
    projeto.falantes_map = "{}"

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=projeto)
    session.commit = AsyncMock()

    def factory():
        return session

    return factory, projeto


@pytest.mark.asyncio
async def test_diarizar_projeto_alinha_e_persiste(monkeypatch):
    factory, projeto = _mock_db_factory()
    turns = [
        {"start": 0.0, "end": 5.5, "speaker": "SPEAKER_00"},
        {"start": 10.0, "end": 40.0, "speaker": "SPEAKER_00"},
        {"start": 5.5, "end": 9.5, "speaker": "SPEAKER_01"},
    ]
    monkeypatch.setattr("app.services.diarizacao.AsyncSessionLocal", factory)
    monkeypatch.setattr(
        "app.services.diarizacao.resolver_do_projeto", lambda *a, **k: "/tmp/video.mkv"
    )
    monkeypatch.setattr(
        "app.services.diarizacao.diarizacao_client.diarizar", AsyncMock(return_value=turns)
    )

    resultado = await DiarizacaoService.diarizar_projeto("proj-1")

    assert resultado["ok"] is True
    # SPEAKER_00 domina o tempo de fala → é o canal.
    assert resultado["canal"] == "SPEAKER_00"
    assert resultado["falantes"]["SPEAKER_00"]["is_canal"] is True

    # Persistiu a transcrição rotulada e o mapa.
    segmentos_salvos = json.loads(projeto.transcricao_raw)
    assert segmentos_salvos[0]["speaker"] == "SPEAKER_00"
    assert segmentos_salvos[1]["speaker"] == "SPEAKER_01"
    assert "SPEAKER_00" in json.loads(projeto.falantes_map)


@pytest.mark.asyncio
async def test_diarizar_projeto_degrada_sem_turnos(monkeypatch):
    factory, projeto = _mock_db_factory()
    raw_original = projeto.transcricao_raw
    monkeypatch.setattr("app.services.diarizacao.AsyncSessionLocal", factory)
    monkeypatch.setattr(
        "app.services.diarizacao.resolver_do_projeto", lambda *a, **k: "/tmp/video.mkv"
    )
    monkeypatch.setattr(
        "app.services.diarizacao.diarizacao_client.diarizar", AsyncMock(return_value=None)
    )

    resultado = await DiarizacaoService.diarizar_projeto("proj-1")

    assert resultado["ok"] is False
    assert "motivo" in resultado
    # Transcrição permanece intacta (sem rótulo).
    assert projeto.transcricao_raw == raw_original


@pytest.mark.asyncio
async def test_atualizar_falantes_higieniza_o_mapa(monkeypatch):
    factory, projeto = _mock_db_factory()
    monkeypatch.setattr("app.services.diarizacao.AsyncSessionLocal", factory)

    atualizado = await DiarizacaoService.atualizar_falantes(
        "proj-1",
        {"SPEAKER_00": {"nome": "  Pedro  ", "is_canal": 1, "lixo": "x"}},
    )

    assert atualizado == {"SPEAKER_00": {"nome": "Pedro", "is_canal": True}}
    assert json.loads(projeto.falantes_map) == atualizado
