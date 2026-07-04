"""Testes da grade com palco: estrutura do filtergraph enable-based + plano de
grade SEGMENTADO por subprocesso (D-065) + paridade visual decode QSV/software.

A segmentação por janela (cada região composita só o seu trecho, ~52% de ganho
em multi-região) é feita por SUBPROCESSO em `build_grade_plan`: cada segmento é
um ffmpeg separado com input-seek — sem `split` fan-out (memory-safe) e com
decode em software (frame-accurate). A 1ª versão segmentava dentro do filtergraph
(`split`+`concat`) e estourava a RAM; esses testes garantem que ela NÃO voltou.
"""

import shutil
import subprocess
from pathlib import Path

import app.domain.ffmpeg_commands as fc
import pytest
from app.domain.ffmpeg_commands import (
    _build_grade_plan_segmentado,
    _construir_segmentos_grade,
    _GradeLayout,
    build_cinematic_grade_layout_filter,
    build_grade_plan,
)


def _regiao(inicio: float, fim: float) -> dict:
    return {
        "telas": 1,
        "inicio": inicio,
        "fim": fim,
        "crop_tela": {"w": 1280, "h": 720, "x": 320, "y": 180},
        "slot_tela": {"w": 1280, "h": 720, "x": 320, "y": 180},
        "crop_facecam": {"w": 100, "h": 100, "x": 0, "y": 0},
        "slot_facecam": {"w": 100, "h": 100, "x": 0, "y": 0},
    }


def _layout(regs: list[dict], fg_paths: list[Path | None]) -> _GradeLayout:
    """_GradeLayout pronto (com PNGs já resolvidos), p/ testar o plano sem o
    cache de PNG do palco."""
    uniq: list[Path] = []
    idx: list[int | None] = []
    for p in fg_paths:
        if p is None:
            idx.append(None)
            continue
        if p not in uniq:
            uniq.append(p)
        idx.append(uniq.index(p))
    return _GradeLayout(
        shared_regions=regs,
        fg_paths_por_regiao=fg_paths,
        has_any_fg=any(p is not None for p in fg_paths),
        bg_png=None,
        unique_pngs=uniq,
        png_input_index=idx,
    )


class TestFiltergraphBase:
    def test_mantem_base_para_limitar_duracao(self):
        # CRITICO: o [base] (finito, do video) e o fundo do encadeamento e
        # limita a duracao da saida ao fim do video. A base preta dos palcos
        # (`color=`) e uma fonte INFINITA; sem o [base] o ffmpeg renderizaria
        # alem do fim do video, infinitamente (regressao ja corrigida).
        regs = [_regiao(0, 30), _regiao(30, 60)]
        f = build_cinematic_grade_layout_filter(None, regs, fg_inputs_per_region=["1:v", "1:v"])
        assert "split=3[base][src0][src1]" in f
        assert "[base][composed0]" in f  # [base] e a base do encadeamento
        assert "between(t,0.000,30.000)" in f
        assert "between(t,30.000,60.000)" in f
        assert f.rstrip().endswith("format=nv12[vout]")

    def test_filtergraph_nunca_segmenta(self):
        # D-065: a trim-segmentation dentro do filtergraph (split+concat) foi
        # REMOVIDA (estourava a RAM). O filter e SEMPRE enable-based, mesmo
        # multi-regiao com duracao — a segmentacao mora em build_grade_plan.
        regs = [_regiao(0, 3), _regiao(3, 6)]
        f = build_cinematic_grade_layout_filter(
            None, regs, fg_inputs_per_region=["1:v", "1:v"], duracao_seg=6
        )
        assert "concat=n=" not in f
        assert "between(t," in f


class TestConstruirSegmentos:
    def test_tiling_sem_buraco(self):
        segs = _construir_segmentos_grade([_regiao(0, 3), _regiao(3, 6)], 6)
        assert segs == [(0.0, 3.0, 0), (3.0, 6.0, 1)]

    def test_buraco_antes_e_depois(self):
        segs = _construir_segmentos_grade([_regiao(2, 4)], 6)
        assert segs == [(0.0, 2.0, None), (2.0, 4.0, 0), (4.0, 6.0, None)]

    def test_sem_duracao_retorna_none(self):
        assert _construir_segmentos_grade([_regiao(0, 6)], None) is None

    def test_sobreposicao_retorna_none(self):
        assert _construir_segmentos_grade([_regiao(0, 4), _regiao(2, 6)], 6) is None

    def test_ordena_por_inicio_preservando_indice_original(self):
        # regiao [0,3] e o indice 1; [3,6] e o indice 0.
        segs = _construir_segmentos_grade([_regiao(3, 6), _regiao(0, 3)], 6)
        assert segs == [(0.0, 3.0, 1), (3.0, 6.0, 0)]


