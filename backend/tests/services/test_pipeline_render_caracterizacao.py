"""Caracterização do ORQUESTRADOR `renderizar_pipeline_otimizado`.

Trava o comportamento observável do orquestrador ANTES do refactor D-323
(extração das fases): a SEQUÊNCIA exata de eventos emitidos no `PipelineEventLog`,
o early-return de render parcial e o cleanup das tasks pendentes quando uma
fase falha. É a rede de segurança do refactor behavior-preserving — qualquer
mudança na ordem/nome dos eventos, no fluxo parcial ou no cancelamento das
tasks quebra estes testes.

As bordas de I/O (DB, worker, bundle, grade, overlays, render final,
finalização) são mockadas; a orquestração roda de verdade.
"""

import asyncio
import types
from pathlib import Path

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


class _EventRecorder:
    """Substitui `PipelineEventLog` capturando a sequência de `emit`."""

    eventos: list[str] = []

    def __init__(self, *_a, **_k):
        pass

    @property
    def path(self):
        return Path("dummy.jsonl")

    def emit(self, event, **_k):
        type(self).eventos.append(event)


def _base_patches(monkeypatch, tmp_path: Path):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    monkeypatch.setattr(pr, "AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    _EventRecorder.eventos = []
    monkeypatch.setattr(pr, "PipelineEventLog", _EventRecorder)

    async def _bundle(_d):
        return tmp_path / "bundle"

    async def _noop(*_a, **_k):
        return None

    async def _um_chunk(*_a, **_k):
        return [{"id": "001", "start_sec": 0.0, "end_sec": 5.0, "entries": []}]

    monkeypatch.setattr(pr, "_preparar_bundle_overlay", _bundle)
    monkeypatch.setattr(pr, "_preparar_overlay_chunks", _um_chunk)
    monkeypatch.setattr(pr, "_filtrar_chunks_pendentes", lambda **k: k["overlay_chunks"])
    monkeypatch.setattr(pr, "_publicar_video_final", _noop)
    monkeypatch.setattr(pr, "_finalizar_corte", _noop)


@pytest.mark.asyncio
async def test_sequencia_de_eventos_run_completo(tmp_path, monkeypatch):
    """Run do zero: grade∥overlays, render final e finalização.

    Trava a ordem canônica dos eventos do caminho feliz completo.
    """
    _base_patches(monkeypatch, tmp_path)

    corte_dir = tmp_path / "projX" / "cortes" / "corteY"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw.mkv").write_bytes(b"x")

    async def _invalido(_p):
        return False  # graded e video_final inválidos → grade e render rodam

    async def _grade(*_a, **_k):
        return None

    async def _overlays(*_a, **_k):
        return []  # nenhum chunk falhou

    async def _render_final(*_a, **_k):
        return None

    monkeypatch.setattr(pr, "_validar_video_completo", _invalido)
    monkeypatch.setattr(pr, "_executar_grade", _grade)
    monkeypatch.setattr(pr, "_executar_batch_overlay_chunks_parallel", _overlays)
    monkeypatch.setattr(pr, "_executar_render_final", _render_final)

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=False)

    assert resultado == {
        "status": "sucesso",
        "output": str(corte_dir / "upload_ready" / "video.mp4"),
    }
    assert _EventRecorder.eventos == [
        "pipeline_iniciado",
        "bundle_remotion_iniciado",
        "fase_iniciada",  # grade
        "fase_iniciada",  # overlays
        "bundle_remotion_pronto",
        "fase_concluida",  # overlays
        "fase_concluida",  # grade
        "fase_iniciada",  # render_final
        "fase_concluida",  # render_final
        "pipeline_concluido",
    ]


@pytest.mark.asyncio
async def test_sequencia_de_eventos_tudo_pulado(tmp_path, monkeypatch):
    """Retomada com todos os artefatos válidos: todas as fases puladas."""
    _base_patches(monkeypatch, tmp_path)

    upload_dir = tmp_path / "projX" / "cortes" / "corteY" / "upload_ready"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "video.mp4").write_bytes(b"x")

    async def _valido(_p):
        return True

    monkeypatch.setattr(pr, "_validar_video_completo", _valido)
    # Overlays já prontos: nada a renderizar → o batch não é chamado e o
    # bundle não precisa ser aguardado (sem `bundle_remotion_pronto`).
    monkeypatch.setattr(pr, "_filtrar_chunks_pendentes", lambda **k: [])

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=True)

    assert resultado["status"] == "sucesso"
    assert _EventRecorder.eventos == [
        "pipeline_iniciado",
        "bundle_remotion_iniciado",
        "fase_pulada",  # grade (artefato válido)
        "fase_iniciada",  # overlays
        "fase_concluida",  # overlays (todos os chunks já existem)
        "fase_pulada",  # render_final (artefato válido)
        "pipeline_concluido",
    ]


@pytest.mark.asyncio
async def test_render_parcial_para_na_grade(tmp_path, monkeypatch):
    """`parar_em='grade'`: grade roda, overlays são pulados (preservados),
    o pipeline retorna sucesso_parcial sem compor o vídeo final."""
    _base_patches(monkeypatch, tmp_path)

    corte_dir = tmp_path / "projX" / "cortes" / "corteY"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw.mkv").write_bytes(b"x")

    async def _invalido(_p):
        return False

    async def _grade(*_a, **_k):
        return None

    monkeypatch.setattr(pr, "_validar_video_completo", _invalido)
    monkeypatch.setattr(pr, "_executar_grade", _grade)

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=True, parar_em="grade")

    assert resultado["status"] == "sucesso_parcial"
    assert resultado["parou_em"] == "grade"
    assert resultado["output"] == str(corte_dir / "graded" / "clip_graded.mp4")
    assert _EventRecorder.eventos == [
        "pipeline_iniciado",
        "bundle_remotion_iniciado",
        "fase_iniciada",  # grade
        "fase_pulada",  # overlays (motivo=parar_em)
        "fase_concluida",  # grade
        "pipeline_parcial_concluido",
    ]


@pytest.mark.asyncio
async def test_falha_na_fase2_emite_falhou_e_cancela_grade(tmp_path, monkeypatch):
    """Falha na Fase 2 (overlays): emite fase_falhou + pipeline_falhou,
    propaga a exceção e cancela a grade que rodava em paralelo (cleanup do
    `finally`) sem deixá-la órfã.
    """
    _base_patches(monkeypatch, tmp_path)

    corte_dir = tmp_path / "projX" / "cortes" / "corteY"
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw.mkv").write_bytes(b"x")

    grade_cancelada = {"v": False}

    async def _invalido(_p):
        return False

    async def _grade_longa(*_a, **_k):
        try:
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            grade_cancelada["v"] = True
            raise

    async def _overlays_explode(*_a, **_k):
        raise RuntimeError("boom na fase 2")

    monkeypatch.setattr(pr, "_validar_video_completo", _invalido)
    monkeypatch.setattr(pr, "_executar_grade", _grade_longa)
    monkeypatch.setattr(pr, "_executar_batch_overlay_chunks_parallel", _overlays_explode)

    with pytest.raises(RuntimeError, match="boom na fase 2"):
        await pr.renderizar_pipeline_otimizado("corteY", continuar=False)

    assert grade_cancelada["v"] is True, "a grade paralela deveria ter sido cancelada no finally"
    assert _EventRecorder.eventos == [
        "pipeline_iniciado",
        "bundle_remotion_iniciado",
        "fase_iniciada",  # grade
        "fase_iniciada",  # overlays
        "bundle_remotion_pronto",
        "fase_falhou",  # overlays
        "pipeline_falhou",
    ]
