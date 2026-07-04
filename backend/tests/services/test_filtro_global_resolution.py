"""Tests for I-023: filtro de render deve vir do AppSettings.filtro_global_padrao.

Regressão preventiva. O bug original (render sempre usando `cinematic_iii`
completo, ignorando o Filtro Global definido em Ajustes) tinha duas causas
sobreviventes: (1) fallback hardcoded no frontend; (2) coluna `Projeto.filtro_padrao`
que parasitava como "padrão por projeto" sem refletir o global.

Estes testes garantem que:
- `RemotionRenderService.iniciar_render_background(filtro=None)` resolve para
  o global de AppSettings (não para um literal cinematic_iii).
- A coluna `Projeto.filtro_padrao` foi removida do modelo ORM (fonte única).
- O endpoint PATCH /api/export/projeto/{id}/filtro-padrao não existe mais.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.models import Projeto


def test_projeto_model_nao_tem_mais_filtro_padrao():
    """Fonte única do filtro = AppSettings.filtro_global_padrao."""
    assert not hasattr(Projeto, "filtro_padrao"), (
        "Projeto.filtro_padrao foi removido em I-023 — o filtro de render "
        "vive apenas em AppSettings.filtro_global_padrao."
    )


def test_iniciar_render_resolve_filtro_global_quando_nao_especificado():
    """`filtro=None` (default) tem que cair no global de AppSettings, NUNCA
    em um literal como 'cinematic_iii'."""
    from app.services import remotion_render as rr

    captured = {}

    def fake_pipeline(corte_id, **kwargs):
        captured["filtro"] = kwargs.get("filtro")

        # Retorna corotina-substituta — o task.add_done_callback espera um Task,
        # então mocamos create_task abaixo para não disparar nada de verdade.
        async def _noop():
            return None

        return _noop()

    class _FakeSettings:
        filtro_global_padrao = "cinematic_iii_leve"

    class _FakeService:
        @staticmethod
        def get():
            return _FakeSettings()

    with (
        patch.object(rr, "renderizar_pipeline_otimizado", new=fake_pipeline),
        patch.object(rr.RenderProgressStore, "is_running", return_value=False),
        patch.object(rr.RenderProgressStore, "start"),
        patch.object(rr.asyncio, "get_event_loop") as mock_loop,
        patch("app.services.app_settings.AppSettingsService", _FakeService),
    ):
        # create_task tem que retornar algo com add_done_callback (mock de Task).
        def _wrap(coro):
            coro.close()
            task = MagicMock()
            task.add_done_callback = MagicMock()
            return task

        mock_loop.return_value.create_task.side_effect = _wrap

        rr.RemotionRenderService.iniciar_render_background("corte-x", filtro=None)

    assert captured["filtro"] == "cinematic_iii_leve", (
        "filtro=None precisa resolver para AppSettings.filtro_global_padrao, "
        f"mas resolveu para {captured['filtro']!r}"
    )


def test_iniciar_render_respeita_filtro_explicito_de_teste():
    """Quando o caller passa filtro explícito (ex.: aba de testes), o pipeline
    recebe ESSE filtro — não o global. (Sanity check do contrato.)"""
    from app.services import remotion_render as rr

    captured = {}

    def fake_pipeline(corte_id, **kwargs):
        captured["filtro"] = kwargs.get("filtro")

        async def _noop():
            return None

        return _noop()

    with (
        patch.object(rr, "renderizar_pipeline_otimizado", new=fake_pipeline),
        patch.object(rr.RenderProgressStore, "is_running", return_value=False),
        patch.object(rr.RenderProgressStore, "start"),
        patch.object(rr.asyncio, "get_event_loop") as mock_loop,
    ):
        # create_task tem que retornar algo com add_done_callback (mock de Task).
        def _wrap(coro):
            coro.close()
            task = MagicMock()
            task.add_done_callback = MagicMock()
            return task

        mock_loop.return_value.create_task.side_effect = _wrap

        rr.RemotionRenderService.iniciar_render_background("corte-x", filtro="noir_bypass")

    assert captured["filtro"] == "noir_bypass"


def test_endpoint_patch_filtro_padrao_foi_removido():
    """PATCH /api/export/projeto/{id}/filtro-padrao não pode mais existir."""
    from app.main import app

    rotas_relevantes = []
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if "filtro-padrao" in path and "PATCH" in methods:
            rotas_relevantes.append(f"{','.join(sorted(methods))} {path}")

    assert not rotas_relevantes, (
        "Endpoint PATCH .../filtro-padrao foi removido em I-023, mas ainda "
        f"está registrado: {rotas_relevantes}"
    )
