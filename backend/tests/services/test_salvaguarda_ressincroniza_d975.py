"""D-975: refazer o bruto "só o vídeo" ainda passa pela salvaguarda de silêncios.

A fábrica de shorts regera o bruto com `refazer_transcricao=False,
refazer_cenas=False` (D-160). Os flags só calam as etapas derivadas: a
salvaguarda de silêncios roda do mesmo jeito, e é ela que termina em
`sincronizar_transcricao_corte` e reescreve a `transcricao_final` do corte.
A auditoria da D-973 confiou num texto que dizia o contrário; este teste fixa o
comportamento que as docstrings agora descrevem.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import corte as corte_module
from app.services import export as export_module
from app.services.export import ExportService


@pytest.mark.asyncio
async def test_regerar_sem_refazer_transcricao_ainda_roda_a_salvaguarda(monkeypatch):
    corte = MagicMock(id="corte-z", projeto_id="proj-z")
    session = AsyncMock()
    # Projeto ausente: sai logo depois da salvaguarda, sem tocar no FFmpeg.
    session.get = AsyncMock(side_effect=[corte, None])

    @asynccontextmanager
    async def factory():
        yield session

    monkeypatch.setattr(export_module, "AsyncSessionLocal", factory)

    chamadas: list[tuple[str, bool]] = []

    async def _fake_detectar(corte_id: str, limpar_anteriores: bool = False):
        chamadas.append((corte_id, limpar_anteriores))
        return {"status": "sucesso"}

    monkeypatch.setattr(
        corte_module.CorteService, "detectar_silencios_tecnico", staticmethod(_fake_detectar)
    )

    await ExportService.gerar_bruto_via_worker(
        "corte-z", refazer_transcricao=False, refazer_cenas=False
    )

    assert chamadas == [("corte-z", True)]
