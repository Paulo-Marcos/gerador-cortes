import pytest
from app.routers import export as export_router


class _FakeDb:
    """Stub p/ AsyncSession — endpoint nao usa db."""


@pytest.mark.asyncio
async def test_scheduled_dates_do_payload_passa_intacto(monkeypatch):
    """Quando front envia scheduled_dates, router deve usa-los direto (15min apart)."""
    capturado: dict = {}

    async def fake_bulk(projeto_id, corte_ids, scheduled_dates):
        capturado["projeto_id"] = projeto_id
        capturado["corte_ids"] = corte_ids
        capturado["scheduled_dates"] = scheduled_dates

    monkeypatch.setattr(export_router.ExportService, "bulk_upload_youtube_impl", fake_bulk)

    datas = [
        "2026-05-30T15:00:00Z",
        "2026-05-30T15:15:00Z",
        "2026-05-30T15:30:00Z",
        "2026-05-30T15:45:00Z",
    ]
    body = export_router.BulkYouTubeRequest(
        corte_ids=["c1", "c2", "c3", "c4"],
        agendar=True,
        videos_por_dia=4,
        data_inicio=datas[0],
        hora_publicacao="00:00",
        scheduled_dates=datas,
    )

    resp = await export_router.bulk_upload_youtube("proj-1", body, db=_FakeDb())

    assert capturado["scheduled_dates"] == datas
    assert [item["scheduled_at"] for item in resp["agenda"]] == datas


@pytest.mark.asyncio
async def test_fallback_legado_quando_scheduled_dates_ausente(monkeypatch):
    """Sem scheduled_dates, mantem calculo antigo por videos_por_dia (1 dia → mesmo horario)."""
    capturado: dict = {}

    async def fake_bulk(projeto_id, corte_ids, scheduled_dates):
        capturado["scheduled_dates"] = scheduled_dates

    monkeypatch.setattr(export_router.ExportService, "bulk_upload_youtube_impl", fake_bulk)

    body = export_router.BulkYouTubeRequest(
        corte_ids=["c1", "c2", "c3"],
        agendar=True,
        videos_por_dia=3,
        data_inicio="2026-05-30T15:00:00Z",
        hora_publicacao="15:00",
    )

    await export_router.bulk_upload_youtube("proj-1", body, db=_FakeDb())

    assert capturado["scheduled_dates"] == [
        "2026-05-30T15:00:00Z",
        "2026-05-30T15:00:00Z",
        "2026-05-30T15:00:00Z",
    ]


@pytest.mark.asyncio
async def test_sem_agendamento_envia_none(monkeypatch):
    capturado: dict = {}

    async def fake_bulk(projeto_id, corte_ids, scheduled_dates):
        capturado["scheduled_dates"] = scheduled_dates

    monkeypatch.setattr(export_router.ExportService, "bulk_upload_youtube_impl", fake_bulk)

    body = export_router.BulkYouTubeRequest(
        corte_ids=["c1", "c2"],
        agendar=False,
    )

    await export_router.bulk_upload_youtube("proj-1", body, db=_FakeDb())

    assert capturado["scheduled_dates"] == [None, None]
