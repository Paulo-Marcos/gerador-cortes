"""Testes do pipeline de geração de bruto (estratégia única, validada em prod).

Esses testes travam o contrato exato dos comandos FFmpeg gerados.  Várias
abordagens foram testadas antes de chegar nessa (filter_complex multi-trim,
MPEG-TS + concat protocol, concat demuxer simples, etc).  TODAS produziam
arquivos com problemas (metadata corrompida, drift cumulativo, gaps de
frame).  A pipeline atual replica EXATAMENTE o cmd que o LosslessCut usa
em produção — qualquer divergência reabre regressões já conhecidas.
"""

from pathlib import Path

import pytest
from app.domain.bruto_pipeline import BrutoPipeline, build_bruto_pipeline

VIDEO = Path("/data/video.mkv")
OUT = Path("/work/clip_raw.mkv")
WORK = Path("/work")
TMP = Path("/tmp/parts")


def _build(segs: list[tuple[float, float]]) -> BrutoPipeline:
    return build_bruto_pipeline(VIDEO, OUT, WORK, TMP, segs)


def _bat(p: BrutoPipeline) -> str:
    return next(c for path, c in p.files.items() if str(path).endswith(".bat"))


def _concat_list(p: BrutoPipeline) -> str:
    return next(c for path, c in p.files.items() if str(path).endswith(".txt"))


def _seg_lines(bat: str) -> list[str]:
    return [ln for ln in bat.splitlines() if ln.startswith("ffmpeg") and "-f concat" not in ln]


def _concat_line(bat: str) -> str:
    return next(ln for ln in bat.splitlines() if "-f concat" in ln and "-f matroska" in ln)


# ─────────────────────────────────────────────────────────────────────────────
# Validações de entrada
# ─────────────────────────────────────────────────────────────────────────────


class TestValidacaoEntrada:
    def test_segmentos_vazios_levanta(self):
        with pytest.raises(ValueError, match="segmento"):
            _build([])

    def test_um_segmento_aceitavel(self):
        p = _build([(10.0, 20.0)])
        assert isinstance(p, BrutoPipeline)
        assert _seg_lines(_bat(p)) != []

    def test_muitos_segmentos_aceitavel(self):
        segs = [(i * 10.0, i * 10.0 + 5.0) for i in range(80)]
        p = _build(segs)
        assert len(_seg_lines(_bat(p))) == 80


# ─────────────────────────────────────────────────────────────────────────────
# Estrutura geral do .bat
# ─────────────────────────────────────────────────────────────────────────────


class TestEstruturaBat:
    def test_dispatcha_via_cmd_c_bat(self):
        p = _build([(0.0, 10.0)])
        assert p.cmd == ["cmd", "/c", "job_bruto.bat"]

    def test_cabecalho_windows_utf8(self):
        p = _build([(0.0, 10.0)])
        lines = _bat(p).splitlines()
        assert lines[0] == "@echo off"
        assert lines[1] == "chcp 65001 >nul"
        assert lines[2] == "setlocal"

    def test_check_errorlevel_entre_segmentos(self):
        """Cada ffmpeg de segmento deve abortar o script no primeiro erro."""
        p = _build([(0.0, 10.0), (20.0, 30.0)])
        lines = _bat(p).splitlines()
        cortes_idx = [
            i for i, ln in enumerate(lines) if ln.startswith("ffmpeg ") and "-f concat" not in ln
        ]
        assert len(cortes_idx) == 2
        for idx in cortes_idx:
            assert lines[idx + 1] == "if %errorlevel% neq 0 exit /b %errorlevel%"

    def test_finaliza_com_exit_b_errorlevel(self):
        p = _build([(0.0, 10.0)])
        assert _bat(p).splitlines()[-1] == "exit /b %errorlevel%"


# ─────────────────────────────────────────────────────────────────────────────
# Per-segment: flags críticas pra PTS contíguo
# ─────────────────────────────────────────────────────────────────────────────


class TestPerSegment:
    def test_um_ffmpeg_por_segmento_mais_um_concat(self):
        p = _build([(0.0, 10.0), (20.0, 30.0), (40.0, 50.0)])
        cortes = _seg_lines(_bat(p))
        assert len(cortes) == 3

    def test_seek_e_duracao_corretos(self):
        p = _build([(100.0, 110.5)])
        cmd = _seg_lines(_bat(p))[0]
        assert "-ss 00:01:40.000" in cmd
        assert "-t 00:00:10.500" in cmd

    def test_fflags_genpts_antes_do_input(self):
        """REGRESSAO: sem ``-fflags +genpts`` ANTES do ``-i``, ~45% dos parts
        saíam com first_dts=0.033s ao invés de 0, causando gaps de 1 frame
        em cada boundary do concat (2.3s de drift cumulativo em 80 parts).
        """
        p = _build([(100.0, 110.0)])
        cmd = _seg_lines(_bat(p))[0]
        # `-fflags +genpts` deve vir antes do `-i`
        i_idx = cmd.index(" -i ")
        fflags_idx = cmd.index("-fflags +genpts")
        assert fflags_idx < i_idx

    def test_avoid_negative_ts_make_zero(self):
        """Defesa em profundidade junto com -fflags +genpts."""
        p = _build([(0.0, 10.0)])
        cmd = _seg_lines(_bat(p))[0]
        assert "-avoid_negative_ts make_zero" in cmd

    def test_codec_video_libx264_ultrafast(self):
        p = _build([(0.0, 10.0)])
        cmd = _seg_lines(_bat(p))[0]
        assert "-c:v libx264" in cmd
        assert "-preset ultrafast" in cmd

    def test_codec_audio_pcm_lossless(self):
        """REGRESSAO: NUNCA AAC nos parts.  AAC adiciona ~21ms de priming
        samples a cada re-encode, acumulando 1-2s de drift em 80 parts.
        PCM s16le é sample-exato e sem framing intermediário.
        """
        p = _build([(0.0, 10.0)])
        cmd = _seg_lines(_bat(p))[0]
        assert "-c:a pcm_s16le" in cmd
        assert "-c:a aac" not in cmd

    def test_sem_filter_complex_no_segmento(self):
        """REGRESSAO: filter_complex multi-trim por segmento já produziu
        arquivos com duração corrompida (ffprobe N/A).  Cortes individuais
        usam -ss + -t puro, sem filter graph."""
        p = _build([(0.0, 10.0), (20.0, 30.0)])
        for cmd in _seg_lines(_bat(p)):
            assert "-filter_complex" not in cmd
            assert "-filter_complex_script" not in cmd
            assert "-copyts" not in cmd


