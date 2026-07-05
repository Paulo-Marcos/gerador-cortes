"""Builders de comandos FFmpeg básicos — cortes, concat, remoção de desvios,
detecção de silêncio, normalização e remux. Funções puras (retornam list[str]).
"""

from pathlib import Path

from app.domain.ffmpeg_common import _resolve_filter_arg


def build_lossless_cut_cmd(
    video: Path, output: Path, inicio_seg: float, fim_seg: float
) -> list[str]:
    """Comando FFmpeg para corte lossless (stream copy).

    Exemplo:
        >>> cmd = build_lossless_cut_cmd(Path("v.mp4"), Path("o.mkv"), 10.0, 60.0)
        >>> cmd[0]
        'ffmpeg'
    """
    duracao = fim_seg - inicio_seg
    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-ss",
        str(round(inicio_seg, 3)),
        "-i",
        str(video),
        "-t",
        str(round(duracao, 3)),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "20",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-af",
        "aresample=async=1:first_pts=0",
        "-avoid_negative_ts",
        "make_zero",
        "-fflags",
        "+genpts",
        "-movflags",
        "+faststart",
        str(output),
    ]


def build_audio_offset_cmd(input_clip: Path, output: Path, offset_ms: int) -> list[str]:
    """Reescreve um clip deslocando o áudio em relação ao vídeo (lip-sync, F-063).

    O vídeo é stream-copiado (rápido, sem perda) e o áudio é remapeado de uma
    cópia time-shifted do mesmo arquivo via ``-itsoffset``. Offset positivo
    atrasa o áudio; negativo adianta. Aplicado sobre o bruto já gerado, portanto
    a correção propaga para grade/overlay/render final, que herdam esse áudio.

    Não usa ``-shortest`` de propósito: ele truncaria o vídeo quando o áudio
    fica mais curto (offset negativo). A diferença de duração é sub-segundo
    para offsets de lip-sync e o stream de vídeo permanece a referência.

    Exemplo:
        >>> cmd = build_audio_offset_cmd(Path("clip.mkv"), Path("out.mkv"), 120)
        >>> cmd[0]
        'ffmpeg'
    """
    offset_s = round(offset_ms / 1000.0, 3)
    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-i",
        str(input_clip),
        "-itsoffset",
        str(offset_s),
        "-i",
        str(input_clip),
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-af",
        "aresample=async=1:first_pts=0",
        "-avoid_negative_ts",
        "make_zero",
        "-fflags",
        "+genpts",
        str(output),
    ]


def build_concat_cmd(concat_file: Path, output: Path) -> list[str]:
    """Comando FFmpeg para concatenação lossless via concat demuxer."""
    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(concat_file),
        "-c",
        "copy",
        str(output),
    ]


def build_filter_string(segmentos: list[tuple[float, float]]) -> str:
    """Constrói o filter_complex string para N segmentos — função pura."""
    filter_parts: list[str] = []
    concat_inputs = ""
    for i, (seg_i, seg_f) in enumerate(segmentos):
        filter_parts.append(f"[0:v]trim=start={seg_i}:end={seg_f},setpts=PTS-STARTPTS[v{i}]")
        # aresample antes de resetar PTS estabiliza timestamps no concat
        filter_parts.append(
            f"[0:a]atrim=start={seg_i}:end={seg_f},aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[a{i}]"
        )
        concat_inputs += f"[v{i}][a{i}]"
    filter_parts.append(f"{concat_inputs}concat=n={len(segmentos)}:v=1:a=1[outv][outa]")
    return "; ".join(filter_parts)


