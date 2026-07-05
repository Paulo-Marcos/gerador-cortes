"""Grade cinematográfica — filter graph e plano de execução (Fase 1).

Builders PUROS do compositing por camadas (QSV + palco/overlays Remotion):
construção do filtergraph por região, segmentação por subprocesso e os
comandos de cada segmento/concat. A resolução do layout em cascata e dos PNGs
do palco (com efeitos colaterais de cache/lookup) vive na fachada
`ffmpeg_commands`, que injeta o `_GradeLayout` já resolvido aqui.
"""

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

from app.domain.ffmpeg_common import _CANVAS_NORMALIZE, _ffmpeg_filter_thread_args

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
