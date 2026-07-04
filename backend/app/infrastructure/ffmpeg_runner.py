"""Runner async genérico para processos FFmpeg — execução, logging throttled e probe."""

import asyncio
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)


_SYNC_TIMEOUT_SECONDS = 3600  # 1h — proteção contra hang indefinido


def _run_ffmpeg_sync(cmd: list[str], label: str = "ffmpeg") -> tuple[int, str, str]:
    """Executa FFmpeg de forma síncrona (fallback para Windows)."""
    import subprocess

    cmd_preview = " ".join(cmd[:8]) + (" ..." if len(cmd) > 8 else "")
    logger.info("[FfmpegRunner] [%s] Iniciando (thread): %s", label, cmd_preview)
    t0 = time.time()
    try:
        result = subprocess.run(
            cmd,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            errors="replace",
            timeout=_SYNC_TIMEOUT_SECONDS,
        )
        elapsed = time.time() - t0
        if result.returncode == 0:
            logger.info("[FfmpegRunner] [%s] Concluido em %.1fs (rc=0)", label, elapsed)
        else:
            logger.error(
                "[FfmpegRunner] [%s] Falhou em %.1fs (rc=%d): %s",
                label,
                elapsed,
                result.returncode,
                result.stderr[-500:],
            )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired as e:
        elapsed = time.time() - t0
        logger.error("[FfmpegRunner] [%s] Timeout apos %.1fs — processo encerrado.", label, elapsed)
        if e.proc:
            e.proc.kill()
        return -1, "", f"Timeout apos {elapsed:.0f}s"
    except Exception as e:
        logger.error("[FfmpegRunner] [%s] Excecao: %s", label, e)
        return -1, "", f"Erro ao executar subprocesso sync: {e}"


_STDERR_TAIL_LEN = 500


@dataclass
class FfmpegResult:
    returncode: int
    stderr_tail: str
    stdout: str = ""
    stderr: str = ""


async def _run_ffmpeg_in_thread(
    cmd: list[str],
    *,
    label: str,
    capture_output: bool,
) -> FfmpegResult:
    returncode, stdout, stderr = await asyncio.to_thread(_run_ffmpeg_sync, cmd, label)
    return FfmpegResult(
        returncode=returncode,
        stderr_tail=stderr[-_STDERR_TAIL_LEN:],
        stdout=stdout if capture_output else "",
        stderr=stderr if capture_output else "",
    )


async def _drain_stream(
    stream: asyncio.StreamReader,
    label: str,
    log_interval: float = 30.0,
    capture: bool = False,
) -> str:
    """Lê stream de forma não-bloqueante, logando a cada `log_interval` segundos."""
    last_log_time = 0.0
    full_output = []
    tail = ""
    try:
        while True:
            chunk = await stream.read(1024)
            if not chunk:
                break
            txt = chunk.decode(errors="replace")
            if capture:
                full_output.append(txt)
            tail = txt[-500:]
            for line in txt.split("\r"):
                line = line.strip()
                if not line:
                    continue
                now = time.time()
                if now - last_log_time >= log_interval or "error" in line.lower():
                    logger.info("[%s] %s", label, line)
                    last_log_time = now
    except Exception as exc:
        logger.warning("[%s] Stream read error: %s", label, exc)

    return "".join(full_output) if capture else tail


async def run_ffmpeg(
    cmd: list[str],
    *,
    label: str = "ffmpeg",
    timeout: int = 14400,
    log_interval: float = 30.0,
    capture_output: bool = False,
) -> FfmpegResult:
    """Executa um comando FFmpeg de forma assíncrona com timeout e logging.

    Exemplo:
        >>> result = await run_ffmpeg(["ffmpeg", "-version"], label="version-check", timeout=10)
        >>> result.returncode
        0
    """
    if sys.platform == "win32":
        return await _run_ffmpeg_in_thread(cmd, label=label, capture_output=capture_output)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        logger.warning(
            "[FfmpegRunner] Aviso: create_subprocess_exec não suportado. Usando fallback via Thread."
        )
        # No fallback via thread, perdemos o streaming de logs em tempo real, mas o comando completa.
        return await _run_ffmpeg_in_thread(cmd, label=label, capture_output=capture_output)

    t_out = asyncio.create_task(
        _drain_stream(proc.stdout, f"{label}-out", log_interval, capture=capture_output)
    )
    t_err = asyncio.create_task(
        _drain_stream(proc.stderr, f"{label}-err", log_interval, capture=capture_output)
    )

    try:
        await asyncio.wait_for(proc.wait(), timeout=timeout)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise RuntimeError(f"{label} timed out (>{timeout}s)") from None
    finally:
        stderr_val = await t_err
        stdout_val = await t_out

    return FfmpegResult(
        returncode=proc.returncode,
        stderr_tail=stderr_val[-_STDERR_TAIL_LEN:],
        stdout=stdout_val if capture_output else "",
        stderr=stderr_val if capture_output else "",
    )


async def run_ffmpeg_simple(
    cmd: list[str],
    *,
    label: str = "ffmpeg",
    capture_output: bool = False,
) -> FfmpegResult:
    """Executa FFmpeg e levanta RuntimeError se falhar. Para operações rápidas."""
    if sys.platform == "win32":
        result = await _run_ffmpeg_in_thread(cmd, label=label, capture_output=capture_output)
        if result.returncode != 0:
            raise RuntimeError(f"{label} falhou (thread): {result.stderr_tail}")
        return result

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        logger.warning("[FfmpegRunner] Usando fallback via Thread em run_ffmpeg_simple.")
        result = await _run_ffmpeg_in_thread(cmd, label=label, capture_output=capture_output)
        if result.returncode != 0:
            raise RuntimeError(f"{label} falhou (thread): {result.stderr_tail}") from None
        return result

    stdout_data, stderr_data = await proc.communicate()
    stdout_txt = stdout_data.decode(errors="replace")
    stderr_txt = stderr_data.decode(errors="replace")

    if proc.returncode != 0:
        raise RuntimeError(f"{label} falhou: {stderr_txt[-_STDERR_TAIL_LEN:]}")

    return FfmpegResult(
        returncode=proc.returncode,
        stderr_tail=stderr_txt[-_STDERR_TAIL_LEN:],
        stdout=stdout_txt if capture_output else "",
        stderr=stderr_txt if capture_output else "",
    )


async def probe_codecs(path: Path) -> tuple[str, str]:
    """Retorna (codec_video, codec_audio) de um arquivo de mídia.

    Exemplo:
        >>> v, a = await probe_codecs(Path("video.mp4"))
        >>> v  # e.g. 'h264'
    """

    async def _probe_stream(select: str) -> str:
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                select,
                "-show_entries",
                "stream=codec_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except NotImplementedError:
            # Fallback para ffprobe
            _, out, _ = await asyncio.to_thread(
                _run_ffmpeg_sync,
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    select,
                    "-show_entries",
                    "stream=codec_name",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
            )
            return out.strip().lower() or "unknown"

        out, _ = await proc.communicate()
        return out.decode().strip().lower() or "unknown"

    v_codec, a_codec = await asyncio.gather(
        _probe_stream("v:0"),
        _probe_stream("a:0"),
    )
    return v_codec, a_codec
