"""Render final em lote roda SEQUENCIAL (D-364).

Garante que `_run_processar_queue` processa um corte de cada vez — em paralelo,
os ffmpeg de render concorrentes estouravam CPU/RAM da máquina do editor.
"""

import asyncio

import pytest
from app.services.export import ExportService
from app.services.export_bulk_queue import _BULK_PROCESSAR_CONCORRENCIA


def test_concorrencia_configurada_como_sequencial():
    assert _BULK_PROCESSAR_CONCORRENCIA == 1


@pytest.mark.asyncio
async def test_run_processar_queue_nao_roda_em_paralelo(monkeypatch):
    ExportService._bulk_processar_sem = asyncio.Semaphore(_BULK_PROCESSAR_CONCORRENCIA)
    ExportService._fila_processamento.clear()

    estado = {"atual": 0, "max": 0}

    async def fake_processar_clip(corte_id: str, filtro: str = "nenhum"):
        estado["atual"] += 1
        estado["max"] = max(estado["max"], estado["atual"])
        await asyncio.sleep(0.01)
        estado["atual"] -= 1

    monkeypatch.setattr(ExportService, "processar_clip", fake_processar_clip)

    corte_ids = ["a", "b", "c"]
    ExportService._fila_processamento["proj"] = {cid: "aguardando" for cid in corte_ids}

    await ExportService._run_processar_queue("proj", corte_ids, "nenhum", cleanup_delay=None)

    assert estado["max"] == 1  # nunca dois ao mesmo tempo
    assert ExportService._fila_processamento["proj"] == {
        "a": "concluido",
        "b": "concluido",
        "c": "concluido",
    }


@pytest.mark.asyncio
async def test_run_processar_queue_marca_erro_sem_derrubar_os_demais(monkeypatch):
    ExportService._bulk_processar_sem = asyncio.Semaphore(_BULK_PROCESSAR_CONCORRENCIA)
    ExportService._fila_processamento.clear()

    async def fake_processar_clip(corte_id: str, filtro: str = "nenhum"):
        if corte_id == "b":
            raise RuntimeError("falha simulada")

    monkeypatch.setattr(ExportService, "processar_clip", fake_processar_clip)

    corte_ids = ["a", "b", "c"]
    ExportService._fila_processamento["proj"] = {cid: "aguardando" for cid in corte_ids}

    await ExportService._run_processar_queue("proj", corte_ids, "nenhum", cleanup_delay=None)

    fila = ExportService._fila_processamento["proj"]
    assert fila["a"] == "concluido"
    assert fila["b"] == "erro"
    assert fila["c"] == "concluido"  # o erro em 'b' não impede 'c'