# ─────────────────────────────────────────────────────────────────────────────
# Concat final: cmd EXATO do LosslessCut
# ─────────────────────────────────────────────────────────────────────────────


class TestConcatLosslessCut:
    """Travam o cmd exato do LosslessCut, validado em produção.

    Esse cmd foi extraído da execução do LosslessCut juntando 79 segmentos
    em <10s com sincronia AV perfeita.  Qualquer divergência reabre
    regressões já investigadas exaustivamente.
    """

    def test_hide_banner(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-hide_banner" in line

    def test_concat_demuxer_safe_zero(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-f concat" in line
        assert "-safe 0" in line

    def test_protocol_whitelist(self):
        """LosslessCut usa esse whitelist explícito."""
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-protocol_whitelist file,pipe,fd" in line

    def test_map_por_indice_nao_por_tipo(self):
        """REGRESSAO: ``-c:v copy`` (por tipo) pode falhar se algum part
        tem mapeamento diferente.  ``-map 0:N -c:N copy`` é determinístico.
        """
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-map 0:0 -c:0 copy" in line
        assert "-map 0:1 -c:1 copy" in line
        # NÃO usa -c:v / -c:a:
        assert "-c:v" not in line
        assert "-c:a" not in line

    def test_disposition_default_em_ambos_streams(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-disposition:0 default" in line
        assert "-disposition:1 default" in line

    def test_movflags_faststart(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-movflags +faststart" in line

    def test_default_mode_infer_no_subs(self):
        """Muxer matroska — não tenta inferir defaults de subtitle streams
        ausentes nos parts."""
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-default_mode infer_no_subs" in line

    def test_ignore_unknown(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-ignore_unknown" in line

    def test_formato_matroska_explicito(self):
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-f matroska" in line

    def test_sem_fflags_genpts_no_concat(self):
        """REGRESSAO: ``-fflags +genpts`` no concat pode reintroduzir drift
        (PTSes já são contíguos vindos dos parts)."""
        line = _concat_line(_bat(_build([(0.0, 10.0)])))
        assert "-fflags" not in line


# ─────────────────────────────────────────────────────────────────────────────
# Concat list (formato ffconcat)
# ─────────────────────────────────────────────────────────────────────────────


class TestConcatList:
    def test_uma_linha_por_segmento(self):
        p = _build([(0.0, 10.0), (20.0, 30.0), (40.0, 50.0)])
        lines = _concat_list(p).splitlines()
        assert len(lines) == 3

    def test_formato_file_quoted(self):
        p = _build([(0.0, 10.0)])
        line = _concat_list(p).splitlines()[0]
        assert line.startswith("file '")
        assert line.endswith(".mkv'")

    def test_forward_slashes_no_windows(self):
        """FFmpeg concat demuxer trata `\\` como escape — paths absolutos
        devem usar `/` mesmo no Windows."""
        p = _build([(0.0, 10.0), (20.0, 30.0)])
        for line in _concat_list(p).splitlines():
            assert "\\" not in line


# ─────────────────────────────────────────────────────────────────────────────
# Determinismo
# ─────────────────────────────────────────────────────────────────────────────


class TestDeterminismo:
    def test_mesma_entrada_mesma_saida(self):
        segs = [(100.0, 110.0), (200.0, 215.5), (300.0, 305.0)]
        a = _build(segs)
        b = _build(segs)
        assert a.cmd == b.cmd
        assert a.files == b.files
        assert a.tmp_dir == b.tmp_dir


# ─────────────────────────────────────────────────────────────────────────────
# Snapshot estrutural — 3 segmentos
# ─────────────────────────────────────────────────────────────────────────────


class TestSnapshot:
    def test_snapshot_3_segmentos(self):
        """Lock estrutural do .bat com 3 segmentos.  Se alguém mudar
        acidentalmente o formato (codec, flags, ordem), o teste falha
        forçando revisão consciente."""
        p = _build([(0.0, 5.0), (10.0, 15.0), (20.0, 25.0)])
        lines = _bat(p).splitlines()
        # 3 header + 3 segmentos × 2 (ffmpeg+check) + 1 concat + 1 exit
        assert len(lines) == 3 + 3 * 2 + 2
        assert lines[0:3] == ["@echo off", "chcp 65001 >nul", "setlocal"]
        # cada par (seg, check) preserva a estrutura
        for i in range(3):
            seg_idx = 3 + i * 2
            assert lines[seg_idx].startswith("ffmpeg -y -nostdin -fflags +genpts -ss")
            assert lines[seg_idx + 1] == "if %errorlevel% neq 0 exit /b %errorlevel%"
        # penúltima linha = concat
        assert "-f concat" in lines[-2] and "-f matroska" in lines[-2]
        # última = exit
        assert lines[-1] == "exit /b %errorlevel%"
