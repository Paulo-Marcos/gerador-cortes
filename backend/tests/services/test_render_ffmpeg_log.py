"""Tests for I-023: render.ffmpeg.log audit file."""

from __future__ import annotations

from pathlib import Path

from app.services.render_ffmpeg_log import append_ffmpeg_command, format_cmd


def test_format_cmd_quotes_paths_with_spaces():
    cmd = ["ffmpeg", "-i", "/tmp/with space/in.mp4", "-vf", "curves=preset=ll"]

    result = format_cmd(cmd)

    assert "'/tmp/with space/in.mp4'" in result
    assert result.startswith("ffmpeg")


def test_format_cmd_accepts_non_string_arguments():
    cmd = ["ffmpeg", "-global_quality", 30]

    assert format_cmd(cmd) == "ffmpeg -global_quality 30"


def test_append_ffmpeg_command_creates_log_and_records_filtro(tmp_path: Path):
    log_path = tmp_path / "upload_ready" / "render.ffmpeg.log"

    append_ffmpeg_command(
        log_path,
        phase="grade",
        filtro="cinematic_iii_leve",
        cmd=["ffmpeg", "-i", "in.mkv", "out.mp4"],
        extra={"global_quality": 30},
    )

    assert log_path.exists(), "log file must be created on first call"
    content = log_path.read_text(encoding="utf-8")
    assert "phase=grade" in content
    assert "filtro=cinematic_iii_leve" in content
    assert "global_quality=30" in content
    assert "ffmpeg -i in.mkv out.mp4" in content


def test_append_ffmpeg_command_is_append_only(tmp_path: Path):
    log_path = tmp_path / "render.ffmpeg.log"

    append_ffmpeg_command(
        log_path,
        phase="grade",
        filtro="cinematic_iii_leve",
        cmd=["ffmpeg", "-i", "a.mkv", "graded.mp4"],
    )
    append_ffmpeg_command(
        log_path,
        phase="render_final",
        filtro="cinematic_iii_leve",
        cmd=["ffmpeg", "-i", "graded.mp4", "video.mp4"],
    )

    content = log_path.read_text(encoding="utf-8")
    # ambas as fases preservadas em ordem
    assert content.index("phase=grade") < content.index("phase=render_final")
    # NÃO substituiu — as duas chamadas estão no arquivo
    assert content.count("phase=") == 2


def test_append_ffmpeg_command_records_global_marker_when_filtro_none(tmp_path: Path):
    log_path = tmp_path / "render.ffmpeg.log"

    append_ffmpeg_command(
        log_path,
        phase="grade",
        filtro=None,
        cmd=["ffmpeg", "-i", "a.mkv", "out.mp4"],
    )

    assert "filtro=<global>" in log_path.read_text(encoding="utf-8")


def test_append_ffmpeg_command_swallows_io_errors(tmp_path: Path, capsys):
    # Caminho impossível: tentar gravar dentro de um arquivo regular existente.
    file_blocking_dir = tmp_path / "blocker"
    file_blocking_dir.write_text("not a dir")
    log_path = file_blocking_dir / "render.ffmpeg.log"

    # Não pode levantar — log é auxiliar, render real não pode quebrar.
    append_ffmpeg_command(
        log_path,
        phase="grade",
        filtro="cinematic_iii_leve",
        cmd=["ffmpeg", "-i", "x", "y"],
    )

    captured = capsys.readouterr()
    assert "render_ffmpeg_log" in captured.out


def test_log_proves_which_filtro_ffmpeg_actually_used(tmp_path: Path):
    """Regressão I-023: o log tem que provar qual filtro foi efetivamente
    aplicado, mesmo quando o pipeline resolve o filtro a partir do global."""
    log_path = tmp_path / "render.ffmpeg.log"

    # Simula o pipeline rodando com Cinematico III LEVE (resolvido do global).
    append_ffmpeg_command(
        log_path,
        phase="grade",
        filtro="cinematic_iii_leve",
        cmd=["ffmpeg", "-vf", "curves=preset=lighter_contrast,eq=saturation=1.05", "out.mp4"],
        extra={"filtro_vf": "curves=preset=lighter_contrast,eq=saturation=1.05"},
    )

    content = log_path.read_text(encoding="utf-8")
    assert "cinematic_iii_leve" in content
    # E o comando ffmpeg de verdade está lá para conferir o filtro_vf aplicado.
    assert "curves=preset=lighter_contrast" in content
