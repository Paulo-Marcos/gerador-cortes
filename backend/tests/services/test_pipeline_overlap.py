"""Prova que a Fase 1 (grade) e a Fase 2 (overlays) rodam EM PARALELO no
orquestrador — a grade vira uma task e os overlays renderizam enquanto ela
processa; o `await` da grade fica antes da Fase 3.
"""

import asyncio
import time
import types

import app.services.pipeline_render as pr
import pytest
from app.services.app_settings import AppSettingsService, LogLevel


def teardown_function():
    AppSettingsService.set_settings_path_for_tests(None)


class _FakeDB:
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


@pytest.mark.asyncio
async def test_grade_e_overlays_rodam_em_paralelo(tmp_path, monkeypatch):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    monkeypatch.setattr(pr, "AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    # clip_raw presente -> a grade RODA (nao pula).
    corte_dir = tmp_path / "projX" / "cortes" / "corteY"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw.mkv").write_bytes(b"x")

    async def _invalido(_p):
        return False  # graded e video_final invalidos -> grade e render rodam

    async def _bundle(_d):
        return tmp_path / "bundle"

    async def _noop(*a, **k):
        return None

    async def _um_chunk(*a, **k):
        return [{"id": "001", "start_sec": 0.0, "end_sec": 5.0, "entries": []}]

    monkeypatch.setattr(pr, "_validar_video_completo", _invalido)
    monkeypatch.setattr(pr, "_preparar_bundle_overlay", _bundle)
    monkeypatch.setattr(pr, "_aplicar_retencao_apos_grade", _noop)
    monkeypatch.setattr(pr, "_preparar_overlay_chunks", _um_chunk)
    monkeypatch.setattr(pr, "_filtrar_chunks_pendentes", lambda **k: k["overlay_chunks"])
    monkeypatch.setattr(pr, "_executar_render_final", _noop)
    monkeypatch.setattr(pr, "_publicar_video_final", _noop)
    monkeypatch.setattr(pr, "_finalizar_corte", _noop)

    eventos: list[tuple[str, float]] = []

    async def fake_grade(*a, **k):
        eventos.append(("grade_start", time.monotonic()))
        await asyncio.sleep(0.25)
        eventos.append(("grade_end", time.monotonic()))

    async def fake_overlays(*a, **k):
        eventos.append(("ov_start", time.monotonic()))
        await asyncio.sleep(0.25)
        eventos.append(("ov_end", time.monotonic()))
        return []

    monkeypatch.setattr(pr, "_executar_grade", fake_grade)
    monkeypatch.setattr(pr, "_executar_batch_overlay_chunks_parallel", fake_overlays)

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=False)
    assert resultado["status"] == "sucesso"

    t = dict(eventos)
    assert {"grade_start", "grade_end", "ov_start", "ov_end"} <= set(t)
    # OVERLAP: a grade comecou antes dos overlays terminarem E os overlays
    # comecaram antes da grade terminar -> houve sobreposicao no tempo.
    assert t["grade_start"] < t["ov_end"], "grade nao comecou antes dos overlays terminarem"
    assert t["ov_start"] < t["grade_end"], "overlays nao comecaram antes da grade terminar"
    # Sequencial levaria ~0.5s; paralelo ~0.25s. Confirma que nao serializou.
    parede = max(t["grade_end"], t["ov_end"]) - min(t["grade_start"], t["ov_start"])
    assert parede < 0.45, f"tempo de parede {parede:.2f}s sugere execucao sequencial"
