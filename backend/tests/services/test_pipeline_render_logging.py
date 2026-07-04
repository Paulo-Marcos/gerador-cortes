"""Integração focada nos LOGS de tempo do orquestrador de render.

Roda `renderizar_pipeline_otimizado` de verdade pelo caminho "tudo já
pronto" (todas as fases puladas), com as fronteiras de I/O (DB, worker,
bundle, finalização) mockadas. Prova que os marcos de log de tempo real
(INÍCIO / fim de fase / CONCLUÍDO com horário e duração) são emitidos.

Não exercita FFmpeg/Remotion — isso é coberto pelos testes de integração
de codec. Aqui o alvo é exclusivamente a observabilidade do tempo.
"""

import re
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


def _patch_io(monkeypatch, tmp_path: Path):
    """Mocka apenas as bordas de I/O — a orquestração e os logs rodam de verdade."""
    monkeypatch.setattr(pr, "AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _valido(_path):
        return True

    async def _bundle(_dir):
        return tmp_path / "bundle"

    async def _retencao(_db, _log, _corte):
        return None

    async def _sem_chunks(*_a, **_k):
        return []

    async def _finalizar(_db, _corte, _upload):
        return None

    monkeypatch.setattr(pr, "_validar_video_completo", _valido)
    monkeypatch.setattr(pr, "_preparar_bundle_overlay", _bundle)
    monkeypatch.setattr(pr, "_aplicar_retencao_apos_grade", _retencao)
    monkeypatch.setattr(pr, "_preparar_overlay_chunks", _sem_chunks)
    monkeypatch.setattr(pr, "_finalizar_corte", _finalizar)


@pytest.mark.asyncio
async def test_pipeline_emite_marcos_de_tempo_real(tmp_path, monkeypatch, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    _patch_io(monkeypatch, tmp_path)

    # video.mp4 final já existe => Fase 3 pulada (sem invocar FFmpeg).
    upload_dir = tmp_path / "projX" / "cortes" / "corteY" / "upload_ready"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "video.mp4").write_bytes(b"x")

    resultado = await pr.renderizar_pipeline_otimizado("corteY", continuar=True)

    assert resultado["status"] == "sucesso"
    saida = capsys.readouterr().out

    # Marco de INÍCIO com hora de relógio real.
    assert re.search(r"▶ INÍCIO do render do corte corteY às \d{2}:\d{2}:\d{2}", saida), saida
    # Marco de CONCLUSÃO com início, fim e tempo total.
    assert re.search(
        r"✅ CONCLUÍDO corteY \| início \d{2}:\d{2}:\d{2} \| fim \d{2}:\d{2}:\d{2} \| tempo total ",
        saida,
    ), saida
    # Cada linha operacional carrega o prefixo de hora [HH:MM:SS].
    assert re.search(r"^\[\d{2}:\d{2}:\d{2}\] \[Render final\]", saida, re.MULTILINE), saida


@pytest.mark.asyncio
async def test_pipeline_loga_duracao_da_fase_overlays(tmp_path, monkeypatch, capsys):
    AppSettingsService.set_settings_path_for_tests(tmp_path / "settings.json")
    AppSettingsService.update_log_level(LogLevel.INFO)
    _patch_io(monkeypatch, tmp_path)

    upload_dir = tmp_path / "projX" / "cortes" / "corteY" / "upload_ready"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / "video.mp4").write_bytes(b"x")

    await pr.renderizar_pipeline_otimizado("corteY", continuar=True)

    saida = capsys.readouterr().out
    # A fase de overlays reporta conclusão com duração legível e hora de fim.
    assert re.search(
        r"✅ Fase 2/4 \(Overlays\) concluída em .+ \(fim às \d{2}:\d{2}:\d{2}\)", saida
    ), saida
