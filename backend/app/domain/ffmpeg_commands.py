"""Builders de comandos FFmpeg — funções puras que retornam list[str].

A execução é feita por infrastructure/ffmpeg_runner.py.

Este módulo é a FACHADA histórica: os builders foram fatiados por
responsabilidade (E-006) em `ffmpeg_common`, `ffmpeg_basic`, `ffmpeg_grade` e
`ffmpeg_overlay`, mas todos os nomes públicos continuam importáveis daqui —
nenhum chamador precisa mudar. A orquestração da grade e a resolução dos PNGs
do palco permanecem AQUI porque os testes fazem monkeypatch em
`app.domain.ffmpeg_commands._resolve_shared_*`; manter os resolvers e seus
chamadores no mesmo módulo garante que o patch atinja o call-site.
"""

from pathlib import Path

from app import channel_paths

# Re-exports das camadas fatiadas (fachada). Ordem: helpers -> básicos ->
# grade (puro) -> overlays. Mantém a superfície pública idêntica.
from app.domain.ffmpeg_basic import (
    build_audio_offset_cmd,
    build_concat_cmd,
    build_filter_complex_cmd,
    build_filter_string,
    build_lossless_cut_cmd,
    build_normalize_cmd,
    build_remux_cmd,
    build_silence_detect_cmd,
)
from app.domain.ffmpeg_common import (
    _CANVAS_NORMALIZE,
    _FILTER_SCRIPT_SIZE_THRESHOLD,
    _ffmpeg_decode_thread_args,
    _ffmpeg_filter_thread_args,
    _grade_trim_segmentation_enabled,
    _int_env,
    _resolve_filter_arg,
)
from app.domain.ffmpeg_grade import (
    GradePlan,
    GradeStep,
    _append_fg_chains,
    _build_grade_concat_mux_cmd,
    _build_grade_plan_segmentado,
    _build_grade_segment_cmd,
    _compor_regiao,
    _construir_segmentos_grade,
    _crop_scale_chain,
    _grade_chain,
    _GradeLayout,
    _proportional_size,
    _shared_background_chain,
    _shared_background_png_chain,
    _shared_black_base_chain,
    build_cinematic_grade_layout_filter,
)
from app.domain.ffmpeg_overlay import (
    _LOUDNORM_YOUTUBE,
    _build_audio_args,
    _build_overlay_input_args,
    _build_youtube_encode_args,
    build_compose_and_encode_cmd,
    build_final_encode_cmd,
    build_overlay_composition_cmd,
    build_overlay_filter_string,
)
from app.domain.youtube_layout import (
    config_compartilhada_para_full,
    normalizar_layout_youtube,
    palco_cache_key,
    palco_cache_key_para_config,
    regioes_compartilhadas,
    regioes_full_posicionadas,
    resolver_layout_em_cascata,
)

# Superfície pública da fachada (também marca os re-exports como intencionais
# para o linter). Inclui nomes internos que testes/serviços importam daqui.
__all__ = [
    # básicos
    "build_lossless_cut_cmd",
    "build_audio_offset_cmd",
    "build_concat_cmd",
    "build_filter_string",
    "build_filter_complex_cmd",
    "build_silence_detect_cmd",
    "build_normalize_cmd",
    "build_remux_cmd",
    # grade
    "build_cinematic_grade_cmd",
    "build_grade_plan",
    "build_cinematic_grade_layout_filter",
    "GradePlan",
    "GradeStep",
    "_GradeLayout",
    "_resolver_grade_layout",
    "_resolve_shared_bg_png",
    "_resolve_shared_fg_png",
    "_resolve_shared_fg_png_para_config",
    "_construir_segmentos_grade",
    "_build_grade_plan_segmentado",
    "_build_grade_segment_cmd",
    "_build_grade_concat_mux_cmd",
    "_append_fg_chains",
    "_compor_regiao",
    "_crop_scale_chain",
    "_proportional_size",
    "_grade_chain",
    "_shared_background_chain",
    "_shared_background_png_chain",
    "_shared_black_base_chain",
    # overlays + encode final
    "build_overlay_filter_string",
    "build_overlay_composition_cmd",
    "build_compose_and_encode_cmd",
    "build_final_encode_cmd",
    "_build_overlay_input_args",
    "_build_youtube_encode_args",
    "_build_audio_args",
    "_LOUDNORM_YOUTUBE",
    # helpers compartilhados
    "_resolve_filter_arg",
    "_ffmpeg_decode_thread_args",
    "_ffmpeg_filter_thread_args",
    "_grade_trim_segmentation_enabled",
    "_int_env",
    "_CANVAS_NORMALIZE",
    "_FILTER_SCRIPT_SIZE_THRESHOLD",
]

# Cache do PNG do palco vive sob `projetos/_palco_cache` (já gitignored +
# persistente). Resolvido por `channel_paths.palco_cache_dir()` para seguir o
# canal ativo (D-156); o nome é mantido aqui só por compatibilidade histórica.
_PALCO_CACHE_DIRNAME = "_palco_cache"


# ---------------------------------------------------------------------------
# Grade cinematográfica — orquestração + resolução dos PNGs do palco.
#
# Fica na fachada de propósito: os testes fazem monkeypatch em
# `app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config` /
# `_resolve_shared_bg_png`; `_resolver_grade_layout` chama esses resolvers por
# nome, resolvido no namespace deste módulo — então o patch precisa incidir aqui.
# ---------------------------------------------------------------------------


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
