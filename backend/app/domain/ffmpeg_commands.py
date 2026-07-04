"""Builders de comandos FFmpeg — funções puras que retornam list[str].

A execução é feita por infrastructure/ffmpeg_runner.py.
"""

import os
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app import channel_paths
from app.domain.youtube_layout import (
    config_compartilhada_para_full,
    normalizar_layout_youtube,
    palco_cache_key,
    palco_cache_key_para_config,
    regioes_compartilhadas,
    regioes_full_posicionadas,
    resolver_layout_em_cascata,
)

# Cache do PNG do palco vive sob `projetos/_palco_cache` (já gitignored +
# persistente). Resolvido por `channel_paths.palco_cache_dir()` para seguir o
# canal ativo (D-156); o nome é mantido aqui só por compatibilidade histórica.
_PALCO_CACHE_DIRNAME = "_palco_cache"

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


# ---------------------------------------------------------------------------
# Pipeline Otimizado — Composição por Camadas (QSV + Remotion Overlays)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _GradeLayout:
    """Layout YouTube resolvido em regiões compartilhadas + PNGs de palco
    (dedupados em inputs FFmpeg). Compartilhado pelo comando único
    (`build_cinematic_grade_cmd`) e pelo plano segmentado (`build_grade_plan`)."""

    shared_regions: list[dict]
    fg_paths_por_regiao: list[Path | None]
    has_any_fg: bool
    bg_png: Path | None
    unique_pngs: list[Path]
    png_input_index: list[int | None]


def _resolver_grade_layout(
    layout_youtube: dict | None,
    duracao_seg: float | None,
    projeto_padrao: dict | str | None,
    global_padrao: dict | str | None,
) -> _GradeLayout:
    """F-048: cascade lazy global->projeto->corte + override por segmento.

    Resolve uma vez fundo/placa (constantes) e usa `regioes_compartilhadas` +
    `regioes_full_posicionadas` para o config efetivo por intervalo, resolvendo
    um PNG de palco por região e dedupando-os em inputs FFmpeg.
    """
    layout_resolvido = resolver_layout_em_cascata(
        corte_layout=layout_youtube,
        projeto_padrao=projeto_padrao,
        global_padrao=global_padrao,
    )
    shared_regions = regioes_compartilhadas(
        layout_youtube,
        duracao_seg,
        fallback_layout=projeto_padrao,
        global_padrao=global_padrao,
    )

    # F-060: regioes FULL com posicionamento custom (crop/slot != quadro
    # inteiro) renderizam pelo MESMO caminho do palco de 1 tela — o config
    # sintetico (crop->crop_tela, slot->slot_tela) entra na lista de regioes
    # e o filtergraph nao precisa de caso especial. FULL default segue no
    # video puro (sem crop nem palco), preservando o comportamento anterior.
    for regiao_full in regioes_full_posicionadas(
        layout_youtube,
        duracao_seg,
        fallback_layout=projeto_padrao,
        global_padrao=global_padrao,
    ):
        config_sintetico = config_compartilhada_para_full(
            {"crop": regiao_full["crop"], "slot": regiao_full["slot"]}
        )
        shared_regions.append(
            {
                "inicio": regiao_full["inicio"],
                "fim": regiao_full["fim"],
                **config_sintetico,
            }
        )
    shared_regions.sort(key=lambda regiao: (regiao["inicio"], regiao["fim"]))

    fundo = layout_resolvido["fundo"]
    placa = layout_resolvido["placa"]

    # Resolve um PNG por região (a chave inclui o config efetivo dela). Pré-
    # gerados pelo service `ensure_palco_pngs_para_layout`; se faltar o PNG
    # de uma região, cai para None (essa região renderiza no fundo legado).
    fg_paths_por_regiao: list[Path | None] = []
    for region in shared_regions:
        region_config = {
            "telas": region["telas"],
            "crop_facecam": region["crop_facecam"],
            "crop_tela": region["crop_tela"],
            "slot_facecam": region["slot_facecam"],
            "slot_tela": region["slot_tela"],
        }
        fg_paths_por_regiao.append(
            _resolve_shared_fg_png_para_config(region_config, fundo=fundo, placa=placa)
        )

    has_any_fg = bool(shared_regions) and any(p is not None for p in fg_paths_por_regiao)
    bg_png = _resolve_shared_bg_png(layout_resolvido) if shared_regions and not has_any_fg else None

    # Dedup: cada PNG vira UM input ffmpeg, reusado pelas regiões que casam.
    unique_pngs: list[Path] = []
    png_input_index: list[int | None] = []
    for path in fg_paths_por_regiao:
        if path is None:
            png_input_index.append(None)
            continue
        try:
            idx = unique_pngs.index(path)
        except ValueError:
            idx = len(unique_pngs)
            unique_pngs.append(path)
        png_input_index.append(idx)

    return _GradeLayout(
        shared_regions=shared_regions,
        fg_paths_por_regiao=fg_paths_por_regiao,
        has_any_fg=has_any_fg,
        bg_png=bg_png,
        unique_pngs=unique_pngs,
        png_input_index=png_input_index,
    )