def build_filter_complex_cmd(
    video: Path,
    output: Path,
    segmentos: list[tuple[float, float]],
) -> list[str]:
    """Comando FFmpeg com filter_complex para re-render removendo desvios.

    Para 1 segmento usa trim simples via -ss/-to (fast seek antes do -i).
    Para N segmentos usa filter_complex com trim + concat.
    Quando o filtro ultrapassa _FILTER_SCRIPT_SIZE_THRESHOLD bytes, grava-o em
    arquivo temporário e usa -filter_complex_script para contornar o limite de
    linha de comando do Windows (~32KB).
    """
    if len(segmentos) == 1:
        duracao = segmentos[0][1] - segmentos[0][0]
        return [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-ss",
            str(round(segmentos[0][0], 3)),
            "-i",
            str(video),
            "-t",
            str(round(duracao, 3)),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-af",
            "aresample=async=1:first_pts=0",
            "-max_muxing_queue_size",
            "1024",
            "-avoid_negative_ts",
            "make_zero",
            "-fflags",
            "+genpts",
            "-movflags",
            "+faststart",
            str(output),
        ]

    # Multi-segmento: `-ss EARLY -copyts -i video` faz fast seek MAS preserva
    # os PTSes originais dos frames. Os filters `trim` então usam tempos
    # ABSOLUTOS (start=779:end=838, não 0-based), o que casa exatamente com
    # os PTSes do stream pós-seek.
    #
    # Sem `-copyts`, versões modernas do FFmpeg podiam tanto resetar quanto
    # preservar PTSes pós-seek dependendo do container — combinar isso com
    # tempos 0-based resultava em arquivos com duração absurdamente errada
    # (vi 3450s onde deveriam ser 414s). O par `-copyts` + trim absoluto é
    # determinístico e rápido (não decodifica desde o início do vídeo).
    #
    # `setpts=PTS-STARTPTS` (aplicado dentro de `build_filter_string` após
    # cada trim) reseta cada segmento para começar em 0 antes do concat.
    seek_pre = max(0.0, segmentos[0][0] - 0.5)  # margem p/ keyframe anterior
    filter_str = build_filter_string(segmentos)
    filter_arg = _resolve_filter_arg(filter_str, output.parent)

    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-ss",
        str(round(seek_pre, 3)),
        "-copyts",
        "-i",
        str(video),
        *filter_arg,
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-max_muxing_queue_size",
        "1024",
        "-avoid_negative_ts",
        "make_zero",
        "-fflags",
        "+genpts",
        str(output),
    ]


def build_silence_detect_cmd(
    input_path: str,
    *,
    start_offset: float | None = None,
    duration: float | None = None,
    noise_db: str = "-35dB",
    min_duration: str = "0.4",
) -> list[str]:
    """Comando FFmpeg para detecção de silêncios via silencedetect."""
    cmd = ["ffmpeg", "-y"]
    if start_offset is not None and duration is not None:
        cmd += ["-ss", str(start_offset), "-t", str(duration)]
    cmd += [
        "-i",
        input_path,
        "-af",
        f"silencedetect=noise={noise_db}:d={min_duration}",
        "-f",
        "null",
        "-",
    ]
    return cmd


def build_normalize_cmd(
    input_path: Path,
    output_path: Path,
    *,
    filtro_vf: str | None = None,
    preset: str = "veryfast",
    crf: str = "22",
) -> list[str]:
    """Comando FFmpeg para normalização de áudio + filtro visual opcional."""
    af = "loudnorm=I=-14:TP=-1.0:LRA=11"
    cmd = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-i",
        str(input_path),
        "-threads",
        "0",
    ]
    if filtro_vf:
        cmd += ["-vf", filtro_vf]
    cmd += [
        "-af",
        af,
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-tune",
        "film",
        "-crf",
        crf,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-max_muxing_queue_size",
        "1024",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    return cmd


def build_remux_cmd(
    input_path: Path,
    output_path: Path,
    *,
    copy_video: bool = True,
    copy_audio: bool = True,
) -> list[str]:
    """Comando FFmpeg para remux rápido (sem re-encode quando possível)."""
    cmd = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-probesize",
        "50M",
        "-analyzeduration",
        "50M",
        "-i",
        str(input_path),
    ]
    if copy_video:
        cmd += ["-c:v", "copy"]
    else:
        cmd += [
            "-threads",
            "0",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
        ]

    if copy_audio:
        cmd += ["-c:a", "copy"]
    else:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]

    cmd.append(str(output_path))
    return cmd