class TestGradePlanEstrutura:
    """build_grade_plan: decide entre comando único e plano segmentado."""

    def test_multi_regiao_com_palco_vira_plano_segmentado(self, monkeypatch):
        # 2 regioes tiling + palco -> 2 segmentos + 1 concat/mux.
        monkeypatch.setattr(
            fc,
            "_resolve_shared_fg_png_para_config",
            lambda *a, **k: Path("/cache/palco.png"),
        )
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada", "compartilhada": {"telas": 2}},
                {"inicio": 10, "fim": 20, "modo": "compartilhada", "compartilhada": {"telas": 1}},
            ],
        }
        plan = build_grade_plan(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            filtro_vf="vignette",
            layout_youtube=layout,
            duracao_seg=20,
        )
        assert plan.segmentado
        assert [s.job_suffix for s in plan.steps] == ["seg000", "seg001", "concat"]
        assert plan.concat_list is not None

    def test_sem_palco_usa_comando_unico(self, monkeypatch):
        # Sem PNG de palco resolvido (has_any_fg=False) -> comando unico
        # enable-based (que sabe lidar com o fallback bg_png/drawbox).
        monkeypatch.setattr(fc, "_resolve_shared_fg_png_para_config", lambda *a, **k: None)
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada", "compartilhada": {"telas": 2}},
                {"inicio": 10, "fim": 20, "modo": "compartilhada", "compartilhada": {"telas": 1}},
            ],
        }
        plan = build_grade_plan(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            filtro_vf="vignette",
            layout_youtube=layout,
            duracao_seg=20,
        )
        assert not plan.segmentado
        assert len(plan.steps) == 1
        assert plan.concat_list is None

    def test_kill_switch_desliga_segmentacao(self, monkeypatch):
        monkeypatch.setenv("GRADE_TRIM_SEGMENTATION", "0")
        monkeypatch.setattr(
            fc,
            "_resolve_shared_fg_png_para_config",
            lambda *a, **k: Path("/cache/palco.png"),
        )
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada", "compartilhada": {"telas": 2}},
                {"inicio": 10, "fim": 20, "modo": "compartilhada", "compartilhada": {"telas": 1}},
            ],
        }
        plan = build_grade_plan(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            filtro_vf="vignette",
            layout_youtube=layout,
            duracao_seg=20,
        )
        assert not plan.segmentado

    def test_buraco_vira_segmento_de_video_puro(self):
        # regiao [2,4] num video de 6s -> gap[0,2] + regiao + gap[4,6].
        lay = _layout([_regiao(2, 4)], [Path("/cache/p.png")])
        segs = _construir_segmentos_grade(lay.shared_regions, 6)
        plan = _build_grade_plan_segmentado(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            lay,
            segs,
            filtro_vf="vignette",
            global_quality=30,
            normalize_audio=False,
        )
        assert [s.job_suffix for s in plan.steps] == ["seg000", "seg001", "seg002", "concat"]
        # gap (seg0) nao tem input de palco; a regiao (seg1) tem.
        assert "-loop" not in plan.steps[0].cmd  # gap: so o video
        assert "-loop" in plan.steps[1].cmd  # regiao: video + palco


