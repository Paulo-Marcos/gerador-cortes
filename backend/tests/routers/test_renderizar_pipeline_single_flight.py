"""D-093: POST /cortes/{id}/renderizar-pipeline rejeita 409 quando ja existe
pipeline rodando para o mesmo corte.

Sem o guard, um clique duplo (ou dois tabs) disparava um segundo render que,
com `continuar=False`, zerava os artefatos da run em andamento via
`_deve_limpar_artefatos` e matava a grade. O usuario observava o pipeline
"refazendo a fase 0".
"""

import pytest
from app.routers import cortes as cortes_router
from app.services.render_progress import RenderProgressStore
from fastapi import HTTPException


@pytest.fixture(autouse=True)
def _reset_store():
    # Store em memoria global; isola entre testes.
    RenderProgressStore._progress.pop("corte-x", None)
    yield
    RenderProgressStore._progress.pop("corte-x", None)


@pytest.mark.asyncio
async def test_renderizar_pipeline_dispara_quando_ocioso(monkeypatch):
    chamada = {}

    def fake_iniciar(corte_id, **kwargs):
        chamada["corte_id"] = corte_id
        chamada.update(kwargs)

    monkeypatch.setattr(
        cortes_router.RemotionRenderService,
        "iniciar_render_background",
        fake_iniciar,
    )

    resposta = await cortes_router.renderizar_pipeline(
        "corte-x", body=cortes_router.RenderPipelineRequest()
    )

    assert chamada["corte_id"] == "corte-x"
    assert "Pipeline otimizado iniciado" in resposta["message"]


@pytest.mark.asyncio
async def test_renderizar_pipeline_rejeita_409_se_ja_rodando(monkeypatch):
    def fake_iniciar(*_args, **_kwargs):  # pragma: no cover - nao deve ser chamado
        raise AssertionError("nao deveria iniciar com render em andamento")

    monkeypatch.setattr(
        cortes_router.RemotionRenderService,
        "iniciar_render_background",
        fake_iniciar,
    )
    RenderProgressStore.start("corte-x", stage="Fase 2/4")
    RenderProgressStore.update("corte-x", progress=42, stage="Fase 2/4")

    with pytest.raises(HTTPException) as exc:
        await cortes_router.renderizar_pipeline(
            "corte-x", body=cortes_router.RenderPipelineRequest()
        )

    assert exc.value.status_code == 409
    detail = exc.value.detail
    assert isinstance(detail, dict)
    assert "ja em execucao" in detail["message"].lower()
    assert detail["progress"]["progress"] == 42