def build_cinematic_grade_cmd(
    input_path: Path,
    output_path: Path,
    *,
    filtro_vf: str | None = None,
    global_quality: int = 27,
    normalize_audio: bool = False,
    layout_youtube: dict | None = None,
    duracao_seg: float | None = None,
    projeto_padrao: dict | str | None = None,
    global_padrao: dict | str | None = None,
    hwaccel_decode: bool = True,
) -> list[str]:
    """Aplica grade cinematográfico + loudnorm via Intel QSV (encode).

    Quando há filtro ou layout compartilhado, a fonte é normalizada para o
    canvas editorial 1920x1080 (mesmo stretch do preview Remotion) ANTES de
    crops/composição — fontes 720p quebravam o layout sem isso (I-036).

    Produz o vídeo "tratado" SEM alterar FPS — mantém o framerate original.
    O filtro visual (curves, colorbalance, vignette, drawbox) é aplicado
    inteiramente pelo FFmpeg em software. O Remotion nunca toca nesse
    processamento.

    Quando -vf filtros estão presentes, NÃO usa -hwaccel qsv no decode:
    filtros software (curves, eq, vignette, drawbox) requerem frames em
    memória de sistema. QSV hwaccel coloca frames em memória GPU, causando
    "Could not open encoder before EOF" (exit -22).

    F-048: cascade lazy `global -> projeto -> corte` + override por segmento.
    Cada região compartilhada usa o PNG do palco gerado para SEU config
    efetivo (ver `palco_cache_key_para_config`). Inputs PNG são dedupados —
    regiões que compartilham o mesmo config reusam o mesmo input FFmpeg.

    Exemplo:
        >>> cmd = build_cinematic_grade_cmd(Path("raw.mkv"), Path("graded.mp4"))
        >>> "h264_qsv" in cmd
        True
    """
    af = "loudnorm=I=-14:TP=-1.0:LRA=11" if normalize_audio else "aresample=async=1:first_pts=0"

    layout = _resolver_grade_layout(layout_youtube, duracao_seg, projeto_padrao, global_padrao)
    shared_regions = layout.shared_regions
    has_any_fg = layout.has_any_fg
    bg_png = layout.bg_png
    unique_pngs = layout.unique_pngs
    png_input_index = layout.png_input_index

    cmd = ["ffmpeg", "-y", "-nostdin"]

    # Decode na GPU (QSV) sempre que possivel:
    # - sem filtros software (re-encode puro): -hwaccel qsv direto.
    # - com filtros (grade/palco): -hwaccel qsv + -hwaccel_output_format qsv e
    #   `hwdownload` no inicio do filtergraph traz os frames p/ a memoria de
    #   sistema antes dos filtros software. ~44% mais rapido que decode em
    #   software puro (medido), mesmo resultado visual. `hwaccel_decode=False`
    #   volta ao decode software (fallback p/ fontes que a QSV nao decodifica).
    usa_qsv_decode_filtros = bool(hwaccel_decode and (filtro_vf or shared_regions))
    if usa_qsv_decode_filtros:
        cmd += ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"]
    elif not filtro_vf and not shared_regions:
        cmd += ["-hwaccel", "qsv"]

    cmd += ["-i", str(input_path)]

    # Inputs PNG (input 0 = vídeo principal; 1..N = PNGs únicos do palco
    # OU, no fallback legado, o único PNG do fundo).
    # `-threads 1` por PNG: são imagens estáticas, 1 thread basta — e o decode
    # PNG multi-thread alocava um pool de frame buffers por thread que estourava
    # a RAM em cortes multi-região (erro `png thread_get_buffer() failed`, D-065).
    if has_any_fg:
        for png in unique_pngs:
            cmd += ["-loop", "1", "-framerate", "30", "-threads", "1", "-i", str(png)]
    elif bg_png is not None:
        cmd += ["-loop", "1", "-framerate", "30", "-threads", "1", "-i", str(bg_png)]

    if shared_regions:
        if has_any_fg:
            fg_inputs_per_region: list[str | None] = [
                f"{1 + idx}:v" if idx is not None else None for idx in png_input_index
            ]
            filter_str = build_cinematic_grade_layout_filter(
                filtro_vf,
                shared_regions,
                fg_inputs_per_region=fg_inputs_per_region,
                duracao_seg=duracao_seg,
                hwaccel_decode=usa_qsv_decode_filtros,
            )
        else:
            filter_str = build_cinematic_grade_layout_filter(
                filtro_vf,
                shared_regions,
                bg_input="1:v" if bg_png is not None else None,
                duracao_seg=duracao_seg,
                hwaccel_decode=usa_qsv_decode_filtros,
            )
        filter_arg = _resolve_filter_arg(filter_str, output_path.parent)
        cmd += [
            *_ffmpeg_filter_thread_args(),
            *filter_arg,
            "-map",
            "[vout]",
            "-map",
            "0:a?",
        ]
    elif filtro_vf:
        hw = "hwdownload,format=nv12," if usa_qsv_decode_filtros else ""
        cmd += ["-vf", f"{hw}{_CANVAS_NORMALIZE},{filtro_vf}"]

    cmd += [
        "-af",
        af,
        "-c:v",
        "h264_qsv",
        "-preset",
        "veryfast",
        "-global_quality",
        str(global_quality),
        "-g",
        "60",
        "-bf",
        "0",
        # -async_depth 1: limita as frames em voo no pipeline QSV. O default
        # mantém várias surfaces enfileiradas (mais RAM/GPU); 1 reduz o pico de
        # memória — relevante em cortes multi-região onde o filtergraph já
        # consome muito (erro `h264_qsv Cannot allocate memory`, D-065).
        "-async_depth",
        "1",
        "-fps_mode",
        "cfr",
        "-pix_fmt",
        "nv12",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    return cmd


@dataclass(frozen=True)
class GradeStep:
    """Um comando FFmpeg do plano da grade. `job_suffix` torna o job_id único
    quando o plano tem vários passos (segmentos + concat)."""

    cmd: list[str]
    job_suffix: str


@dataclass(frozen=True)
class GradePlan:
    """Plano de execução da grade (Fase 1).

    - `single` (1 passo): o comando único enable-based — caminho histórico.
    - `segmentado` (N+1 passos): N segmentos (subprocessos independentes, cada
      um processa só a sua janela via `-ss`/`-t`, sem `split` fan-out → RAM
      limitada à janela) + 1 passo final que une os `.ts` (concat demuxer,
      `-c copy`) e remuxa com o áudio CONTÍNUO do input (filtrado uma vez só).

    `concat_list` é `(path, conteúdo)` a escrever ANTES do passo final.
    `temp_files` (segmentos + lista) são removidos após a execução.
    """

    steps: list[GradeStep]
    concat_list: tuple[Path, str] | None
    temp_files: list[Path]
    segmentado: bool


def build_grade_plan(
    input_path: Path,
    output_path: Path,
    *,
    filtro_vf: str | None = None,
    global_quality: int = 27,
    normalize_audio: bool = False,
    layout_youtube: dict | None = None,
    duracao_seg: float | None = None,
    projeto_padrao: dict | str | None = None,
    global_padrao: dict | str | None = None,
    hwaccel_decode: bool = True,
) -> GradePlan:
    """Decide entre grade em comando único (enable-based) e grade SEGMENTADA por
    subprocesso (memory-safe + mais rápida em multi-região).

    A segmentação por subprocesso substitui a antiga trim-segmentation dentro do
    filtergraph (`split`+`concat`), que estourava a RAM (D-065). Só vale a pena
    quando há palco (`has_any_fg`) e ≥2 segmentos contíguos; caso contrário cai
    no comando único, que continua sendo a fonte de verdade do filtergraph.
    """
    if _grade_trim_segmentation_enabled():
        layout = _resolver_grade_layout(layout_youtube, duracao_seg, projeto_padrao, global_padrao)
        segmentos = _construir_segmentos_grade(layout.shared_regions, duracao_seg)
        if layout.has_any_fg and segmentos is not None and len(segmentos) >= 2:
            return _build_grade_plan_segmentado(
                input_path,
                output_path,
                layout,
                segmentos,
                filtro_vf=filtro_vf,
                global_quality=global_quality,
                normalize_audio=normalize_audio,
            )

    cmd = build_cinematic_grade_cmd(
        input_path,
        output_path,
        filtro_vf=filtro_vf,
        global_quality=global_quality,
        normalize_audio=normalize_audio,
        layout_youtube=layout_youtube,
        duracao_seg=duracao_seg,
        projeto_padrao=projeto_padrao,
        global_padrao=global_padrao,
        hwaccel_decode=hwaccel_decode,
    )
    return GradePlan(
        steps=[GradeStep(cmd, "grade")],
        concat_list=None,
        temp_files=[],
        segmentado=False,
    )


def _build_grade_plan_segmentado(
    input_path: Path,
    output_path: Path,
    layout: _GradeLayout,
    segmentos: list[tuple[float, float, int | None]],
    *,
    filtro_vf: str | None,
    global_quality: int,
    normalize_audio: bool,
) -> GradePlan:
    """Monta o plano segmentado: 1 comando por segmento (vídeo-only `.ts`) +
    1 comando final (concat demuxer + áudio contínuo + mux)."""
    parent = output_path.parent
    stem = output_path.stem
    steps: list[GradeStep] = []
    temp_files: list[Path] = []
    list_lines: list[str] = []

    for k, (inicio, fim, ridx) in enumerate(segmentos):
        seg_file = parent / f"{stem}.seg{k:03d}.ts"
        dur = fim - inicio
        if ridx is None:
            region_rel: dict | None = None
            fg_png: Path | None = None
        else:
            # A janela do segmento vira [0, dur] após o input-seek (PTS começa em
            # ~0); a região cobre o segmento inteiro.
            region_rel = {**layout.shared_regions[ridx], "inicio": 0.0, "fim": dur}
            fg_png = layout.fg_paths_por_regiao[ridx]
        steps.append(
            GradeStep(
                _build_grade_segment_cmd(
                    input_path,
                    seg_file,
                    inicio=inicio,
                    dur=dur,
                    filtro_vf=filtro_vf,
                    region_rel=region_rel,
                    fg_png=fg_png,
                    global_quality=global_quality,
                ),
                f"seg{k:03d}",
            )
        )
        temp_files.append(seg_file)
        list_lines.append(f"file '{seg_file.name}'")

    concat_list_path = parent / f"{stem}.concat.txt"
    concat_list_content = "\n".join(list_lines) + "\n"
    temp_files.append(concat_list_path)

    af = "loudnorm=I=-14:TP=-1.0:LRA=11" if normalize_audio else "aresample=async=1:first_pts=0"
    steps.append(
        GradeStep(
            _build_grade_concat_mux_cmd(concat_list_path, input_path, output_path, af=af),
            "concat",
        )
    )

    return GradePlan(
        steps=steps,
        concat_list=(concat_list_path, concat_list_content),
        temp_files=temp_files,
        segmentado=True,
    )


def _build_grade_segment_cmd(
    input_path: Path,
    seg_output: Path,
    *,
    inicio: float,
    dur: float,
    filtro_vf: str | None,
    region_rel: dict | None,
    fg_png: Path | None,
    global_quality: int,
) -> list[str]:
    """Comando FFmpeg de UM segmento da grade.

    Input-seek (`-ss`/`-t`) recorta SÓ a janela do segmento — sem `split` fan-out,
    a RAM fica limitada à janela. Saída vídeo-only `.ts` (mpegts carrega SPS/PPS
    in-band → o concat demuxer com `-c copy` costura sem re-encode nem glitch).
    O áudio é tratado uma vez só no passo de concat/mux, não por segmento.

    DECODE EM SOFTWARE (de propósito): o input-seek com decode QSV erra a
    contagem de frames quando o keyframe alvo está distante (fontes de live têm
    GOP esparso/irregular) — emite ~1 frame extra por segmento e o drift acumula,
    quebrando a sincronia. O decode software com input-seek é sempre exato
    (validado em GOP gigante). O ganho de QSV no decode é pequeno no caso-palco
    (o composite domina), então a troca compensa. O ENCODE segue em h264_qsv.
    """
    tem_regiao = region_rel is not None

    cmd = ["ffmpeg", "-y", "-nostdin"]
    cmd += ["-ss", f"{inicio:.3f}", "-t", f"{dur:.3f}", "-i", str(input_path)]

    if tem_regiao and fg_png is not None:
        cmd += ["-loop", "1", "-framerate", "30", "-threads", "1", "-i", str(fg_png)]
        filt = build_cinematic_grade_layout_filter(
            filtro_vf,
            [region_rel],
            fg_inputs_per_region=["1:v"],
            duracao_seg=dur,
            hwaccel_decode=False,
        )
    elif tem_regiao:
        filt = build_cinematic_grade_layout_filter(
            filtro_vf, [region_rel], duracao_seg=dur, hwaccel_decode=False
        )
    else:
        filt = build_cinematic_grade_layout_filter(filtro_vf, [], hwaccel_decode=False)
    # Composite de 1 região por segmento → RAM levíssima; libera TODOS os núcleos
    # no filtro (o composite na CPU é o gargalo da grade). `default=0` = sem teto.
    cmd += [*_ffmpeg_filter_thread_args(default=0), "-filter_complex", filt, "-map", "[vout]"]

    cmd += [
        "-an",
        # -shortest: o palco (`-loop 1`) e a base preta (`color=`) são fontes
        # INFINITAS; sem este limite o decode QSV com input-seek emite ~1 frame
        # extra por segmento e o drift ACUMULA com a contagem de segmentos
        # (quebraria a sincronia fina de áudio). `-shortest` ancora a saída na
        # janela do vídeo (sempre o input mais curto) → contagem de frames exata.
        "-shortest",
        "-c:v",
        "h264_qsv",
        "-preset",
        "veryfast",
        "-global_quality",
        str(global_quality),
        # GOP fixo + sem B-frames: cada segmento começa com keyframe (IDR) e é
        # auto-contido → concat demuxer com `-c copy` costura sem recodificar.
        "-g",
        "30",
        "-keyint_min",
        "30",
        "-bf",
        "0",
        "-async_depth",
        "1",
        "-fps_mode",
        "cfr",
        "-pix_fmt",
        "nv12",
        str(seg_output),
    ]
    return cmd


def _build_grade_concat_mux_cmd(
    concat_list_path: Path,
    input_path: Path,
    output_path: Path,
    *,
    af: str,
) -> list[str]:
    """Une os segmentos `.ts` (concat demuxer, `-c copy` → sem re-decode, RAM
    ~zero) e remuxa com o áudio CONTÍNUO do input original (filtrado uma vez só
    → sem cliques de borda entre segmentos). Vídeo copiado, áudio AAC.

    A lista de concat usa caminhos RELATIVOS (só o nome do `.ts`), resolvidos a
    partir do cwd do worker (= `output_path.parent`).
    """
    return [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concat_list_path.name,
        "-i",
        str(input_path),
        "-map",
        "0:v",
        "-map",
        "1:a?",
        "-c:v",
        "copy",
        "-af",
        af,
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-movflags",
        "+faststart",
        str(output_path),
    ]


def build_cinematic_grade_layout_filter(
    filtro_vf: str | None,
    shared_regions: list[dict],
    bg_input: str | None = None,
    fg_input: str | None = None,
    fg_inputs_per_region: list[str | None] | None = None,
    duracao_seg: float | None = None,
    hwaccel_decode: bool = False,
) -> str:
    """Filter graph da grade quando ha trechos com layout compartilhado.

    Camada editorial por regiao:
    - ``fg_inputs_per_region`` (F-048): PNG por regiao (cada regiao pode ter
      um PNG distinto via override de segmento). Quando varias regioes
      compartilham o mesmo input, ele e split internamente.
    - ``fg_input`` (back-compat): mesmo PNG para todas as regioes — equivale
      a `fg_inputs_per_region = [fg_input] * N`.
    - ``bg_input``: PNG so do fundo, ATRAS dos videos (comportamento legado).
    - nenhum: fundo procedural drawbox como fallback.
    """
    # hwaccel_decode: a fonte foi decodificada na GPU (QSV) e chega como frame
    # de hardware; `hwdownload,format=nv12` traz para a memoria de sistema antes
    # dos filtros software (curves/eq/crop/overlay). Decode QSV + hwdownload e
    # ~44% mais rapido que decode em software puro, mesmo resultado visual.
    hw = "hwdownload,format=nv12," if hwaccel_decode else ""

    if not shared_regions:
        return f"[0:v]{hw}{_CANVAS_NORMALIZE},{_grade_chain(filtro_vf)}format=nv12[vout]"

    # Normaliza fg_input legado para o formato per-region.
    if fg_inputs_per_region is None and fg_input is not None:
        fg_inputs_per_region = [fg_input] * len(shared_regions)

    has_fg = fg_inputs_per_region is not None and any(
        label is not None for label in fg_inputs_per_region
    )

    grade_prefix = f"[0:v]{hw}{_CANVAS_NORMALIZE},{_grade_chain(filtro_vf)}format=rgba"

    # Caminho enable-based (memória limitada): cada região é compostada full-
    # length e mascarada por `enable` temporal. A segmentação por janela — que
    # evita o composite full-length em cortes multi-região — agora é feita por
    # SUBPROCESSO (`build_grade_plan`), não mais dentro deste filtergraph: o
    # `split`+`concat` antigo bufferizava frames RGBA e estourava a RAM (D-065).
    # [base]: copia full-frame FINITA do video graded que limita a duracao da
    # saida (a base preta dos palcos e fonte infinita; sem o [base] como fundo a
    # saida nao termina e renderiza alem do fim do video).
    split_labels = "".join(f"[src{i}]" for i in range(len(shared_regions)))
    parts = [f"{grade_prefix},split={len(shared_regions) + 1}[base]{split_labels}"]

    _append_fg_chains(parts, has_fg, fg_inputs_per_region, bg_input, len(shared_regions))

    previous = "[base]"
    for index, region in enumerate(shared_regions):
        regiao_tem_fg = fg_inputs_per_region is not None and fg_inputs_per_region[index] is not None
        composed = _compor_regiao(
            parts,
            f"[src{index}]",
            index,
            region,
            regiao_tem_fg=regiao_tem_fg,
            bg_input=bg_input,
        )
        out_label = f"[vLayout{index}]"
        enable = f"between(t,{region['inicio']:.3f},{region['fim']:.3f})"
        parts.append(
            f"{previous}{composed}"
            f"overlay=enable='{enable}':x=0:y=0:eof_action=pass:format=auto{out_label}"
        )
        previous = out_label

    parts.append(f"{previous}format=nv12[vout]")
    return "; ".join(parts)


def _construir_segmentos_grade(
    shared_regions: list[dict], duracao_seg: float | None, eps: float = 0.05
) -> list[tuple[float, float, int | None]] | None:
    """Divide [0, duracao] em segmentos contiguos para o trim-segmentation.

    Retorna `[(inicio, fim, indice_regiao | None), ...]` cobrindo [0, duracao]
    sem buracos (buraco = segmento com indice None = video graded puro), ou
    `None` quando NAO e seguro segmentar: sem duracao, regioes sobrepostas, ou
    regiao degenerada. Nesses casos o chamador usa o caminho enable-based.
    """
    if duracao_seg is None or duracao_seg <= 0 or not shared_regions:
        return None
    duracao = float(duracao_seg)
    ordem = sorted(
        range(len(shared_regions)),
        key=lambda i: (shared_regions[i]["inicio"], shared_regions[i]["fim"]),
    )
    segmentos: list[tuple[float, float, int | None]] = []
    t = 0.0
    for i in ordem:
        ini = max(0.0, float(shared_regions[i]["inicio"]))
        fim = min(duracao, float(shared_regions[i]["fim"]))
        if fim <= ini + eps:
            return None  # regiao degenerada/zerada — nao arrisca
        if ini < t - eps:
            return None  # sobreposicao — enable-based resolve (ultima vence)
        if ini > t + eps:
            segmentos.append((t, ini, None))  # buraco antes da regiao
        segmentos.append((ini, fim, i))
        t = fim
    if t < duracao - eps:
        segmentos.append((t, duracao, None))  # buraco final
    return segmentos


def _append_fg_chains(
    parts: list[str],
    has_fg: bool,
    fg_inputs_per_region: list[str | None] | None,
    bg_input: str | None,
    n_regioes: int,
) -> None:
    """F-048: escala/split os PNGs do palco em labels [fg{idx}] por regiao."""
    if has_fg and fg_inputs_per_region is not None:
        regions_por_input: dict[str, list[int]] = defaultdict(list)
        for region_idx, label in enumerate(fg_inputs_per_region):
            if label is not None:
                regions_por_input[label].append(region_idx)
        for input_label, region_idxs in regions_por_input.items():
            count = len(region_idxs)
            base = f"[{input_label}]scale=1920:1080,setsar=1,format=rgba"
            if count == 1:
                parts.append(f"{base}[fg{region_idxs[0]}]")
            else:
                labels = "".join(f"[fg{i}]" for i in region_idxs)
                parts.append(f"{base},split={count}{labels}")
    elif bg_input is not None:
        parts.append(_shared_background_png_chain(bg_input, n_regioes))


def _compor_regiao(
    parts: list[str],
    src_label: str,
    index: int,
    region: dict,
    *,
    regiao_tem_fg: bool,
    bg_input: str | None,
) -> str:
    """Monta o composite de UMA regiao a partir de `src_label` (full ou trimado)
    e devolve o label do resultado. Identico nos dois caminhos (enable-based e
    segmentado) — a base preta dos palcos e uma fonte infinita; quem limita a
    duracao e o [base] (enable-based) ou o `trim=end` do segmento (segmentado)."""
    try:
        quantidade_telas = int(region.get("telas", 2) or 2)
    except (TypeError, ValueError):
        quantidade_telas = 2
    face_crop = region["crop_facecam"]
    tela_crop = region["crop_tela"]
    face_slot = region["slot_facecam"]
    tela_slot = region["slot_tela"]

    if quantidade_telas == 1:
        parts.append(f"{src_label}{_crop_scale_chain(tela_crop, tela_slot)}[tela{index}]")
    else:
        parts.append(f"{src_label}split=2[src{index}face][src{index}tela]")
        parts.append(f"[src{index}face]{_crop_scale_chain(face_crop, face_slot)}[face{index}]")
        parts.append(f"[src{index}tela]{_crop_scale_chain(tela_crop, tela_slot)}[tela{index}]")

    if regiao_tem_fg:
        # Base preta: o palco (frente) cobre tudo fora das janelas.
        parts.append(_shared_black_base_chain(index))
    elif bg_input is None:
        parts.append(_shared_background_chain(index))

    tela_out = f"[shared{index}]" if quantidade_telas == 1 else f"[bgTela{index}]"
    parts.append(
        f"[bg{index}][tela{index}]"
        f"overlay=x={tela_slot['x']}:y={tela_slot['y']}:format=auto{tela_out}"
    )
    if quantidade_telas != 1:
        parts.append(
            f"[bgTela{index}][face{index}]"
            f"overlay=x={face_slot['x']}:y={face_slot['y']}:format=auto[shared{index}]"
        )
    if regiao_tem_fg:
        # Palco POR CIMA: janelas transparentes revelam os videos; chrome e
        # placa em alpha parcial ficam sobre as bordas.
        parts.append(f"[shared{index}][fg{index}]overlay=x=0:y=0:format=auto[composed{index}]")
        return f"[composed{index}]"
    return f"[shared{index}]"


def _grade_chain(filtro_vf: str | None) -> str:
    return f"{filtro_vf}," if filtro_vf else ""


def _crop_scale_chain(crop: dict, slot: dict) -> str:
    scale_w, scale_h = _proportional_size(crop, slot)
    return (
        f"crop={crop['w']}:{crop['h']}:{crop['x']}:{crop['y']},"
        f"scale={scale_w}:{scale_h},"
        "setsar=1,format=rgba"
    )


def _proportional_size(crop: dict, slot: dict) -> tuple[int, int]:
    escala = max(0.01, min(slot["w"] / crop["w"], slot["h"] / crop["h"]))
    return (
        max(1, int(round(crop["w"] * escala))),
        max(1, int(round(crop["h"] * escala))),
    )


def _resolve_shared_bg_png(layout_youtube: dict | None) -> Path | None:
    """Resolve o PNG do fundo editorial conforme `fundo`, se existir nos assets."""
    if not layout_youtube:
        return None
    try:
        fundo = normalizar_layout_youtube(layout_youtube)["fundo"]
    except Exception:
        return None
    caminho = channel_paths.youtube_bg_dir() / f"{fundo}.png"
    return caminho if caminho.exists() else None


def _resolve_shared_fg_png(layout_youtube: dict | None) -> Path | None:
    """Resolve o PNG do "palco" (frente) por hash do layout, se já em cache.

    Lookup PURO (sem gerar): a geração fica no service `youtube_palco`. Mesma
    `palco_cache_key` usada lá → caminho único por geometria+placa+fundo+versão.
    """
    if not layout_youtube:
        return None
    try:
        key = palco_cache_key(layout_youtube)
    except Exception:
        return None
    caminho = channel_paths.palco_cache_dir() / f"{key}.png"
    return caminho if caminho.exists() else None


def _resolve_shared_fg_png_para_config(
    compartilhada: dict,
    fundo: str,
    placa: dict,
) -> Path | None:
    """F-048: variante que aceita um config compartilhada arbitrario.

    Usado pelo `build_cinematic_grade_cmd` para resolver UM PNG por regiao
    (cada regiao pode ter compartilhada override). Lookup puro — geracao no
    `ensure_palco_pngs_para_layout`.
    """
    try:
        key = palco_cache_key_para_config(compartilhada, fundo=fundo, placa=placa)
    except Exception:
        return None
    caminho = channel_paths.palco_cache_dir() / f"{key}.png"
    return caminho if caminho.exists() else None


def _shared_background_png_chain(bg_input: str, count: int) -> str:
    """Escala o PNG do fundo para 1920x1080 e replica em N saidas [bg0..bgN-1]."""
    base = f"[{bg_input}]scale=1920:1080,setsar=1,format=rgba"
    if count == 1:
        return f"{base}[bg0]"
    labels = "".join(f"[bg{i}]" for i in range(count))
    return f"{base},split={count}{labels}"


def _shared_black_base_chain(index: int) -> str:
    """Base preta 1920x1080 — usada sob os videos quando o palco vai por cima."""
    return f"color=c=black:s=1920x1080:r=30,format=rgba[bg{index}]"


def _shared_background_chain(index: int) -> str:
    return (
        "color=c=0x2a2e35:s=1920x1080:r=30,format=rgba,"
        "drawbox=x=0:y=0:w=730:h=520:color=0xb47850@0.28:t=fill,"
        "drawbox=x=1000:y=0:w=920:h=600:color=0x5082aa@0.23:t=fill,"
        "drawbox=x=250:y=500:w=1180:h=580:color=0x3c5a4b@0.28:t=fill,"
        "drawbox=x=1320:y=660:w=600:h=420:color=0xdcb478@0.18:t=fill,"
        "drawbox=x=0:y=0:w=1920:h=1080:color=0x1e2a22@0.10:t=fill"
        f"[bg{index}]"
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
