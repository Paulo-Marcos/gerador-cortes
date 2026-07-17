"""D-384: falha de geração do PNG do palco deve ser VISÍVEL, não silenciosa.

Cobre as duas camadas:
- service `youtube_palco.ensure_palco_pngs_para_layout` retorna diagnóstico
  (`PalcoPngsResultado` com falhas + chaves exigidas por região);
- pipeline `_reportar_falhas_palco` emite `palco_png_falhou` no event log,
  avisa o canal de progresso e BLOQUEIA o render (salvo opt-in explícito).
"""

from pathlib import Path

import app.services.pipeline_render as pr
import app.services.youtube_palco as yp
import pytest
from app.services.youtube_palco import (
    PalcoPngFalha,
    PalcoPngGeracaoError,
    PalcoPngsResultado,
)

LAYOUT_COMPARTILHADA = {"modo_padrao": "compartilhada"}


class _FakeEventLog:
    def __init__(self):
        self.eventos: list[tuple[str, dict]] = []

    def emit(self, event, **kwargs):
        self.eventos.append((event, kwargs))


# ---------------------------------------------------------------------------
# Service: ensure_palco_pngs_para_layout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ensure_palco_pngs_caminho_feliz_mapeia_chaves_de_regiao(tmp_path, monkeypatch):
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path)

    async def _gera_ok(props, *, destino=None, forcar=False):
        destino.write_bytes(b"png")
        return destino

    monkeypatch.setattr(yp, "_ensure_png_para_props", _gera_ok)

    resultado = await yp.ensure_palco_pngs_para_layout(LAYOUT_COMPARTILHADA, duracao_seg=60)

    assert resultado.falhas == []
    assert resultado.regioes_sem_png == set()
    # Layout todo compartilhado: a região usa o config base -> chave exigida
    # tem que estar entre as geradas.
    assert resultado.chaves_regioes
    assert resultado.chaves_regioes <= set(resultado.gerados)
    assert all(p.exists() for p in resultado.gerados.values())


@pytest.mark.asyncio
async def test_ensure_palco_pngs_falha_vira_diagnostico_com_saida(tmp_path, monkeypatch):
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path)

    async def _gera_falha(props, *, destino=None, forcar=False):
        return PalcoPngFalha(chave=destino.stem, returncode=1, saida="Error: bundle exploded")

    monkeypatch.setattr(yp, "_ensure_png_para_props", _gera_falha)

    resultado = await yp.ensure_palco_pngs_para_layout(LAYOUT_COMPARTILHADA, duracao_seg=60)

    assert resultado.gerados == {}
    assert resultado.falhas and resultado.falhas[0].returncode == 1
    assert resultado.regioes_sem_png == resultado.chaves_regioes != set()
    assert "bundle exploded" in resultado.diagnostico()


@pytest.mark.asyncio
async def test_ensure_palco_pngs_excecao_do_gerador_nao_derruba_e_vira_falha(tmp_path, monkeypatch):
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path)

    async def _gera_explode(props, *, destino=None, forcar=False):
        raise FileNotFoundError("node nao encontrado")

    monkeypatch.setattr(yp, "_ensure_png_para_props", _gera_explode)

    resultado = await yp.ensure_palco_pngs_para_layout(LAYOUT_COMPARTILHADA, duracao_seg=60)

    assert resultado.regioes_sem_png != set()
    assert "FileNotFoundError" in resultado.diagnostico()


@pytest.mark.asyncio
async def test_ensure_png_para_props_rc_diferente_de_zero_retorna_falha_com_tail(
    tmp_path, monkeypatch
):
    monkeypatch.setattr(yp, "_cache_dir", lambda: tmp_path)

    class _FakeProc:
        returncode = 7

        async def communicate(self):
            return (b"stack trace do remotion still\n", None)

    async def _fake_exec(*args, **kwargs):
        return _FakeProc()

    monkeypatch.setattr(yp.asyncio, "create_subprocess_exec", _fake_exec)

    destino = tmp_path / "chave-x.png"
    resultado = await yp._ensure_png_para_props(
        {
            "fundo": "f",
            "placa": {},
            "telas": 2,
            "crop_tela": {},
            "crop_facecam": {},
            "slot_tela": {},
            "slot_facecam": {},
        },
        destino=destino,
    )

    assert isinstance(resultado, PalcoPngFalha)
    assert resultado.returncode == 7
    assert "stack trace do remotion still" in resultado.saida
    assert resultado.chave == "chave-x"


