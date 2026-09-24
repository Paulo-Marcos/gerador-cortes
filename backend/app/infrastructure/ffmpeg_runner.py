"""Runner async genérico para processos FFmpeg — execução, logging throttled e probe."""

import asyncio
import logging
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from app.infrastructure import processos_em_voo
from app.infrastructure.worker_queue import dono_dos_jobs

logger = logging.getLogger(__name__)


# D-647: teto quando o chamador não pede nada. Era o valor CRAVADO para toda
# chamada em Windows — o `timeout` pedido se perdia no caminho em thread, então
# 1h é o que a produção sempre praticou. Mantido como default até que cada
# chamada tenha seu valor medido.
_SYNC_TIMEOUT_SECONDS = 3600
# D-750: medido em 90 sondas sobre 15 arquivos reais da PROD, de 21 MB a 1,1 GB,
# com o disco frio e quente — pior caso 0,19 s. 30 s só existe para um ffprobe
# pendurado (arquivo ainda sendo escrito, corrompido) não prender quem o chamou.
_TIMEOUT_DA_SONDA_SEG = 30


def _run_ffmpeg_sync(
    cmd: list[str], label: str = "ffmpeg", timeout: float = _SYNC_TIMEOUT_SECONDS
) -> tuple[int, str, str]:
    """Executa FFmpeg de forma síncrona (caminho usado no Windows).

    D-647: `Popen` em vez de `subprocess.run` para ter o processo NA MÃO. Com
    ele registrado por dono, cancelar de fato mata o ffmpeg; antes a thread
    ficava presa esperando um processo que ninguém conseguia alcançar.
    """
    cmd_preview = " ".join(cmd[:8]) + (" ..." if len(cmd) > 8 else "")
    logger.info("[FfmpegRunner] [%s] Iniciando (thread): %s", label, cmd_preview)
    t0 = time.time()
    dono = dono_dos_jobs()
    try:
        processo = subprocess.Popen(  # noqa: S603 — comando montado por nós
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            errors="replace",
        )
    except Exception as e:
        logger.error("[FfmpegRunner] [%s] Excecao ao iniciar: %s", label, e)
        return -1, "", f"Erro ao executar subprocesso sync: {e}"

    processos_em_voo.registrar(dono, processo)
    try:
        stdout, stderr = processo.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        elapsed = time.time() - t0
        logger.error("[FfmpegRunner] [%s] Timeout apos %.1fs — processo encerrado.", label, elapsed)
        processos_em_voo.matar_arvore(processo)
        processo.communicate()
        return -1, "", f"Timeout apos {elapsed:.0f}s"
    except Exception as e:
        logger.error("[FfmpegRunner] [%s] Excecao: %s", label, e)
        processos_em_voo.matar_arvore(processo)
        return -1, "", f"Erro ao executar subprocesso sync: {e}"
    finally:
        processos_em_voo.esquecer(dono, processo)

    elapsed = time.time() - t0
    returncode = processo.returncode
    if returncode == 0:
        logger.info("[FfmpegRunner] [%s] Concluido em %.1fs (rc=0)", label, elapsed)
    else:
        # Cancelado conta como falha para quem chamou — o texto diz o motivo.
        logger.error(
            "[FfmpegRunner] [%s] Falhou em %.1fs (rc=%d): %s",
            label,
            elapsed,
            returncode,
            (stderr or "")[-500:],
        )
    return returncode, stdout or "", stderr or ""


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
    timeout: float = _SYNC_TIMEOUT_SECONDS,
) -> FfmpegResult:
    returncode, stdout, stderr = await asyncio.to_thread(_run_ffmpeg_sync, cmd, label, timeout)
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
    timeout: int = _SYNC_TIMEOUT_SECONDS,
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
        return await _run_ffmpeg_in_thread(
            cmd, label=label, capture_output=capture_output, timeout=timeout
        )

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
    timeout: float = _SYNC_TIMEOUT_SECONDS,
) -> FfmpegResult:
    """Executa FFmpeg e levanta RuntimeError se falhar. Para operações rápidas."""
    if sys.platform == "win32":
        result = await _run_ffmpeg_in_thread(
            cmd, label=label, capture_output=capture_output, timeout=timeout
        )
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
        result = await _run_ffmpeg_in_thread(
            cmd, label=label, capture_output=capture_output, timeout=timeout
        )
        if result.returncode != 0:
            raise RuntimeError(f"{label} falhou (thread): {result.stderr_tail}") from None
        return result

    try:
        stdout_data, stderr_data = await asyncio.wait_for(proc.communicate(), timeout)
    except TimeoutError:
        # D-750: fora do Windows este caminho ignorava o `timeout` que o
        # caminho em thread sempre respeitou. Mesma falha, mesmo formato.
        proc.kill()
        await proc.wait()
        raise RuntimeError(f"{label} falhou: timeout apos {timeout:.0f}s") from None
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


