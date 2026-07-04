import sys
import types

import pytest

sys.modules.setdefault("auto_editor", types.SimpleNamespace())

from app.services.export import ExportService


@pytest.fixture(autouse=True)
def reset_youtube_queue():
    fila_youtube = ExportService._fila_youtube
    bulk_upload_sem = ExportService._bulk_upload_sem
    ExportService._fila_youtube = {}
    ExportService._bulk_upload_sem = None
    yield
    ExportService._fila_youtube = fila_youtube
    ExportService._bulk_upload_sem = bulk_upload_sem


@pytest.mark.asyncio
async def test_fila_youtube_continua_quando_um_upload_falha(monkeypatch):
    chamadas: list[tuple[str, str | None]] = []

    async def fake_upload(corte_id: str, scheduled_at: str | None = None) -> dict:
        chamadas.append((corte_id, scheduled_at))
        if corte_id == "corte-2":
            raise RuntimeError("falha-rede")
        if corte_id == "corte-3":
            return {"status": "erro", "mensagem": "sem metadados"}
        return {"status": "ok"}

    fake_youtube = types.SimpleNamespace(
        YouTubeService=types.SimpleNamespace(upload_video=fake_upload)
    )
    monkeypatch.setitem(sys.modules, "app.services.youtube", fake_youtube)

    projeto_id = "projeto-1"
    agenda = [
        ("corte-1", None),
        ("corte-2", "2026-05-22T15:00:00Z"),
        ("corte-3", None),
        ("corte-4", "2026-05-22T15:15:00Z"),
    ]
    ExportService._fila_youtube[projeto_id] = {corte_id: "aguardando" for corte_id, _ in agenda}

    await ExportService._run_youtube_upload_queue(projeto_id, agenda, cleanup_delay=None)

    assert chamadas == agenda
    assert ExportService._fila_youtube[projeto_id] == {
        "corte-1": "concluido",
        "corte-2": "erro",
        "corte-3": "erro",
        "corte-4": "concluido",
    }
