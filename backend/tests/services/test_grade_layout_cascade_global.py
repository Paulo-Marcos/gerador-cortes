"""D-414: a Fase 1 (grade) tem de enxergar o padrao GLOBAL do layout YouTube.

O layout do corte precisa chegar CRU em `_executar_grade` — a mesma regra que
`_preparar_overlay_chunks` ja segue. Pre-normalizar o corte contra o padrao do
projeto preenche fundo/placa/compartilhada/full com os DEFAULTS de codigo; la
embaixo, `resolver_layout_em_cascata` ve um payload "configurado" e descarta o
nivel global inteiro — o corte intocado renderizava sem crop, sem palco e com o
fundo/placa errados.
"""

from __future__ import annotations

import json
import types

import app.services.render.pipeline_render as pr
import pytest
from app.domain.corte.youtube_layout import regioes_full_posicionadas, resolver_layout_em_cascata
from app.services.app_settings import AppSettingsService

# Espelha o preset "OBS FULL" salvo como padrao global: crop do bruto + encaixe
# no canvas com respiro (o palco de 1 tela), mais fundo e placa editoriais.
GLOBAL_OBS_FULL = json.dumps(
    {
        "modo_padrao": "full",
        "fundo": "hud-topo",
        "placa": {"nome": "Pedro Ivo", "papel": "apresentador"},
        "full": {
            "crop": {"x": 225, "y": 139, "w": 1482, "h": 808},
            "slot": {"x": 150, "y": 130, "w": 1630, "h": 889},
        },
    }
)


class _FakeDB:
    """Corte e projeto SEM layout proprio — so o global deve valer."""

    async def get(self, model, _id):
        if model.__name__ == "Corte":
            return types.SimpleNamespace(
                id="corteY",
                projeto_id="projX",
                arquivo_clip_path=None,
                layout_youtube=None,
                cenas_remotion=None,
                duracao_clip_seg=10.0,
                inicio_seg=0.0,
                fim_seg=10.0,
            )
        return types.SimpleNamespace(
            layout_youtube_padrao=None,
            sombra_nivel_padrao="nenhuma",
            layout_card_padrao="vertical",
            fonte_preset="atual",
        )

    async def commit(self):
        return None


class _FakeSession:
    async def __aenter__(self):
        return _FakeDB()

    async def __aexit__(self, *exc):
        return False


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


async def _kwargs_da_grade(tmp_path, monkeypatch) -> dict:
    """Roda o pipeline com todas as fases dubladas e devolve os kwargs da grade."""
    AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
    AppSettingsService.update_youtube_layout_padrao_global(GLOBAL_OBS_FULL)
    monkeypatch.setattr(pr, "AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    corte_dir = tmp_path / "projX" / "cortes" / "corteY"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw.mkv").write_bytes(b"x")

    async def _invalido(_p):
        return False

    async def _bundle(_d):
        return tmp_path / "bundle"

    async def _noop(*a, **k):
        return None

    async def _sem_chunks(*a, **k):
        return []

    monkeypatch.setattr(pr, "_validar_video_completo", _invalido)
    monkeypatch.setattr(pr, "_preparar_bundle_overlay", _bundle)
    monkeypatch.setattr(pr, "_preparar_overlay_chunks", _sem_chunks)
    monkeypatch.setattr(pr, "_filtrar_chunks_pendentes", lambda **k: k["overlay_chunks"])
    monkeypatch.setattr(pr, "_executar_batch_overlay_chunks_parallel", _sem_chunks)
    monkeypatch.setattr(pr, "_executar_render_final", _noop)
    monkeypatch.setattr(pr, "_publicar_video_final", _noop)
    monkeypatch.setattr(pr, "_finalizar_corte", _noop)

    capturado: dict = {}

    async def fake_grade(*args, **kwargs):
        capturado.update(kwargs)

    monkeypatch.setattr(pr, "_executar_grade", fake_grade)

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=False)
    assert resultado["status"] == "sucesso"
    return capturado


@pytest.mark.asyncio
async def test_grade_recebe_o_global_na_cascade(tmp_path, monkeypatch) -> None:
    capturado = await _kwargs_da_grade(tmp_path, monkeypatch)

    resolvido = resolver_layout_em_cascata(
        corte_layout=capturado["layout_youtube"],
        projeto_padrao=capturado["projeto_padrao"],
        global_padrao=capturado["global_padrao"],
    )

    assert resolvido["fundo"] == "hud-topo"
    assert resolvido["placa"]["nome"] == "Pedro Ivo"
    assert resolvido["full"]["crop"] == {"x": 225, "y": 139, "w": 1482, "h": 808}


@pytest.mark.asyncio
async def test_grade_posiciona_o_full_do_global(tmp_path, monkeypatch) -> None:
    """O sintoma reportado: sem o global, `regioes_full_posicionadas` volta
    vazia e o filtergraph sai sem crop/palco — video puro de quadro inteiro."""
    capturado = await _kwargs_da_grade(tmp_path, monkeypatch)

    regioes = regioes_full_posicionadas(
        capturado["layout_youtube"],
        duracao_seg=capturado["duracao_seg"],
        fallback_layout=capturado["projeto_padrao"],
        global_padrao=capturado["global_padrao"],
    )

    assert len(regioes) == 1
    assert regioes[0]["crop"] == {"x": 225, "y": 139, "w": 1482, "h": 808}
