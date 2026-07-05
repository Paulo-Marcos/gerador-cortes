"""Composição de overlays transparentes (Remotion) sobre o vídeo tratado e o
encode final para YouTube. Funções puras que retornam list[str].
"""

from pathlib import Path

from app.domain.ffmpeg_common import (
    _CANVAS_NORMALIZE,
    _ffmpeg_decode_thread_args,
    _ffmpeg_filter_thread_args,
    _resolve_filter_arg,
)


def build_overlay_filter_string(
    overlays: list[dict],
) -> str:
    """Gera filter_complex para compor N overlays sobre o vídeo base.

    Cada overlay dict deve ter: index (int), start_sec (float), end_sec (float).
    O index corresponde ao input FFmpeg (1-indexed, pois 0 é o vídeo base).
    """
    if not overlays:
        return ""

    # Overlays Remotion são sempre 1920x1080; a base precisa estar no mesmo
    # canvas (I-036) — para graded já 1080p o scale é passthrough.
    parts: list[str] = [f"[0:v]{_CANVAS_NORMALIZE},format=rgba[v_base]"]
    # Encadeia overlays: [v_base] -> [v1] -> [v2] -> ... -> [vout]
    prev_label = "[v_base]"
    for i, ov in enumerate(overlays):
        idx = ov["index"]
        # Alinha PTS do overlay com o tempo de início no vídeo base.
        # Sem isso, o overlay 'acaba' antes do tempo habilitado se for curto.
        shifted_label = f"[ov{idx}]"
        parts.append(
            f"[{idx}:v]format=rgba,setpts=PTS-STARTPTS+{ov['start_sec']:.3f}/TB{shifted_label}"
        )

        out_label = f"[v{i + 1}]"
        enable = f"between(t,{ov['start_sec']:.3f},{ov['end_sec']:.3f})"
        # eof_action=pass garante que se o overlay terminar, o fundo continua
        parts.append(
            f"{prev_label}{shifted_label}overlay=enable='{enable}':x=0:y=0:eof_action=pass:format=auto{out_label}"
        )
        prev_label = out_label

    parts.append(f"{prev_label}format=nv12[vout]")
    return "; ".join(parts)