class TestGradeSegmentCmd:
    """Garantias do comando de cada segmento (frame-accuracy + memory-safety)."""

    def _seg0(self) -> list[str]:
        lay = _layout([_regiao(0, 3), _regiao(3, 6)], [Path("/c/v.png"), Path("/c/a.png")])
        segs = _construir_segmentos_grade(lay.shared_regions, 6)
        plan = _build_grade_plan_segmentado(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            lay,
            segs,
            filtro_vf="vignette",
            global_quality=30,
            normalize_audio=False,
        )
        return plan.steps[0].cmd

    def test_segmento_usa_input_seek(self):
        cmd = self._seg0()
        assert "-ss" in cmd and "-t" in cmd
        assert cmd[cmd.index("-ss") + 1] == "0.000"

    def test_segmento_decode_software_para_frame_accuracy(self):
        # CRITICO: decode QSV com input-seek erra a contagem de frames em GOP
        # esparso (drift acumula -> quebra sincronia). Segmento decoda em
        # SOFTWARE (sempre exato). So o ENCODE e QSV.
        cmd = self._seg0()
        assert "-hwaccel" not in cmd
        assert "hwdownload" not in " ".join(cmd)
        assert "h264_qsv" in cmd  # encode segue QSV

    def test_segmento_e_video_only_com_shortest_e_ts(self):
        cmd = self._seg0()
        assert "-an" in cmd  # sem audio (tratado no mux)
        assert "-shortest" in cmd  # ancora na janela do video
        assert cmd[-1].endswith(".ts")  # mpegts -> concat -c copy

    def test_segmento_libera_todos_os_nucleos_no_filtro(self):
        # O composite (CPU) e o gargalo da grade; o segmento e 1 regiao (RAM
        # leve), entao NAO capa filter-threads -> usa todos os nucleos. O cap de
        # 2 (band-aid do bug de RAM ja corrigido) deixava a grade 6x mais lenta.
        cmd = self._seg0()
        assert "-filter_complex_threads" not in cmd

    def test_sem_split_fan_out_no_segmento(self):
        # memory-safe: um segmento de 1 regiao usa no maximo split=2 (base+src),
        # nunca o split=N por segmento da versao antiga que estourava a RAM.
        fcx = " ".join(self._seg0())
        assert "split=N" not in fcx
        assert "concat=n=" not in fcx  # o concat e do demuxer, nao do filtro

    def test_concat_mux_une_ts_e_remuxa_audio(self):
        lay = _layout([_regiao(0, 3), _regiao(3, 6)], [Path("/c/v.png"), Path("/c/a.png")])
        segs = _construir_segmentos_grade(lay.shared_regions, 6)
        plan = _build_grade_plan_segmentado(
            Path("in.mkv"),
            Path("out/clip_graded.mp4"),
            lay,
            segs,
            filtro_vf="vignette",
            global_quality=30,
            normalize_audio=False,
        )
        final = plan.steps[-1].cmd
        assert "-f" in final and final[final.index("-f") + 1] == "concat"
        assert "copy" in final  # video copiado (sem re-decode)
        assert "-map" in final  # mapeia audio do input original
        assert final[-1].endswith("clip_graded.mp4")


# ─────────────────────────────────────────────────────────────────────────────
# Integracao via ffmpeg real
# ─────────────────────────────────────────────────────────────────────────────

_FFMPEG = shutil.which("ffmpeg")


def _has_libx264() -> bool:
    if not _FFMPEG:
        return False
    out = subprocess.run(
        [_FFMPEG, "-hide_banner", "-encoders"], capture_output=True, text=True
    ).stdout
    return "libx264" in out


def _qsv_funciona() -> bool:
    if not _FFMPEG:
        return False
    try:
        res = subprocess.run(
            [
                _FFMPEG,
                "-hide_banner",
                "-f",
                "lavfi",
                "-i",
                "color=red:s=64x64:d=0.1",
                "-c:v",
                "h264_qsv",
                "-f",
                "null",
                "-",
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        return False
    return res.returncode == 0


def _run(cmd: list, timeout: int | None = None, cwd: str | None = None) -> None:
    try:
        res = subprocess.run(
            [str(c) for c in cmd], capture_output=True, text=True, timeout=timeout, cwd=cwd
        )
    except subprocess.TimeoutExpired:
        pytest.skip(f"ffmpeg excedeu {timeout}s neste ambiente (QSV lento)")
    if res.returncode != 0:
        raise AssertionError(f"ffmpeg falhou\nCMD: {' '.join(map(str, cmd))}\n{res.stderr[-1200:]}")


def _frame_first(video: Path) -> bytes:
    res = subprocess.run(
        [
            _FFMPEG,
            "-v",
            "error",
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ],
        capture_output=True,
        timeout=60,
    )
    return res.stdout


def _frame_em(video: Path, t: float) -> bytes:
    res = subprocess.run(
        [
            _FFMPEG,
            "-v",
            "error",
            "-ss",
            str(t),
            "-i",
            str(video),
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ],
        capture_output=True,
        timeout=60,
    )
    return res.stdout


def _pixel(frame: bytes, width: int, x: int, y: int) -> tuple:
    off = (y * width + x) * 3
    return frame[off], frame[off + 1], frame[off + 2]


def _nb_frames(video: Path) -> int:
    out = (
        subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-count_frames",
                "-select_streams",
                "v",
                "-show_entries",
                "stream=nb_read_frames",
                "-of",
                "default=nk=1:nw=1",
                str(video),
            ],
            capture_output=True,
            text=True,
        )
        .stdout.strip()
        .split("\n")[0]
    )
    return int(out)


