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


# ─── D-719: o disparo do lote e a faxina da fila ─────────────────────────────


@pytest.mark.asyncio
async def test_lote_vazio_nao_dispara_nada(monkeypatch):
    from app.services import export_bulk_queue

    disparos = []
    monkeypatch.setattr(export_bulk_queue, "fire_and_forget", lambda *a, **k: disparos.append(a))

    await ExportService.bulk_upload_youtube_impl("projeto-1", [], [])

    assert disparos == [] and "projeto-1" not in ExportService._fila_youtube


@pytest.mark.asyncio
async def test_lote_poe_todos_na_fila_e_roda_em_segundo_plano(monkeypatch):
    from app.services import export_bulk_queue

    disparos = []

    def guardar(corotina, *, name):
        disparos.append(name)
        corotina.close()

    monkeypatch.setattr(export_bulk_queue, "fire_and_forget", guardar)

    await ExportService.bulk_upload_youtube_impl("projeto-12345678", ["c1", "c2"], ["2026-10-01"])

    assert ExportService._fila_youtube["projeto-12345678"] == {
        "c1": "aguardando",
        "c2": "aguardando",
    }
    assert disparos == ["yt-upload-projeto-"]


@pytest.mark.asyncio
async def test_a_fila_some_depois_do_prazo_de_faxina(monkeypatch):
    async def fake_upload(corte_id: str, scheduled_at: str | None = None) -> dict:
        return {"status": "ok"}

    monkeypatch.setitem(
        sys.modules,
        "app.services.youtube",
        types.SimpleNamespace(YouTubeService=types.SimpleNamespace(upload_video=fake_upload)),
    )

    await ExportService._run_youtube_upload_queue("projeto-1", [("c1", None)], cleanup_delay=0)

    assert "projeto-1" not in ExportService._fila_youtube


@pytest.mark.asyncio
async def test_cota_estourada_marca_o_resto_sem_tentar(monkeypatch):
    chamadas = []

    async def fake_upload(corte_id: str, scheduled_at: str | None = None) -> dict:
        chamadas.append(corte_id)
        return {"status": "erro", "cota_excedida": corte_id == "c2"}

    monkeypatch.setitem(
        sys.modules,
        "app.services.youtube",
        types.SimpleNamespace(YouTubeService=types.SimpleNamespace(upload_video=fake_upload)),
    )
    agenda = [("c1", None), ("c2", None), ("c3", None), ("c4", None)]

    await ExportService._run_youtube_upload_queue("projeto-1", agenda, cleanup_delay=None)

    assert chamadas == ["c1", "c2"]
    assert ExportService._fila_youtube["projeto-1"] == {
        "c1": "erro",
        "c2": "cota_excedida",
        "c3": "cota_excedida",
        "c4": "cota_excedida",
    }


@pytest.mark.parametrize(
    ("status", "cancelou", "fica"),
    [
        ("aguardando", True, "cancelado"),
        ("processando", True, "cancelado"),
        ("concluido", False, "concluido"),
    ],
)
def test_so_cancela_o_que_ainda_esta_na_fila_de_pos(monkeypatch, status, cancelou, fica):
    monkeypatch.setattr(ExportService, "_fila_processamento", {"projeto-1": {"c1": status}})

    assert ExportService.cancelar_item_processamento("c1") is cancelou
    assert ExportService._fila_processamento["projeto-1"]["c1"] == fica


def test_cancelar_o_que_nao_esta_em_fila_nenhuma(monkeypatch):
    monkeypatch.setattr(ExportService, "_fila_processamento", {})

    assert ExportService.cancelar_item_processamento("c1") is False
