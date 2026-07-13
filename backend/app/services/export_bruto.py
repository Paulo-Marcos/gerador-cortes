"""Mixin de helpers de FFmpeg do vídeo bruto do ExportService.

Extraído de `export` (E-006). Guarda os helpers puros usados por
`gerar_bruto_via_worker` (na fachada): offset de áudio (lip-sync), probe de
duração e resolução do caminho do vídeo original.
"""

import asyncio
from pathlib import Path

from app.channel_paths import projetos_dir
from app.domain.ffmpeg_commands import build_audio_offset_cmd
from app.infrastructure.ffmpeg_runner import run_ffmpeg_simple


class _ExportBrutoMixin:
    @staticmethod
    async def _probe_duracao(file_path: Path) -> float | None:
        """Retorna a duração em segundos via ffprobe, ou None se falhar.

        Exemplo:
            >>> dur = await ExportService._probe_duracao(Path("clip.mkv"))
            >>> dur > 0
            True
        """
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return float(stdout.decode().strip())
        except Exception:
            return None

    @staticmethod
    def _resolver_video_path(projeto, projeto_id: str):
        """Localiza o arquivo de vídeo original do projeto.

        Exemplo:
            >>> path = ExportService._resolver_video_path(projeto, "abc")
            >>> path.suffix
            '.mp4'
        """
        if projeto.arquivo_video_path and Path(projeto.arquivo_video_path).exists():
            return Path(projeto.arquivo_video_path)

        base_path = projetos_dir() / projeto_id / "video.mp4"
        if base_path.exists():
            return base_path

        for ext in ["mkv", "webm", "avi", "mov", "mp4"]:
            candidate = base_path.with_suffix(f".{ext}")
            if candidate.exists():
                return candidate

        return None

    @staticmethod
    async def _aplicar_audio_offset(clip_path: Path, offset_ms: int) -> None:
        """Aplica o offset de áudio (lip-sync, F-063) ao bruto recém-gerado.

        No-op quando offset_ms == 0 (caso padrão, sem regressão). Caso contrário,
        reescreve o clip no lugar, deslocando o áudio em relação ao vídeo. Como
        grade/overlay/render final herdam o áudio do bruto, a correção propaga.
        """
        if not offset_ms:
            return
        tmp_path = clip_path.with_name(f"{clip_path.stem}.offset.tmp{clip_path.suffix}")
        cmd = build_audio_offset_cmd(clip_path, tmp_path, offset_ms)
        await run_ffmpeg_simple(cmd, label="ffmpeg_audio_offset")
        tmp_path.replace(clip_path)
