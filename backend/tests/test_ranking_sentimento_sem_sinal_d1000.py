"""Sem comentários, ou com o Claude falhando, o sentimento sai sem sinal (D-1000).

Antes saía 5,0, que o ranking por lote trataria como a pior nota do lote.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from app.infrastructure import claude_cli_client
from app.infrastructure.youtube_data_api import ComentarioTopo
from app.services import ranking_lives


@pytest.mark.asyncio
async def test_sem_comentarios_nao_ha_sinal():
    assert await ranking_lives.avaliar_sentimento_dos_comentarios([]) == (None, [])


@pytest.mark.asyncio
async def test_claude_falhando_nao_ha_sinal(monkeypatch):
    async def _falha(*_args, **_kwargs):
        raise claude_cli_client.ClaudeCliError("fora do ar")

    monkeypatch.setattr(claude_cli_client, "generate_json", _falha)
    comentarios = [
        ComentarioTopo(
            autor="a", texto="que live boa", likes=3, publicado_em=datetime(2026, 10, 1, tzinfo=UTC)
        )
    ]
    assert await ranking_lives.avaliar_sentimento_dos_comentarios(comentarios) == (None, [])