@pytest.mark.integration
@pytest.mark.skipif(
    not _FFMPEG or not _has_libx264() or not _qsv_funciona(),
    reason="ffmpeg/libx264/h264_qsv indisponiveis",
)
def test_qsv_decode_grade_visualmente_igual_ao_software(tmp_path):
    """Fase 3: o decode passa de software para QSV+hwdownload. Renderiza a MESMA
    grade pelos dois caminhos e confirma que o frame e visualmente igual (dentro
    do ruido do encoder lossy). Prova que acelerar o decode nao muda a imagem."""
    from app.domain.ffmpeg_commands import build_cinematic_grade_cmd

    src = tmp_path / "in.mp4"
    _run(
        [
            _FFMPEG,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=1280x720:d=1:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-t",
            "1",
            src,
        ]
    )

    grade = "curves=r='0/0.05 0.5/0.55 1/0.95',eq=contrast=1.12:saturation=0.85"
    out_qsv = tmp_path / "qsv.mp4"
    out_sw = tmp_path / "sw.mp4"

    cmd_qsv = build_cinematic_grade_cmd(src, out_qsv, filtro_vf=grade, hwaccel_decode=True)
    cmd_sw = build_cinematic_grade_cmd(src, out_sw, filtro_vf=grade, hwaccel_decode=False)
    assert "-hwaccel" in cmd_qsv and "-hwaccel" not in cmd_sw

    _run(cmd_qsv, timeout=120)
    _run(cmd_sw, timeout=120)

    fq, fs = _frame_first(out_qsv), _frame_first(out_sw)
    assert fq and fs, "nao consegui extrair frames"
    n = min(len(fq), len(fs))
    amostras = list(range(0, n, 1031))
    mad = sum(abs(fq[i] - fs[i]) for i in amostras) / len(amostras)
    assert mad < 8, f"QSV decode divergiu do software (MAD={mad:.2f})"


def _palco_cor(tmp_path: Path, cor: str, nome: str) -> Path:
    """Palco colorido com janela transparente no slot da tela (320..1600,180..900)."""
    dest = tmp_path / nome
    _run(
        [
            _FFMPEG,
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"color={cor}:s=1920x1080:d=1",
            "-vf",
            "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':"
            "a='if(gte(X,320)*lte(X,1599)*gte(Y,180)*lte(Y,899),0,255)'",
            "-frames:v",
            "1",
            dest,
        ]
    )
    return dest


def _render_palco_1frame(src: Path, palco: Path, filtro: str, *, qsv: bool) -> bytes:
    pre = ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"] if qsv else []
    res = subprocess.run(
        [
            _FFMPEG,
            "-y",
            "-v",
            "error",
            *pre,
            "-i",
            str(src),
            "-loop",
            "1",
            "-i",
            str(palco),
            "-filter_complex",
            filtro,
            "-map",
            "[vout]",
            "-frames:v",
            "1",
            "-pix_fmt",
            "rgb24",
            "-f",
            "rawvideo",
            "-",
        ],
        capture_output=True,
        timeout=120,
    )
    assert res.stdout, f"sem frame (qsv={qsv}); stderr={res.stderr[-700:]}"
    return res.stdout


@pytest.mark.integration
@pytest.mark.skipif(
    not _FFMPEG or not _has_libx264() or not _qsv_funciona(),
    reason="ffmpeg/libx264/h264_qsv indisponiveis",
)
def test_qsv_decode_palco_visualmente_igual_ao_software(tmp_path):
    """O caso REAL do usuario no COMANDO UNICO: grade COM palco (shared_regions).
    Confirma que o decode QSV+hwdownload produz o mesmo composite que o decode
    software — janela = video, palco em volta — frame visualmente identico."""
    src = tmp_path / "in.mp4"
    _run(
        [
            _FFMPEG,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=1920x1080:d=1:r=30",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-t",
            "1",
            src,
        ]
    )
    palco = _palco_cor(tmp_path, "green", "palco.png")

    regs = [_regiao(0, 1)]
    f_qsv = build_cinematic_grade_layout_filter(
        None, regs, fg_inputs_per_region=["1:v"], duracao_seg=1.0, hwaccel_decode=True
    )
    f_sw = build_cinematic_grade_layout_filter(
        None, regs, fg_inputs_per_region=["1:v"], duracao_seg=1.0, hwaccel_decode=False
    )
    assert "hwdownload" in f_qsv and "hwdownload" not in f_sw

    fq = _render_palco_1frame(src, palco, f_qsv, qsv=True)
    fs = _render_palco_1frame(src, palco, f_sw, qsv=False)

    n = min(len(fq), len(fs))
    amostras = list(range(0, n, 1031))
    mad = sum(abs(fq[i] - fs[i]) for i in amostras) / len(amostras)
    assert mad < 8, f"QSV+palco divergiu do software (MAD={mad:.2f})"

    kr, kg, kb = _pixel(fq, 1920, 40, 40)
    assert kg > 100 and kr < 120 and kb < 120, f"canto nao e palco verde: {(kr, kg, kb)}"


