"""Log textual do(s) comando(s) FFmpeg executados na renderização final.

Vive ao lado do `video.mp4` (em `upload_ready/render.ffmpeg.log`), formato
texto puro append-only — pensado para auditoria humana rápida ("qual filtro
o render usou?", "qual comando ffmpeg rodou na grade?") sem precisar abrir
o `pipeline_events.jsonl`.

I-023: este log nasceu da regressão "render final ignora Filtro Global Padrão".
A regra de negócio: TODO comando ffmpeg disparado pelo pipeline de render
final tem que aparecer aqui, com o filtro e a fase, em ordem cronológica.
"""

from __future__ import annotations

import shlex
from datetime import UTC, datetime
from pathlib import Path

from app.services.app_logging import operational_error


def append_ffmpeg_command(
    log_path: Path,
    *,
    phase: str,
    filtro: str | None,
    cmd: list[str],
    extra: dict[str, object] | None = None,
) -> None:
    """Acrescenta um bloco descrevendo um comando ffmpeg ao log textual.

    `log_path` é criado (e a pasta pai também) se não existir. Erros de I/O
    são engolidos com print — o log é auxiliar e nunca deve quebrar render.
    """
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(UTC).isoformat(timespec="seconds")
        lines = [
            f"[{timestamp}] phase={phase} filtro={filtro or '<global>'}",
        ]
        if extra:
            for key, value in extra.items():
                lines.append(f"  {key}={value}")
        lines.append(f"  cmd: {format_cmd(cmd)}")
        lines.append("")
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    except Exception as exc:  # noqa: BLE001
        operational_error("render_ffmpeg_log", f"falha ao gravar {log_path}: {exc}")


def format_cmd(cmd: list[str]) -> str:
    """Formata uma lista de argumentos como linha de shell copy-paste-friendly.

    Usa `shlex.quote` para garantir que paths com espaços e flags com `=`
    apareçam corretamente quotados. Função pura — testável sem I/O.
    """
    return " ".join(shlex.quote(str(part)) for part in cmd)
