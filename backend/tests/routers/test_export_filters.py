import pytest
from app.domain.cinema_filters import FILTROS_CINEMA
from app.routers import export as export_router


@pytest.mark.asyncio
async def test_listar_filtros_usa_catalogo_do_dominio():
    resposta = await export_router.listar_filtros()

    filtros = resposta["filtros"]
    ids = {filtro["id"] for filtro in filtros}

    assert ids == set(FILTROS_CINEMA.keys())
    assert all("nome" in filtro for filtro in filtros)
    assert all("descricao" in filtro for filtro in filtros)


async def _noop():
    return None


@pytest.mark.asyncio
async def test_processar_multiversion_sem_body_usa_todos_os_filtros(monkeypatch):
    chamada = {}

    def fake_processar_multiversion(corte_id, filtros=None, preview=True, preview_segundos=10):
        chamada.update(
            corte_id=corte_id,
            filtros=filtros,
            preview=preview,
            preview_segundos=preview_segundos,
        )
        return _noop()

    def fake_fire_and_forget(coro, *, name=None):
        coro.close()
        return object()

    monkeypatch.setattr(
        export_router.ExportService,
        "processar_multiversion",
        fake_processar_multiversion,
    )
    monkeypatch.setattr(export_router, "fire_and_forget", fake_fire_and_forget)

    resposta = await export_router.processar_multiversion("corte-1", body=None)

    assert chamada["corte_id"] == "corte-1"
    assert chamada["filtros"] == list(FILTROS_CINEMA.keys())
    assert resposta["filtros"] == list(FILTROS_CINEMA.keys())