async def _esperar_sonda(proc: asyncio.subprocess.Process) -> bytes:
    """O stdout de um ffprobe, com prazo (D-750).

    Estourou: mata o processo pelo PID e levanta `TimeoutError`, que cai no
    tratamento de erro que cada sonda já tem. O ffprobe não sobe filhos.
    """
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), _TIMEOUT_DA_SONDA_SEG)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        raise
    return out


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
                "ffprobe-codecs",
                _TIMEOUT_DA_SONDA_SEG,
            )
            return out.strip().lower() or "unknown"

        out = await _esperar_sonda(proc)
        return out.decode().strip().lower() or "unknown"

    v_codec, a_codec = await asyncio.gather(
        _probe_stream("v:0"),
        _probe_stream("a:0"),
    )
    return v_codec, a_codec


def _parse_resolucao(raw: str) -> tuple[int, int] | None:
    """`"1280x720"` -> `(1280, 720)`. Qualquer outra coisa -> `None`."""
    largura, _, altura = (raw or "").strip().partition("x")
    try:
        valores = (int(largura), int(altura))
    except ValueError:
        return None
    return valores if valores[0] > 0 and valores[1] > 0 else None


async def probe_resolucao(path: Path) -> tuple[int, int] | None:
    """Largura e altura do vídeo, ou `None` quando não dá para medir.

    Quem recorta PRECISA disto: um crop calculado sobre uma resolução presumida
    estoura o quadro e o ffmpeg aborta com -22 no meio do render (D-481). Medir
    é barato; presumir custou um render inteiro.

    Mesmo fallback do `probe_duracao`: `create_subprocess_exec` levanta
    `NotImplementedError` sob o event loop Selector do uvicorn no Windows, e sem
    o caminho síncrono em thread o probe falharia calado (D-369).
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "csv=s=x:p=0",
        str(path),
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        _, out, _ = await asyncio.to_thread(
            _run_ffmpeg_sync, cmd, "ffprobe-resolucao", _TIMEOUT_DA_SONDA_SEG
        )
        return _parse_resolucao(out)
    except Exception:
        return None

    try:
        out = await _esperar_sonda(proc)
    except Exception:
        return None
    return _parse_resolucao(out.decode())


def _parse_duracao(raw: str) -> float | None:
    try:
        return float(raw.strip())
    except (ValueError, AttributeError):
        return None


async def probe_duracao(path: Path) -> float | None:
    """Duração (segundos) de um arquivo de mídia via ffprobe, ou None se falhar.

    Robusto ao event loop do backend no Windows: `create_subprocess_exec` levanta
    `NotImplementedError` quando o loop é o Selector (uvicorn) — nesse caso cai no
    ffprobe SÍNCRONO em thread (mesmo padrão de `probe_codecs`). Sem o fallback, o
    probe async falhava silenciosamente e retornava None (D-369).
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except NotImplementedError:
        _, out, _ = await asyncio.to_thread(
            _run_ffmpeg_sync, cmd, "ffprobe-duracao", _TIMEOUT_DA_SONDA_SEG
        )
        return _parse_duracao(out)
    except Exception:
        return None

    try:
        out = await _esperar_sonda(proc)
    except Exception:
        return None
    return _parse_duracao(out.decode())
