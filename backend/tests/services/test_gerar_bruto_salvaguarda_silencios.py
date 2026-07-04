"""F-017: salvaguarda de retirada de silencios em gerar_bruto_via_worker.

Garante que cliques em "Bruto" ou "Regerar bruto" sempre disparem a
detecao tecnica de silencios antes de calcular os segmentos do clip,
mesmo que o editor tenha esquecido de rodar a detecao manualmente.
"""

import json
import types
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import export as export_module
from app.services.export import ExportService


def _fake_session_factory(corte_obj, projeto_obj=None):
    """Constroi um async context manager que devolve uma sessao mockada.

    A sessao retorna `corte_obj` no primeiro get e `projeto_obj` (None por
    padrao, forcando saida antecipada com 'Projeto nao encontrado') no
    segundo. Suficiente para exercitar a salvaguarda sem tocar em FFmpeg.
    """

    session = AsyncMock()
    session.get = AsyncMock(side_effect=[corte_obj, projeto_obj])
    session.refresh = AsyncMock()
    session.commit = AsyncMock()

    @asynccontextmanager
    async def factory():
        yield session

    return factory, session


@pytest.mark.asyncio
async def test_gerar_bruto_dispara_detectar_silencios_antes_do_bruto(monkeypatch):
    corte = MagicMock(id="corte-x", projeto_id="proj-x")
    factory, session = _fake_session_factory(corte, projeto_obj=None)

    monkeypatch.setattr(export_module, "AsyncSessionLocal", factory)

    chamadas: list[tuple[str, bool]] = []

    async def _fake_detectar(corte_id: str, limpar_anteriores: bool = False):
        chamadas.append((corte_id, limpar_anteriores))
        return {"status": "sucesso"}

    from app.services import corte as corte_module

    monkeypatch.setattr(
        corte_module.CorteService,
        "detectar_silencios_tecnico",
        staticmethod(_fake_detectar),
    )

    resultado = await ExportService.gerar_bruto_via_worker("corte-x")

    # Detecao foi chamada com limpar_anteriores=True (salvaguarda regerar).
    assert chamadas == [("corte-x", True)]

    # Refresh foi invocado para pegar os desvios recem-commitados.
    session.refresh.assert_awaited_once_with(corte)

    # Saida antecipada por projeto ausente — prova que a salvaguarda
    # rodou ANTES da resolucao do projeto (ordem correta).
    assert resultado == {"status": "erro", "mensagem": "Projeto não encontrado"}


@pytest.mark.asyncio
async def test_gerar_bruto_continua_quando_detectar_silencios_falha(monkeypatch):
    """Salvaguarda eh best-effort: falha de detecao nao bloqueia o bruto."""

    corte = MagicMock(id="corte-y", projeto_id="proj-y")
    factory, _session = _fake_session_factory(corte, projeto_obj=None)
    monkeypatch.setattr(export_module, "AsyncSessionLocal", factory)

    async def _detectar_explode(corte_id: str, limpar_anteriores: bool = False):
        raise RuntimeError("ffmpeg silencedetect indisponivel")

    from app.services import corte as corte_module

    monkeypatch.setattr(
        corte_module.CorteService,
        "detectar_silencios_tecnico",
        staticmethod(_detectar_explode),
    )

    resultado = await ExportService.gerar_bruto_via_worker("corte-y")

    # Continua o fluxo normal e termina com erro de projeto ausente — nao
    # propagou a excecao da deteccao.
    assert resultado == {"status": "erro", "mensagem": "Projeto não encontrado"}


@pytest.mark.asyncio
async def test_gerar_bruto_aplica_audio_offset_no_clip(monkeypatch, tmp_path):
    """D-147: o bruto regerado herda o offset de lip-sync do corte.

    Caminho feliz do worker: prova que ``_aplicar_audio_offset`` é chamado com
    ``corte.audio_offset_ms`` após a geração — sem isso, o ajuste de sincronia
    salvo no editor não chegava ao bruto (e, por herança, ao render final).
    """
    corte = MagicMock(
        id="corte-z",
        projeto_id="proj-z",
        inicio_seg=10.0,
        fim_seg=70.0,
        desvios="[]",
        audio_offset_ms=120,
        status="proposto",
    )
    projeto = MagicMock(id="proj-z", arquivo_video_path="video.mkv", duracao_segundos=1000.0)
    factory, _session = _fake_session_factory(corte, projeto_obj=projeto)
    monkeypatch.setattr(export_module, "AsyncSessionLocal", factory)

    # Projetos vão para um diretório temporário isolado.
    monkeypatch.setattr(export_module, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(export_module.settings, "claude_auto_cenas_no_bruto", False)

    # Vídeo de origem e salvaguardas/colaboradores pesados viram no-ops.
    monkeypatch.setattr(
        ExportService, "_resolver_video_path", staticmethod(lambda *a, **k: Path("video.mkv"))
    )
    monkeypatch.setattr(ExportService, "_probe_duracao", AsyncMock(return_value=60.0))

    from app.services import corte as corte_module

    monkeypatch.setattr(
        corte_module.CorteService,
        "detectar_silencios_tecnico",
        staticmethod(AsyncMock(return_value={"status": "sucesso"})),
    )
    monkeypatch.setattr(
        corte_module.CorteService,
        "sincronizar_transcricao_corte",
        staticmethod(AsyncMock()),
    )

    # build_bruto_pipeline cria o clip de saída e a resposta do worker, fechando
    # o caminho feliz sem FFmpeg nem fila real.
    def _fake_pipeline(*, video_path, out_path, work_dir, tmp_dir, segmentos):
        Path(out_path).write_bytes(b"x" * 2048)
        fila_dir = export_module.projetos_dir() / "fila_remotion"
        res_file = fila_dir / f"res_{corte.id}_bruto.json"
        res_file.write_text(json.dumps({"status": "sucesso"}), encoding="utf-8")
        return types.SimpleNamespace(files={}, cmd=["ffmpeg"], tmp_dir=str(tmp_dir))

    monkeypatch.setattr(export_module, "build_bruto_pipeline", _fake_pipeline)

    # Detecção de segmentos é fire-and-forget (asyncio.create_task) — neutraliza
    # para não rodar PySceneDetect/FFmpeg em background no teste.
    from app.services import deteccao_segmentos as deteccao_module

    monkeypatch.setattr(deteccao_module, "executar_deteccao_segmentos", AsyncMock())

    offset_calls: list[int] = []

    async def _spy_offset(clip_path, offset_ms):
        offset_calls.append(offset_ms)

    monkeypatch.setattr(ExportService, "_aplicar_audio_offset", staticmethod(_spy_offset))

    resultado = await ExportService.gerar_bruto_via_worker("corte-z")

    assert resultado["status"] == "pronto"
    # O offset do corte foi aplicado ao bruto recém-gerado.
    assert offset_calls == [120]
