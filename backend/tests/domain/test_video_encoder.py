from app.domain.video_encoder import (
    VideoEncoder,
    argumentos_async_depth,
    argumentos_codec,
    argumentos_codec_qualidade,
    permite_decode_qsv,
)


class TestQsvPreservaArgumentosHistoricos:
    def test_qualidade_usa_global_quality(self):
        assert argumentos_codec_qualidade(
            VideoEncoder.QSV, preset="veryfast", global_quality=30
        ) == [
            "-c:v",
            "h264_qsv",
            "-preset",
            "veryfast",
            "-global_quality",
            "30",
        ]

    def test_async_depth_1(self):
        assert argumentos_async_depth(VideoEncoder.QSV) == ["-async_depth", "1"]

    def test_permite_decode_qsv(self):
        assert permite_decode_qsv(VideoEncoder.QSV) is True


class TestLibx264SemOpcoesDoQsv:
    def test_qualidade_vira_crf_na_mesma_escala(self):
        assert argumentos_codec_qualidade(
            VideoEncoder.LIBX264, preset="veryfast", global_quality=30
        ) == [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "30",
        ]

    def test_codec_por_bitrate(self):
        assert argumentos_codec(VideoEncoder.LIBX264, preset="fast") == [
            "-c:v",
            "libx264",
            "-preset",
            "fast",
        ]

    def test_sem_async_depth(self):
        assert argumentos_async_depth(VideoEncoder.LIBX264) == []

    def test_sem_decode_qsv(self):
        assert permite_decode_qsv(VideoEncoder.LIBX264) is False


class TestBuildersComLibx264:
    """Os builders trocam SÓ o encode (e o decode QSV) — o resto do comando segue."""

    def test_grade_sem_hwaccel_e_com_crf(self):
        from pathlib import Path

        from app.domain.ffmpeg_commands import build_cinematic_grade_cmd

        cmd = build_cinematic_grade_cmd(
            Path("raw.mkv"), Path("graded.mp4"), encoder=VideoEncoder.LIBX264, global_quality=30
        )
        assert "-hwaccel" not in cmd
        assert cmd[cmd.index("-c:v") + 1] == "libx264"
        assert cmd[cmd.index("-crf") + 1] == "30"
        assert "-global_quality" not in cmd and "-async_depth" not in cmd

    def test_segmento_da_grade_mantem_gop_para_o_concat(self):
        from pathlib import Path

        from app.domain.ffmpeg_grade import _build_grade_segment_cmd

        cmd = _build_grade_segment_cmd(
            Path("raw.mkv"),
            Path("seg.ts"),
            inicio=0.0,
            dur=10.0,
            filtro_vf=None,
            region_rel=None,
            fg_png=None,
            global_quality=30,
            encoder=VideoEncoder.LIBX264,
        )
        assert cmd[cmd.index("-c:v") + 1] == "libx264"
        assert cmd[cmd.index("-g") + 1] == "30" and cmd[cmd.index("-bf") + 1] == "0"
        assert "-shortest" in cmd and "-async_depth" not in cmd

    def test_compose_final_mantem_bitrate_do_youtube(self):
        from pathlib import Path

        from app.domain.ffmpeg_overlay import build_compose_and_encode_cmd

        cmd = build_compose_and_encode_cmd(
            Path("graded.mp4"), [], [], Path("final.mp4"), encoder=VideoEncoder.LIBX264
        )
        assert cmd[cmd.index("-c:v") + 1] == "libx264"
        assert cmd[cmd.index("-b:v") + 1] == "8M" and "-async_depth" not in cmd