@pytest.mark.integration
@pytest.mark.skipif(
    not _FFMPEG or not _has_libx264() or not _qsv_funciona(),
    reason="ffmpeg/libx264/h264_qsv indisponiveis",
)
def test_plano_segmentado_paridade_de_frames_e_regiao_por_janela(tmp_path):
    """PLANO SEGMENTADO ponta a ponta (o caso real do usuario): 3 regioes tiling
    [0,9] (palco VERDE/AZUL/MAGENTA por janela), input com GOP ESPARSO (pior
    caso de seek). Verifica os tres pontos que importam:
      (1) PARIDADE DE FRAMES: output tem exatamente os frames do input (sem o
          drift que o decode QSV+input-seek introduzia — quebraria a sincronia);
      (2) cada regiao na SUA janela;
      (3) AUDIO contínuo preservado (mux unico, sem cliques de borda).
    """
    inp = tmp_path / "in.mp4"
    # GOP gigante (-g 600) = pior caso para seek: 1 keyframe so.
    _run(
        [
            _FFMPEG,
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=red:s=1920x1080:d=9:r=30",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=9",
            "-c:v",
            "libx264",
            "-g",
            "600",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            inp,
        ]
    )
    verde = _palco_cor(tmp_path, "green", "v.png")
    azul = _palco_cor(tmp_path, "blue", "a.png")
    magenta = _palco_cor(tmp_path, "magenta", "m.png")

    lay = _layout([_regiao(0, 3), _regiao(3, 6), _regiao(6, 9)], [verde, azul, magenta])
    segs = _construir_segmentos_grade(lay.shared_regions, 9)
    out = tmp_path / "clip_graded.mp4"
    plan = _build_grade_plan_segmentado(
        inp,
        out,
        lay,
        segs,
        filtro_vf="eq=contrast=1.1",
        global_quality=30,
        normalize_audio=False,
    )
    assert plan.segmentado
    lista_path, conteudo = plan.concat_list
    lista_path.write_text(conteudo, encoding="utf-8")
    for step in plan.steps:
        _run(step.cmd, timeout=180, cwd=str(tmp_path))

    # (1) PARIDADE DE FRAMES: sem drift acumulado (era a classe de bug nova).
    assert _nb_frames(out) == _nb_frames(inp), "drift de frames no plano segmentado"

    # (2) cada regiao na SUA janela (canto = palco da regiao ativa).
    vr, vg, vb = _pixel(_frame_em(out, 1.5), 1920, 40, 40)
    assert vg > 100 and vr < 120 and vb < 120, f"t=1.5 nao e verde: {(vr, vg, vb)}"
    ar, ag, ab = _pixel(_frame_em(out, 4.5), 1920, 40, 40)
    assert ab > 100 and ar < 120 and ag < 120, f"t=4.5 nao e azul: {(ar, ag, ab)}"
    mr, mg, mb = _pixel(_frame_em(out, 7.5), 1920, 40, 40)
    assert mr > 100 and mb > 100 and mg < 120, f"t=7.5 nao e magenta: {(mr, mg, mb)}"
    # centro (janela) mostra o video vermelho.
    cr, cg, cb = _pixel(_frame_em(out, 1.5), 1920, 960, 540)
    assert cr > 140 and cg < 100 and cb < 100, f"centro nao e o video: {(cr, cg, cb)}"

    # (3) AUDIO contínuo preservado.
    adur = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a",
            "-show_entries",
            "stream=duration",
            "-of",
            "default=nk=1:nw=1",
            str(out),
        ],
        capture_output=True,
        text=True,
    ).stdout.strip()
    assert adur and 8.8 <= float(adur) <= 9.2, f"audio nao preservado: {adur}s"
