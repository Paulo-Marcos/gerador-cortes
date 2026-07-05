"""Helpers de baixo nível compartilhados pelos builders de comandos FFmpeg.

Tetos de threads (memória), normalização de canvas, materialização de
filter_complex em arquivo e o kill-switch da grade segmentada. Reusado por
`ffmpeg_basic`, `ffmpeg_grade`, `ffmpeg_overlay` e pela fachada `ffmpeg_commands`.
"""

import os
import tempfile
from pathlib import Path

# I-036: crops/slots do layout YouTube são definidos pelo frontend num canvas
# 1920x1080 com o vídeo ESTICADO para preenchê-lo (CenasRemotionPreview usa
# width=1920*scale/height=1080*scale). Fontes fora de 1080p (ex.: live 720p)
# precisam da mesma normalização antes de qualquer crop/overlay, senão o
# FFmpeg recorta regiões erradas e compõe camadas 1080p sobre base menor.
_CANVAS_NORMALIZE = "scale=1920:1080,setsar=1"

_FILTER_SCRIPT_SIZE_THRESHOLD = 4000


def _int_env(name: str, default: int, *, minimo: int = 0) -> int:
    """Lê um inteiro de variável de ambiente, com piso e fallback.

    Usado para os tetos de threads do ffmpeg — o controle de memória mora aqui
    (env var) porque o `app_settings.py` está travado e este módulo é o ponto
    natural de construção dos comandos.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return max(minimo, int(raw))
    except (TypeError, ValueError):
        return default


# Tetos de threads do ffmpeg. CUIDADO: o composite do palco/overlays roda na
# CPU (o encode é que vai pra iGPU/QSV), então capar threads ESTRANGULA o
# composite — a parte cara da grade. O cap agressivo (2) existia como band-aid
# do bug de RAM da trim-segmentation com `split` fan-out; a arquitetura nova
# (subprocesso, RAM limitada por janela) não precisa mais dele. O que ainda
# preocupa em RAM é o DECODE de VÁRIOS overlays ProRes 4444 no compose (cada
# decoder aloca frames grandes) — por isso o decode segue capado, o filtro não.
# Override por env (FFMPEG_DECODE_THREADS / FFMPEG_FILTER_THREADS).
def _ffmpeg_decode_thread_args(default: int = 4) -> list[str]:
    """Teto de threads de decode (por input). Aplicado a cada overlay no
    compose — vários decoders ProRes 4444 com alpha alocam frames grandes, então
    aqui o cap PROTEGE a RAM. `0` = auto (todos os núcleos)."""
    return ["-threads", str(_int_env("FFMPEG_DECODE_THREADS", default))]


def _ffmpeg_filter_thread_args(default: int = 6) -> list[str]:
    """Threads do filtergraph (o composite, que roda na CPU). `0` = sem teto
    (todos os núcleos) — usado na grade, onde o composite é o gargalo e a RAM é
    limitada (1 região por segmento). Default 6 no compose, mais conservador."""
    n = _int_env("FFMPEG_FILTER_THREADS", default)
    return ["-filter_complex_threads", str(n)] if n > 0 else []


def _grade_trim_segmentation_enabled() -> bool:
    """Liga a grade SEGMENTADA por subprocesso (cada região composita só a sua
    janela → ~52% mais rápida em cortes multi-região).

    A 1ª versão segmentava DENTRO do filtergraph (`split`+`concat`): o `concat`
    consome os segmentos em série, então o `split` bufferizava os frames RGBA
    (~8,3 MB) de todos os segmentos não consumidos → a RAM crescia com a duração
    do vídeo e estourava (`Cannot allocate memory`, D-065). Por isso virou OFF.

    Agora a segmentação é feita por SUBPROCESSO (`build_grade_plan`): cada
    segmento é um ffmpeg separado com input-seek (`-ss`/`-t`) — processa só a
    sua janela, sem `split` fan-out → RAM limitada à janela. Os segmentos `.ts`
    são unidos pelo concat demuxer (`-c copy`, sem re-decode). Memory-safe, então
    o default é ON. Kill-switch: `GRADE_TRIM_SEGMENTATION=0`.
    """
    return os.environ.get("GRADE_TRIM_SEGMENTATION", "1").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


def _resolve_filter_arg(filter_str: str, output_dir: Path) -> list[str]:
    """Retorna [-filter_complex, str] ou [-filter_complex_script, path].

    Escreve arquivo temporário quando o filtro excede o limite seguro de CLI.
    Side-effect intencional: cria arquivo temporário quando necessário.
    """
    if len(filter_str) <= _FILTER_SCRIPT_SIZE_THRESHOLD:
        return ["-filter_complex", filter_str]

    fd, path = tempfile.mkstemp(suffix=".filter_script.txt", dir=str(output_dir))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(filter_str)
    except Exception:
        fallback = Path(tempfile.gettempdir()) / f"filter_script_{os.getpid()}.txt"
        fallback.write_text(filter_str, encoding="utf-8")
        path = str(fallback)
    return ["-filter_complex_script", str(path)]