def build_overlay_composition_cmd(
    video_path: Path,
    overlay_paths: list[Path],
    overlay_timings: list[dict],
    output_path: Path,
) -> list[str]:
    """Compõe N overlays transparentes sobre o vídeo tratado em uma passada.

    overlay_timings: lista de dicts com start_sec e end_sec para cada overlay.
    A ordem deve corresponder à ordem dos overlay_paths.

    Exemplo:
        >>> cmd = build_overlay_composition_cmd(
        ...     Path("graded.mp4"),
        ...     [Path("ov1.webm"), Path("ov2.webm")],
        ...     [{"start_sec": 10, "end_sec": 16}, {"start_sec": 60, "end_sec": 65}],
        ...     Path("composed.mp4"),
        ... )
        >>> "-filter_complex" in cmd
        True
    """
    if not overlay_paths:
        return [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-i",
            str(video_path),
            "-map",
            "0",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(output_path),
        ]

    cmd = ["ffmpeg", "-y", "-nostdin", *_ffmpeg_decode_thread_args(), "-i", str(video_path)]

    for ov_path in overlay_paths:
        cmd += _build_overlay_input_args(ov_path)

    # Constrói metadados de overlay indexados (1-based, pois 0 é o vídeo)
    indexed_overlays = [
        {"index": i + 1, "start_sec": t["start_sec"], "end_sec": t["end_sec"]}
        for i, t in enumerate(overlay_timings)
    ]

    filter_str = build_overlay_filter_string(indexed_overlays)
    filter_arg = _resolve_filter_arg(filter_str, output_path.parent)

    cmd += [
        *_ffmpeg_filter_thread_args(),
        *filter_arg,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        "-c:v",
        "h264_qsv",
        "-global_quality",
        "20",
        "-look_ahead",
        "1",
        "-g",
        "60",
        "-bf",
        "0",
        "-pix_fmt",
        "nv12",
        "-fps_mode",
        "cfr",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    return cmd


_LOUDNORM_YOUTUBE = "loudnorm=I=-14:TP=-1.0:LRA=11"


def build_compose_and_encode_cmd(
    video_path: Path,
    overlay_paths: list[Path],
    overlay_timings: list[dict],
    output_path: Path,
    *,
    bitrate: str = "8M",
    max_bitrate: str = "10M",
    buf_size: str = "16M",
    fps: int = 30,
    normalize_audio: bool = True,
) -> list[str]:
    """Composição de overlays + encode final em UMA única passada FFmpeg.

    Substitui o par `build_overlay_composition_cmd` → `build_final_encode_cmd`
    do pipeline antigo (que escrevia um `clip_composed.mp4` intermediário e
    o re-encodava). Tira um ciclo inteiro de compressão lossy — economia de
    ~30-50% de tempo e menos perda de qualidade.

    Fonte do vídeo: `video_path` (já com a grade aplicada).
    Fontes de overlay: cada `overlay_paths[i]` é uma camada transparente
    com timing controlado por `overlay_timings[i].start_sec/end_sec`.

    Áudio: copiado da fonte (não dos overlays) e re-encodado com loudnorm
    LUFS-14 quando `normalize_audio=True` — o programa inteiro fica visível
    para o filtro, então o ganho é calculado corretamente.

    Quando não há overlays, faz só o encode final (mesmo resultado do
    builder antigo, sem o overhead do filter_complex).

    Exemplo:
        >>> cmd = build_compose_and_encode_cmd(
        ...     Path("graded.mp4"),
        ...     [Path("ov1.mov")],
        ...     [{"start_sec": 10.0, "end_sec": 15.0}],
        ...     Path("final.mp4"),
        ... )
        >>> "h264_qsv" in cmd and "+faststart" in cmd
        True
    """
    cmd = ["ffmpeg", "-y", "-nostdin", *_ffmpeg_decode_thread_args(), "-i", str(video_path)]

    for ov_path in overlay_paths:
        cmd += _build_overlay_input_args(ov_path)

    encode_args = _build_youtube_encode_args(
        bitrate=bitrate, max_bitrate=max_bitrate, buf_size=buf_size, fps=fps
    )
    audio_args = _build_audio_args(normalize=normalize_audio)

    if not overlay_paths:
        cmd += [
            "-map",
            "0:v",
            "-map",
            "0:a?",
            *encode_args,
            *audio_args,
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        return cmd

    indexed_overlays = [
        {"index": i + 1, "start_sec": t["start_sec"], "end_sec": t["end_sec"]}
        for i, t in enumerate(overlay_timings)
    ]
    filter_str = build_overlay_filter_string(indexed_overlays)
    filter_arg = _resolve_filter_arg(filter_str, output_path.parent)

    cmd += [
        *_ffmpeg_filter_thread_args(),
        *filter_arg,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        *encode_args,
        *audio_args,
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    return cmd


def _build_overlay_input_args(overlay_path: Path) -> list[str]:
    """Input args for transparent overlays.

    Prefixa um teto de threads de decode: overlays ProRes 4444/VP9 com alpha
    decodificam para frames grandes e, sem limite, cada decoder usa ncpu
    threads — cada uma com seu buffer. Esse é um dos maiores contribuintes do
    pico de RAM no compose final (vários overlays decodificando em paralelo).
    """
    threads = _ffmpeg_decode_thread_args()
    if overlay_path.suffix.lower() == ".webm":
        return [*threads, "-c:v", "libvpx-vp9", "-i", str(overlay_path)]
    return [*threads, "-i", str(overlay_path)]


def _build_youtube_encode_args(
    *, bitrate: str, max_bitrate: str, buf_size: str, fps: int
) -> list[str]:
    """Flags de encode H.264/QSV otimizadas para YouTube. Reusado por compose+encode e final-only."""
    return [
        "-c:v",
        "h264_qsv",
        "-preset",
        "fast",
        "-b:v",
        bitrate,
        "-maxrate",
        max_bitrate,
        "-bufsize",
        buf_size,
        "-g",
        "60",
        "-bf",
        "0",
        # -async_depth 1: menos surfaces QSV em voo = menor pico de RAM/GPU,
        # somando ao teto de threads de decode/filtro no compose final (D-065).
        "-async_depth",
        "1",
        "-fps_mode",
        "cfr",
        "-r",
        str(fps),
        "-pix_fmt",
        "nv12",
    ]


def _build_audio_args(*, normalize: bool) -> list[str]:
    """AAC-LC 192k 48k + loudnorm opcional para YouTube/podcast."""
    args = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    if normalize:
        args += ["-af", _LOUDNORM_YOUTUBE]
    return args


def build_final_encode_cmd(
    input_path: Path,
    output_path: Path,
    *,
    bitrate: str = "8M",
    max_bitrate: str = "10M",
    buf_size: str = "16M",
    fps: int = 30,
    normalize_audio: bool = True,
) -> list[str]:
    """Compressão final única para YouTube — encode definitivo (sem overlays).

    DEPRECATED na orquestração: o pipeline atual usa
    `build_compose_and_encode_cmd` para evitar o intermediário
    `clip_composed.mp4`. Este builder continua disponível para fluxos
    que recebem um vídeo já composto e só precisam do encode final.

    Aplica -r 30 somente aqui (último estágio), evitando conversões
    de FPS nas fases intermediárias.

    Por padrão normaliza o áudio para -14 LUFS (target YouTube/podcast).

    Exemplo:
        >>> cmd = build_final_encode_cmd(Path("composed.mp4"), Path("final.mp4"))
        >>> "-r" in cmd and "30" in cmd
        True
    """
    encode_args = _build_youtube_encode_args(
        bitrate=bitrate, max_bitrate=max_bitrate, buf_size=buf_size, fps=fps
    )
    audio_args = _build_audio_args(normalize=normalize_audio)

    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-i",
        str(input_path),
        "-map",
        "0",
        *encode_args,
        *audio_args,
        "-movflags",
        "+faststart",
        str(output_path),
    ]