# ---------------------------------------------------------------------------
# Pipeline: _reportar_falhas_palco / _executar_grade
# ---------------------------------------------------------------------------


def _resultado_com_regiao_faltando() -> PalcoPngsResultado:
    return PalcoPngsResultado(
        gerados={},
        falhas=[PalcoPngFalha(chave="abc123", returncode=1, saida="Error: X")],
        chaves_regioes={"abc123"},
    )


def test_reportar_falhas_palco_bloqueia_emite_evento_e_avisa_progresso(monkeypatch):
    monkeypatch.delenv("PALCO_FALLBACK_EXPLICITO", raising=False)
    event_log = _FakeEventLog()
    reports: list[tuple[int, str]] = []

    with pytest.raises(PalcoPngGeracaoError) as exc_info:
        pr._reportar_falhas_palco(
            _resultado_com_regiao_faltando(),
            event_log=event_log,
            report=lambda p, s: reports.append((p, s)),
        )

    assert "Error: X" in str(exc_info.value)  # saída do gerador no diagnóstico
    eventos = dict(event_log.eventos)
    assert "palco_png_falhou" in eventos
    assert eventos["palco_png_falhou"]["bloqueante"] is True
    assert eventos["palco_png_falhou"]["chaves_faltantes"] == ["abc123"]
    assert "Error: X" in eventos["palco_png_falhou"]["saida_gerador"]
    assert reports and "bloqueado" in reports[0][1]


def test_reportar_falhas_palco_fallback_explicito_nao_bloqueia_mas_registra(monkeypatch):
    monkeypatch.setenv("PALCO_FALLBACK_EXPLICITO", "1")
    event_log = _FakeEventLog()
    reports: list[tuple[int, str]] = []

    pr._reportar_falhas_palco(
        _resultado_com_regiao_faltando(),
        event_log=event_log,
        report=lambda p, s: reports.append((p, s)),
    )  # não levanta

    eventos = dict(event_log.eventos)
    assert eventos["palco_png_falhou"]["bloqueante"] is False
    assert reports and "fallback" in reports[0][1]


def test_reportar_falhas_palco_sucesso_nao_emite_nada():
    event_log = _FakeEventLog()

    pr._reportar_falhas_palco(
        PalcoPngsResultado(gerados={"k": Path("k.png")}, chaves_regioes={"k"}),
        event_log=event_log,
        report=None,
    )

    assert event_log.eventos == []


def test_reportar_falhas_palco_falha_so_da_base_registra_sem_bloquear():
    """Base sem região que a exija: rastro auditável, render segue."""
    event_log = _FakeEventLog()

    pr._reportar_falhas_palco(
        PalcoPngsResultado(
            gerados={},
            falhas=[PalcoPngFalha(chave="base", returncode=1, saida="x")],
            chaves_regioes=set(),
        ),
        event_log=event_log,
        report=None,
    )

    eventos = dict(event_log.eventos)
    assert eventos["palco_png_falhou"]["bloqueante"] is False


@pytest.mark.asyncio
async def test_executar_grade_bloqueia_antes_do_ffmpeg_quando_palco_falha(tmp_path, monkeypatch):
    monkeypatch.delenv("PALCO_FALLBACK_EXPLICITO", raising=False)
    monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path)

    async def _palco_falha(*a, **k):
        return _resultado_com_regiao_faltando()

    monkeypatch.setattr(pr, "ensure_palco_pngs_para_layout", _palco_falha)

    jobs: list[str] = []

    async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **kwargs):
        jobs.append(job_id)

    monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)
    event_log = _FakeEventLog()

    with pytest.raises(PalcoPngGeracaoError):
        await pr._executar_grade(
            tmp_path / "in.mkv",
            tmp_path / "out.mp4",
            "cinematic_iii",
            event_log=event_log,
        )

    assert jobs == []  # FFmpeg nunca rodou — falhou alto ANTES do placeholder
    assert dict(event_log.eventos)["palco_png_falhou"]["bloqueante"] is True
