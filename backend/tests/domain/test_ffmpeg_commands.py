from pathlib import Path

import pytest
from app.domain.ffmpeg_commands import (
    build_audio_offset_cmd,
    build_cinematic_grade_cmd,
    build_cinematic_grade_layout_filter,
    build_compose_and_encode_cmd,
    build_concat_cmd,
    build_filter_complex_cmd,
    build_filter_string,
    build_final_encode_cmd,
    build_lossless_cut_cmd,
    build_normalize_cmd,
    build_overlay_composition_cmd,
    build_overlay_filter_string,
    build_remux_cmd,
    build_silence_detect_cmd,
)

VIDEO = Path("video.mp4")
OUTPUT = Path("output.mp4")


def _has(cmd, *flags):
    """Verifica que todas as flags estão na lista de argumentos."""
    return all(f in cmd for f in flags)


CLIP = Path("clip.mkv")


class TestBuildAudioOffsetCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_audio_offset_cmd(CLIP, OUTPUT, 120)
        assert cmd[0] == "ffmpeg"

    def test_duplica_input_e_aplica_itsoffset_em_segundos(self):
        cmd = build_audio_offset_cmd(CLIP, OUTPUT, 250)
        # Dois inputs do mesmo clip; o segundo com -itsoffset em segundos.
        assert cmd.count("-i") == 2
        idx = cmd.index("-itsoffset")
        assert float(cmd[idx + 1]) == pytest.approx(0.25)
        assert cmd[idx + 2] == "-i"
        assert cmd[idx + 3] == str(CLIP)

    def test_offset_negativo_adianta_audio(self):
        cmd = build_audio_offset_cmd(CLIP, OUTPUT, -80)
        idx = cmd.index("-itsoffset")
        assert float(cmd[idx + 1]) == pytest.approx(-0.08)

    def test_mapeia_video_do_input0_e_audio_do_input1(self):
        cmd = build_audio_offset_cmd(CLIP, OUTPUT, 100)
        assert _has(cmd, "-map", "0:v", "1:a")
        # vídeo stream-copiado, áudio re-encodado para respeitar o offset.
        assert _has(cmd, "-c:v", "copy")
        assert cmd[cmd.index("-c:a") + 1] == "aac"

    def test_nao_usa_shortest(self):
        # -shortest truncaria o vídeo em offset negativo; deve estar ausente.
        cmd = build_audio_offset_cmd(CLIP, OUTPUT, -200)
        assert "-shortest" not in cmd


class TestBuildLosslessCutCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert cmd[0] == "ffmpeg"

    def test_tem_flag_y(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert "-y" in cmd

    def test_input_correto(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        idx = cmd.index("-i")
        assert cmd[idx + 1] == str(VIDEO)

    def test_ss_com_inicio(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        idx = cmd.index("-ss")
        assert float(cmd[idx + 1]) == pytest.approx(10.0)

    def test_t_com_duracao_calculada(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        idx = cmd.index("-t")
        assert float(cmd[idx + 1]) == pytest.approx(50.0)

    def test_codec_video_libx264(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert _has(cmd, "-c:v", "libx264")

    def test_codec_audio_aac(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert _has(cmd, "-c:a", "aac")

    def test_output_no_fim(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert cmd[-1] == str(OUTPUT)

    def test_retorna_lista_de_strings(self):
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        assert all(isinstance(x, str) for x in cmd)

    def test_ss_antes_do_input(self):
        """Garante input seek (-ss antes de -i) para corte preciso em livestreams."""
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 10.0, 60.0)
        ss_idx = cmd.index("-ss")
        i_idx = cmd.index("-i")
        assert ss_idx < i_idx

    def test_duracao_calculada_corretamente(self):
        """Duração = fim - inicio, nunca a duração total do vídeo."""
        cmd = build_lossless_cut_cmd(VIDEO, OUTPUT, 100.0, 520.0)
        t_idx = cmd.index("-t")
        assert float(cmd[t_idx + 1]) == pytest.approx(420.0, abs=0.01)


class TestBuildConcatCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_concat_cmd(Path("concat.txt"), OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_usa_concat_demuxer(self):
        cmd = build_concat_cmd(Path("concat.txt"), OUTPUT)
        assert _has(cmd, "-f", "concat")

    def test_copia_codecs(self):
        cmd = build_concat_cmd(Path("concat.txt"), OUTPUT)
        assert _has(cmd, "-c", "copy")

    def test_output_no_fim(self):
        cmd = build_concat_cmd(Path("concat.txt"), OUTPUT)
        assert cmd[-1] == str(OUTPUT)


class TestBuildFilterString:
    def test_unico_segmento(self):
        result = build_filter_string([(0.0, 10.0)])
        assert "trim=" in result
        assert "concat=n=1" in result

    def test_dois_segmentos(self):
        result = build_filter_string([(0.0, 10.0), (20.0, 30.0)])
        assert "concat=n=2" in result

    def test_saidas_mapeadas(self):
        result = build_filter_string([(0.0, 10.0), (20.0, 30.0)])
        assert "[outv][outa]" in result

    def test_cada_segmento_tem_video_e_audio(self):
        result = build_filter_string([(0.0, 10.0), (20.0, 30.0)])
        assert "[v0]" in result
        assert "[a0]" in result
        assert "[v1]" in result
        assert "[a1]" in result

    def test_aresample_presente(self):
        result = build_filter_string([(0.0, 10.0)])
        assert "aresample" in result

    def test_separador_ponto_e_virgula(self):
        result = build_filter_string([(0.0, 10.0), (20.0, 30.0)])
        assert "; " in result


class TestBuildFilterComplexCmd:
    def test_segmento_unico_usa_ss_t(self):
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(10.0, 60.0)])
        assert "-ss" in cmd
        assert "-t" in cmd
        assert "-filter_complex" not in cmd

    def test_multiplos_segmentos_usa_filter_complex(self):
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(0.0, 10.0), (20.0, 30.0)])
        assert "-filter_complex" in cmd or "-filter_complex_script" in cmd

    def test_comeca_com_ffmpeg(self):
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(0.0, 10.0)])
        assert cmd[0] == "ffmpeg"

    def test_output_no_fim(self):
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(0.0, 10.0)])
        assert cmd[-1] == str(OUTPUT)

    def test_multi_segmento_tem_map(self):
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(0.0, 10.0), (20.0, 30.0)])
        assert "-map" in cmd

    def test_segmento_unico_ss_antes_do_input(self):
        """Caso de 1 segmento usa input seek (-ss antes de -i) — simples e exato."""
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(10.0, 60.0)])
        ss_idx = cmd.index("-ss")
        i_idx = cmd.index("-i")
        assert ss_idx < i_idx

    def test_multi_segmento_usa_copyts_quando_seek(self):
        """REGRESSAO: combinar `-ss before -i` com filter `trim` em multi-segmento
        produz arquivos com duracao totalmente errada (vi 3450s onde deveriam ser
        414s) SE os tempos do trim forem ajustados ao seek (0-based) e o demuxer
        nao resetar PTSes.

        Solucao: usa `-ss EARLY -copyts -i video` (preserva PTSes originais) +
        trim com tempos ABSOLUTOS. Este teste garante que o par esteja correto.
        """
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(100.0, 110.0), (200.0, 210.0)])
        i_idx = cmd.index("-i")
        flags_antes = cmd[:i_idx]
        if "-ss" in flags_antes:
            # Se tem -ss antes de -i, OBRIGATORIAMENTE deve ter -copyts junto.
            assert "-copyts" in flags_antes, (
                "Multi-segmento com -ss antes de -i precisa de -copyts para "
                "preservar PTSes e casar com trim absoluto"
            )

    def test_multi_segmento_trim_usa_tempos_absolutos(self):
        """Os trims do filter_complex devem conter os tempos ABSOLUTOS dos
        segmentos, nao tempos ajustados ao primeiro segmento (essa ajustagem
        causou o bug de duracao 8x maior)."""
        cmd = build_filter_complex_cmd(VIDEO, OUTPUT, [(100.0, 110.0), (200.0, 210.0)])
        if "-filter_complex" in cmd:
            idx = cmd.index("-filter_complex")
            filter_str = cmd[idx + 1]
            # Os tempos originais devem aparecer; nao os 0-based (start=0, end=10)
            assert "start=100" in filter_str
            assert "end=110" in filter_str
            assert "start=200" in filter_str
            assert "end=210" in filter_str


class TestBuildSilenceDetectCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_silence_detect_cmd("audio.wav")
        assert cmd[0] == "ffmpeg"

    def test_contem_silencedetect(self):
        cmd = build_silence_detect_cmd("audio.wav")
        assert any("silencedetect" in arg for arg in cmd)

    def test_contem_input(self):
        cmd = build_silence_detect_cmd("audio.wav")
        assert "audio.wav" in cmd

    def test_sem_offset_nao_tem_ss(self):
        cmd = build_silence_detect_cmd("audio.wav")
        assert "-ss" not in cmd

    def test_com_offset_tem_ss_e_t(self):
        cmd = build_silence_detect_cmd("audio.wav", start_offset=10.0, duration=60.0)
        assert "-ss" in cmd
        assert "-t" in cmd

    def test_noise_db_customizavel(self):
        cmd = build_silence_detect_cmd("audio.wav", noise_db="-40dB")
        assert any("-40dB" in arg for arg in cmd)

    def test_saida_null(self):
        cmd = build_silence_detect_cmd("audio.wav")
        assert "-f" in cmd
        assert "null" in cmd


class TestBuildNormalizeCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_normalize_cmd(VIDEO, OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_contem_loudnorm(self):
        cmd = build_normalize_cmd(VIDEO, OUTPUT)
        assert any("loudnorm" in arg for arg in cmd)

    def test_sem_filtro_vf_nao_tem_vf(self):
        cmd = build_normalize_cmd(VIDEO, OUTPUT)
        assert "-vf" not in cmd

    def test_com_filtro_vf_tem_vf(self):
        cmd = build_normalize_cmd(VIDEO, OUTPUT, filtro_vf="vignette")
        assert "-vf" in cmd
        idx = cmd.index("-vf")
        assert cmd[idx + 1] == "vignette"

    def test_output_no_fim(self):
        cmd = build_normalize_cmd(VIDEO, OUTPUT)
        assert cmd[-1] == str(OUTPUT)


class TestBuildRemuxCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_copy_video_por_padrao(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT)
        assert _has(cmd, "-c:v", "copy")

    def test_copy_audio_por_padrao(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT)
        assert _has(cmd, "-c:a", "copy")

    def test_sem_copy_video_usa_libx264(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT, copy_video=False)
        assert "libx264" in cmd

    def test_sem_copy_audio_usa_aac(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT, copy_audio=False)
        assert "aac" in cmd

    def test_output_no_fim(self):
        cmd = build_remux_cmd(VIDEO, OUTPUT)
        assert cmd[-1] == str(OUTPUT)


class TestBuildCinematicGradeCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_usa_h264_qsv(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert "h264_qsv" in cmd

    def test_sem_filtro_usa_hwaccel_qsv(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert "-hwaccel" in cmd
        assert "qsv" in cmd

    def test_com_filtro_usa_qsv_decode_e_hwdownload(self):
        # Fase 3: com filtro, decodifica na GPU (QSV) e faz hwdownload antes dos
        # filtros software — ~44% mais rapido que decode em software puro.
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, filtro_vf="vignette")
        assert "-hwaccel" in cmd and "qsv" in cmd
        assert "-hwaccel_output_format" in cmd
        idx = cmd.index("-vf")
        assert cmd[idx + 1].startswith("hwdownload,format=nv12,")

    def test_filtro_com_hwaccel_decode_off_volta_ao_software(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, filtro_vf="vignette", hwaccel_decode=False)
        assert "-hwaccel" not in cmd
        idx = cmd.index("-vf")
        assert not cmd[idx + 1].startswith("hwdownload")

    def test_layout_compartilhado_usa_filter_complex(self):
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={
                "modo_padrao": "full",
                "regioes": [{"inicio": 10, "fim": 20, "modo": "compartilhada"}],
            },
            duracao_seg=60,
        )

        assert "-filter_complex" in cmd or "-filter_complex_script" in cmd
        assert "-vf" not in cmd
        assert "-hwaccel" in cmd  # Fase 3: QSV decode tambem com layout compartilhado
        assert "[vout]" in cmd

    def test_layout_compartilhado_com_default_full_sem_regiao_preserva_fluxo_antigo(self):
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "full", "regioes": []},
            duracao_seg=60,
        )

        assert "-filter_complex" not in cmd
        assert "-hwaccel" in cmd

    def test_layout_compartilhado_default_shared_usa_duracao(self):
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "compartilhada", "regioes": []},
            duracao_seg=60,
        )

        idx = cmd.index("-filter_complex")
        # A regiao default-shared cobre [0, duracao]; o gate between(t,0,60)
        # prova que a duracao foi usada para montar a regiao.
        assert "between(t,0.000,60.000)" in cmd[idx + 1]

    def test_comando_unico_sempre_enable_based_mesmo_com_env_ligado(self, monkeypatch):
        # A segmentacao saiu do COMANDO UNICO: agora e feita por SUBPROCESSO em
        # `build_grade_plan` (memory-safe). O `build_cinematic_grade_cmd` e
        # SEMPRE enable-based (full-length, fonte de verdade do filtergraph),
        # independente do env — quem o usa como passo do plano nao quer concat.
        monkeypatch.setenv("GRADE_TRIM_SEGMENTATION", "1")
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada", "compartilhada": {"telas": 2}},
                {"inicio": 10, "fim": 20, "modo": "compartilhada", "compartilhada": {"telas": 1}},
            ],
        }
        cmd = build_cinematic_grade_cmd(
            VIDEO, OUTPUT, filtro_vf="vignette", layout_youtube=layout, duracao_seg=20
        )
        fc = " ".join(cmd)
        assert "concat=n=" not in fc  # nunca segmenta no comando unico
        assert "between(t," in fc  # enable-based (overlays encadeados)

    def test_regioes_mesma_config_adjacentes_fundem_e_usam_enable_base(self):
        # Regioes adjacentes de MESMA config fundem em 1 -> enable-based (1 so
        # composite full-length ja e o minimo; segmentar nao ajudaria).
        layout = {
            "modo_padrao": "full",
            "regioes": [
                {"inicio": 0, "fim": 10, "modo": "compartilhada"},
                {"inicio": 10, "fim": 20, "modo": "compartilhada"},
            ],
        }
        cmd = build_cinematic_grade_cmd(
            VIDEO, OUTPUT, filtro_vf="vignette", layout_youtube=layout, duracao_seg=20
        )
        fc = " ".join(cmd)
        assert "concat=n=" not in fc

    def test_com_filtro_vf_tem_vf(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, filtro_vf="vignette")
        assert "-vf" in cmd

    def test_normalize_audio_usa_loudnorm(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, normalize_audio=True)
        assert any("loudnorm" in arg for arg in cmd)

    def test_sem_normalize_usa_aresample(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, normalize_audio=False)
        assert any("aresample" in arg for arg in cmd)

    def test_nao_tem_flag_r(self):
        # -r (forçar FPS) só deve aparecer no encode final
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert "-r" not in cmd

    def test_output_no_fim(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert cmd[-1] == str(OUTPUT)

    def test_layout_filter_recompoe_facecam_e_tela(self):
        filter_str = build_cinematic_grade_layout_filter(
            "vignette",
            [
                {
                    "inicio": 10,
                    "fim": 20,
                    "crop_facecam": {"x": 1, "y": 2, "w": 3, "h": 4},
                    "crop_tela": {"x": 5, "y": 6, "w": 7, "h": 8},
                    "slot_facecam": {"x": 9, "y": 10, "w": 11, "h": 12},
                    "slot_tela": {"x": 13, "y": 14, "w": 15, "h": 16},
                }
            ],
        )

        assert "vignette" in filter_str
        assert "crop=3:4:1:2" in filter_str
        assert "crop=7:8:5:6" in filter_str
        assert "scale=9:12" in filter_str
        assert "scale=14:16" in filter_str
        assert "pad=" not in filter_str
        assert "color=c=0x2a2e35" in filter_str
        assert "color=0xb47850@0.28" in filter_str
        assert "overlay=x=13:y=14" in filter_str
        assert "overlay=x=9:y=10" in filter_str
        assert "between(t,10.000,20.000)" in filter_str

    def test_layout_filter_com_uma_tela_nao_recompoe_facecam(self):
        filter_str = build_cinematic_grade_layout_filter(
            "vignette",
            [
                {
                    "inicio": 10,
                    "fim": 20,
                    "telas": 1,
                    "crop_facecam": {"x": 1, "y": 2, "w": 3, "h": 4},
                    "crop_tela": {"x": 5, "y": 6, "w": 7, "h": 8},
                    "slot_facecam": {"x": 9, "y": 10, "w": 11, "h": 12},
                    "slot_tela": {"x": 13, "y": 14, "w": 15, "h": 16},
                }
            ],
        )

        assert "vignette" in filter_str
        assert "crop=7:8:5:6" in filter_str
        assert "crop=3:4:1:2" not in filter_str
        assert "overlay=x=13:y=14" in filter_str
        assert "overlay=x=9:y=10" not in filter_str
        assert "between(t,10.000,20.000)" in filter_str

    def test_layout_filter_com_bg_input_usa_png_e_nao_drawbox(self):
        filter_str = build_cinematic_grade_layout_filter(
            None,
            [
                {
                    "inicio": 0,
                    "fim": 5,
                    "crop_facecam": {"x": 1, "y": 2, "w": 3, "h": 4},
                    "crop_tela": {"x": 5, "y": 6, "w": 7, "h": 8},
                    "slot_facecam": {"x": 9, "y": 10, "w": 11, "h": 12},
                    "slot_tela": {"x": 13, "y": 14, "w": 15, "h": 16},
                }
            ],
            bg_input="1:v",
        )

        assert "[1:v]scale=1920:1080" in filter_str
        assert "[bg0]" in filter_str
        assert "color=c=0x2a2e35" not in filter_str
        assert "color=0xb47850" not in filter_str

    def test_layout_filter_bg_input_duas_regioes_faz_split(self):
        regiao = {
            "crop_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "crop_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
            "slot_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "slot_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
        }
        regioes = [
            {"inicio": 0, "fim": 5, **regiao},
            {"inicio": 10, "fim": 15, **regiao},
        ]
        filter_str = build_cinematic_grade_layout_filter(None, regioes, bg_input="1:v")
        assert "split=2[bg0][bg1]" in filter_str

    def test_cmd_com_bg_png_adiciona_loop_input(self, monkeypatch):
        # Isola do cache em disco: sem palco, usa o fundo-embaixo.
        # F-048: o resolver usado pelo cmd é o _para_config (por região).
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config",
            lambda compartilhada, fundo, placa: None,
        )
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_bg_png",
            lambda layout: Path("fake") / "hud-forte.png",
        )
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "compartilhada", "regioes": []},
            duracao_seg=30,
        )

        assert "-loop" in cmd
        assert "[1:v]scale=1920:1080" in " ".join(cmd)

    def test_cmd_sem_bg_png_usa_drawbox(self, monkeypatch):
        # Sem palco e sem fundo-PNG → fallback procedural drawbox.
        # F-048: o resolver usado pelo cmd é o _para_config (por região).
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config",
            lambda compartilhada, fundo, placa: None,
        )
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_bg_png",
            lambda layout: None,
        )
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "compartilhada", "regioes": []},
            duracao_seg=30,
        )

        assert "-loop" not in cmd
        assert "color=c=0x2a2e35" in " ".join(cmd)

    def test_layout_filter_com_fg_input_poe_palco_por_cima(self):
        filter_str = build_cinematic_grade_layout_filter(
            None,
            [
                {
                    "inicio": 0,
                    "fim": 5,
                    "crop_facecam": {"x": 1, "y": 2, "w": 3, "h": 4},
                    "crop_tela": {"x": 5, "y": 6, "w": 7, "h": 8},
                    "slot_facecam": {"x": 9, "y": 10, "w": 11, "h": 12},
                    "slot_tela": {"x": 13, "y": 14, "w": 15, "h": 16},
                }
            ],
            fg_input="1:v",
        )

        assert "[1:v]scale=1920:1080" in filter_str
        assert "[fg0]" in filter_str
        # base preta sob os videos (palco opaco cobre o resto), nao drawbox
        assert "color=c=black:s=1920x1080" in filter_str
        assert "color=c=0x2a2e35" not in filter_str
        # palco (frente) sobreposto aos videos antes de compor na base
        assert "[shared0][fg0]overlay=x=0:y=0:format=auto[composed0]" in filter_str
        assert "between(t,0.000,5.000)" in filter_str

    def test_layout_filter_fg_tem_prioridade_sobre_bg(self):
        regiao = {
            "inicio": 0,
            "fim": 5,
            "crop_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "crop_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
            "slot_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "slot_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
        }
        filter_str = build_cinematic_grade_layout_filter(
            None, [regiao], bg_input="1:v", fg_input="1:v"
        )

        assert "[fg0]" in filter_str
        assert "[composed0]" in filter_str
        assert "color=c=black" in filter_str

    def test_layout_filter_fg_inputs_per_region_split_para_input_compartilhado(self):
        # F-048: duas regioes usando o MESMO input PNG -> split=2 com labels
        # [fg0][fg1].
        regiao = {
            "crop_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "crop_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
            "slot_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "slot_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
        }
        regioes = [
            {"inicio": 0, "fim": 5, **regiao},
            {"inicio": 10, "fim": 15, **regiao},
        ]
        filter_str = build_cinematic_grade_layout_filter(
            None, regioes, fg_inputs_per_region=["1:v", "1:v"]
        )
        assert "[1:v]scale=1920:1080,setsar=1,format=rgba,split=2[fg0][fg1]" in filter_str

    def test_layout_filter_fg_inputs_per_region_separa_inputs_distintos(self):
        # F-048: cada regiao com seu input PNG -> cada um gera scale propria
        # com label [fgN].
        regiao = {
            "crop_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "crop_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
            "slot_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "slot_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
        }
        regioes = [
            {"inicio": 0, "fim": 5, **regiao},
            {"inicio": 10, "fim": 15, **regiao},
        ]
        filter_str = build_cinematic_grade_layout_filter(
            None, regioes, fg_inputs_per_region=["1:v", "2:v"]
        )
        assert "[1:v]scale=1920:1080,setsar=1,format=rgba[fg0]" in filter_str
        assert "[2:v]scale=1920:1080,setsar=1,format=rgba[fg1]" in filter_str
        # composição usa cada fgN próprio
        assert "[shared0][fg0]" in filter_str
        assert "[shared1][fg1]" in filter_str

    def test_cmd_com_overrides_distintos_dedupe_inputs(self, monkeypatch):
        # F-048: duas regioes — uma com override, outra sem — geram inputs
        # PNG distintos no FFmpeg.
        from app.domain.youtube_layout import palco_cache_key_para_config

        chamadas: list[dict] = []

        def fake_resolver(compartilhada, fundo, placa):
            chamadas.append(dict(compartilhada))
            key = palco_cache_key_para_config(compartilhada, fundo=fundo, placa=placa)
            return Path("fake") / f"{key}.png"

        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config",
            fake_resolver,
        )

        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={
                "modo_padrao": "full",
                "compartilhada": {"telas": 2},
                "regioes": [
                    {"inicio": 0, "fim": 10, "modo": "compartilhada"},
                    {
                        "inicio": 20,
                        "fim": 30,
                        "modo": "compartilhada",
                        "compartilhada": {"telas": 1},
                    },
                ],
            },
            duracao_seg=60,
        )
        joined = " ".join(cmd)

        # Dois inputs PNG distintos (input 1 e input 2 alem do video).
        assert cmd.count("-loop") == 2
        # Filter usa fg0 (input 1) e fg1 (input 2) cada um para sua regiao.
        assert "[1:v]scale=1920:1080,setsar=1,format=rgba[fg0]" in joined
        assert "[2:v]scale=1920:1080,setsar=1,format=rgba[fg1]" in joined

    def test_layout_filter_fg_input_duas_regioes_faz_split(self):
        regiao = {
            "crop_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "crop_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
            "slot_facecam": {"x": 0, "y": 0, "w": 10, "h": 10},
            "slot_tela": {"x": 0, "y": 0, "w": 20, "h": 20},
        }
        regioes = [
            {"inicio": 0, "fim": 5, **regiao},
            {"inicio": 10, "fim": 15, **regiao},
        ]
        filter_str = build_cinematic_grade_layout_filter(None, regioes, fg_input="1:v")
        assert "split=2[fg0][fg1]" in filter_str

    def test_cmd_com_fg_png_adiciona_loop_e_ignora_bg(self, monkeypatch):
        # F-048: o cmd resolve UM PNG por regiao via _resolve_shared_fg_png_para_config.
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config",
            lambda compartilhada, fundo, placa: Path("fake") / "palco.png",
        )
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_bg_png",
            lambda layout: Path("fake") / "hud-forte.png",
        )
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "compartilhada", "regioes": []},
            duracao_seg=30,
        )
        joined = " ".join(cmd)

        assert "-loop" in cmd
        assert "palco.png" in joined
        # palco dispensa o fundo-embaixo
        assert "hud-forte.png" not in joined
        assert "color=c=black:s=1920x1080" in joined
        assert "[composed0]" in joined


class TestNormalizacaoCanvas1080p:
    """REGRESSAO I-036: crops/slots do layout YouTube vivem num canvas
    1920x1080 com o video esticado (paridade com CenasRemotionPreview).

    Uma live 720p rendia upload_ready todo desconfigurado: o FFmpeg aplicava
    crops 1080p direto na fonte 720p (clampando x/y para regioes erradas) e
    compunha palco/overlays 1080p sobre base 720p (saida truncada). A fonte
    DEVE ser normalizada para o canvas antes de filtro, crops e overlays.
    """

    REGIAO = {
        "inicio": 0,
        "fim": 5,
        "crop_facecam": {"x": 27, "y": 271, "w": 643, "h": 460},
        "crop_tela": {"x": 716, "y": 151, "w": 1107, "h": 619},
        "slot_facecam": {"x": 124, "y": 645, "w": 386, "h": 276},
        "slot_tela": {"x": 570, "y": 210, "w": 1273, "h": 712},
    }

    def test_layout_filter_normaliza_fonte_antes_dos_crops(self):
        filter_str = build_cinematic_grade_layout_filter("vignette", [self.REGIAO])

        assert filter_str.startswith("[0:v]scale=1920:1080,setsar=1,")
        # A normalizacao tem que vir ANTES de qualquer crop do layout.
        assert filter_str.index("scale=1920:1080") < filter_str.index("crop=")

    def test_layout_filter_normaliza_antes_do_filtro_visual(self):
        # Filtro (curves/drawbox) roda no canvas 1080p — identico ao
        # comportamento de uma fonte nativa 1080p.
        filter_str = build_cinematic_grade_layout_filter("vignette", [self.REGIAO])
        assert filter_str.index("scale=1920:1080") < filter_str.index("vignette")

    def test_layout_filter_sem_regioes_tambem_normaliza(self):
        filter_str = build_cinematic_grade_layout_filter("vignette", [])
        assert "scale=1920:1080,setsar=1" in filter_str
        assert "vignette" in filter_str

    def test_cmd_com_filtro_vf_normaliza_no_vf(self):
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT, filtro_vf="vignette")
        idx = cmd.index("-vf")
        # Fase 3: o -vf pode comecar com o prefixo hwdownload (QSV decode), mas
        # a normalizacao de canvas + filtro continuam ao final.
        assert cmd[idx + 1].endswith("scale=1920:1080,setsar=1,vignette")

    def test_overlay_filter_normaliza_base_para_canvas(self):
        # Overlays Remotion sao sempre 1920x1080; base 720p truncava os cards.
        ov = [{"index": 1, "start_sec": 0.0, "end_sec": 5.0}]
        result = build_overlay_filter_string(ov)
        assert "[0:v]scale=1920:1080,setsar=1,format=rgba[v_base]" in result

    def test_compose_and_encode_normaliza_base(self):
        cmd = build_compose_and_encode_cmd(
            VIDEO,
            [Path("ov1.webm")],
            [{"start_sec": 0.0, "end_sec": 5.0}],
            OUTPUT,
        )
        idx = cmd.index("-filter_complex")
        assert "scale=1920:1080,setsar=1" in cmd[idx + 1]


class TestFfmpegThreadCaps:
    """D-065: tetos de threads p/ conter a RAM do ffmpeg (4-6 GB no compose).

    O encode roda na iGPU (QSV); limitar threads de decode/filtro corta os
    buffers RGBA duplicados por núcleo sem custar tempo relevante.
    """

    OV = [Path("ov1.mov"), Path("ov2.mov")]
    TIM = [{"start_sec": 10.0, "end_sec": 15.0}, {"start_sec": 30.0, "end_sec": 35.0}]

    def test_compose_limita_threads_de_decode_e_filtro(self):
        cmd = build_compose_and_encode_cmd(VIDEO, self.OV, self.TIM, OUTPUT)
        assert "-filter_complex_threads" in cmd
        assert "-threads" in cmd

    def test_compose_cada_overlay_tem_teto_de_threads(self):
        cmd = build_compose_and_encode_cmd(VIDEO, self.OV, self.TIM, OUTPUT)
        # Um -threads para o vídeo-base + um por overlay.
        assert cmd.count("-threads") >= 1 + len(self.OV)

    def test_compose_respeita_env_override(self, monkeypatch):
        monkeypatch.setenv("FFMPEG_FILTER_THREADS", "1")
        monkeypatch.setenv("FFMPEG_DECODE_THREADS", "3")
        cmd = build_compose_and_encode_cmd(VIDEO, self.OV, self.TIM, OUTPUT)
        fct = cmd.index("-filter_complex_threads")
        assert cmd[fct + 1] == "1"
        # Pelo menos um -threads com o valor de decode configurado.
        thread_vals = [cmd[i + 1] for i, v in enumerate(cmd) if v == "-threads"]
        assert "3" in thread_vals

    def test_compose_env_invalida_cai_no_default(self, monkeypatch):
        monkeypatch.setenv("FFMPEG_FILTER_THREADS", "abc")
        cmd = build_compose_and_encode_cmd(VIDEO, self.OV, self.TIM, OUTPUT)
        fct = cmd.index("-filter_complex_threads")
        # Default do compose subiu de 2 -> 6 (2 de 12 núcleos estrangulava o
        # composite; o cap agressivo era band-aid do bug de RAM já corrigido).
        assert cmd[fct + 1] == "6"

    def test_compose_sem_overlays_nao_tem_filter_complex_threads(self):
        # Sem filtergraph não faz sentido (e evita warning do ffmpeg).
        cmd = build_compose_and_encode_cmd(VIDEO, [], [], OUTPUT)
        assert "-filter_complex_threads" not in cmd

    def test_grade_com_layout_limita_filtro(self):
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={
                "modo_padrao": "full",
                "regioes": [{"inicio": 10, "fim": 20, "modo": "compartilhada"}],
            },
            duracao_seg=60,
        )
        assert "-filter_complex_threads" in cmd

    def test_grade_qsv_usa_async_depth_1(self):
        # Limita surfaces QSV em voo -> menor pico de RAM/GPU (D-065).
        cmd = build_cinematic_grade_cmd(VIDEO, OUTPUT)
        assert "-async_depth" in cmd
        assert cmd[cmd.index("-async_depth") + 1] == "1"

    def test_compose_qsv_usa_async_depth_1(self):
        cmd = build_compose_and_encode_cmd(VIDEO, self.OV, self.TIM, OUTPUT)
        assert "-async_depth" in cmd
        assert cmd[cmd.index("-async_depth") + 1] == "1"

    def test_grade_png_palco_decodifica_com_uma_thread(self, monkeypatch):
        # PNG do palco é imagem estática: 1 thread basta e evita o pool de
        # frame buffers multi-thread que estourava (`png thread_get_buffer`).
        monkeypatch.setattr(
            "app.domain.ffmpeg_commands._resolve_shared_fg_png_para_config",
            lambda compartilhada, fundo, placa: Path("fake") / "palco.png",
        )
        cmd = build_cinematic_grade_cmd(
            VIDEO,
            OUTPUT,
            layout_youtube={"modo_padrao": "compartilhada", "regioes": []},
            duracao_seg=30,
        )
        # Todo input -loop de PNG vem com -threads 1 antes do -i.
        loop_idx = cmd.index("-loop")
        trecho = cmd[loop_idx : loop_idx + 6]
        assert "-threads" in trecho
        assert trecho[trecho.index("-threads") + 1] == "1"


class TestBuildOverlayFilterString:
    def test_lista_vazia_retorna_string_vazia(self):
        assert build_overlay_filter_string([]) == ""

    def test_um_overlay_tem_format_rgba(self):
        ov = [{"index": 1, "start_sec": 0.0, "end_sec": 5.0}]
        result = build_overlay_filter_string(ov)
        assert "format=rgba" in result

    def test_contem_enable_between(self):
        ov = [{"index": 1, "start_sec": 10.0, "end_sec": 15.0}]
        result = build_overlay_filter_string(ov)
        assert "between(t," in result

    def test_formato_final_nv12(self):
        ov = [{"index": 1, "start_sec": 0.0, "end_sec": 5.0}]
        result = build_overlay_filter_string(ov)
        assert "format=nv12" in result

    def test_saida_vout(self):
        ov = [{"index": 1, "start_sec": 0.0, "end_sec": 5.0}]
        result = build_overlay_filter_string(ov)
        assert "[vout]" in result

    def test_dois_overlays_encadeados(self):
        ovs = [
            {"index": 1, "start_sec": 0.0, "end_sec": 5.0},
            {"index": 2, "start_sec": 10.0, "end_sec": 15.0},
        ]
        result = build_overlay_filter_string(ovs)
        assert "[v1]" in result
        assert "[v2]" in result


class TestBuildOverlayCompositionCmd:
    def test_sem_overlays_usa_copy(self):
        cmd = build_overlay_composition_cmd(VIDEO, [], [], OUTPUT)
        assert _has(cmd, "-c", "copy")

    def test_com_overlay_tem_filter_complex(self):
        cmd = build_overlay_composition_cmd(
            VIDEO,
            [Path("ov1.webm")],
            [{"start_sec": 0.0, "end_sec": 5.0}],
            OUTPUT,
        )
        assert "-filter_complex" in cmd or "-filter_complex_script" in cmd

    def test_inputs_incluem_todos_overlays(self):
        ovs = [Path("ov1.webm"), Path("ov2.webm")]
        cmd = build_overlay_composition_cmd(
            VIDEO,
            ovs,
            [
                {"start_sec": 0.0, "end_sec": 5.0},
                {"start_sec": 10.0, "end_sec": 15.0},
            ],
            OUTPUT,
        )
        assert "ov1.webm" in cmd
        assert "ov2.webm" in cmd

    def test_webm_forca_decoder_vp9_com_alpha(self):
        cmd = build_overlay_composition_cmd(
            VIDEO,
            [Path("ov1.webm")],
            [{"start_sec": 0.0, "end_sec": 5.0}],
            OUTPUT,
        )
        input_idx = cmd.index("ov1.webm")
        assert cmd[input_idx - 3 : input_idx] == ["-c:v", "libvpx-vp9", "-i"]

    def test_comeca_com_ffmpeg(self):
        cmd = build_overlay_composition_cmd(VIDEO, [], [], OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_output_no_fim(self):
        cmd = build_overlay_composition_cmd(VIDEO, [], [], OUTPUT)
        assert cmd[-1] == str(OUTPUT)


class TestBuildFinalEncodeCmd:
    def test_comeca_com_ffmpeg(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert cmd[0] == "ffmpeg"

    def test_usa_h264_qsv(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert "h264_qsv" in cmd

    def test_tem_flag_r_30(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT, fps=30)
        assert "-r" in cmd
        idx = cmd.index("-r")
        assert cmd[idx + 1] == "30"

    def test_fps_customizavel(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT, fps=60)
        idx = cmd.index("-r")
        assert cmd[idx + 1] == "60"

    def test_bitrate_customizavel(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT, bitrate="4M")
        assert "4M" in cmd

    def test_maxrate_presente(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert "-maxrate" in cmd

    def test_faststart(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert "+faststart" in cmd

    def test_output_no_fim(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert cmd[-1] == str(OUTPUT)

    def test_normaliza_audio_por_padrao(self):
        """LUFS-14 é o target YouTube/podcast — deve vir ligado por default."""
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        assert "-af" in cmd
        idx = cmd.index("-af")
        assert "loudnorm" in cmd[idx + 1]
        assert "I=-14" in cmd[idx + 1]
        assert "TP=-1.0" in cmd[idx + 1]

    def test_normalize_audio_desligavel(self):
        cmd = build_final_encode_cmd(VIDEO, OUTPUT, normalize_audio=False)
        # Quando desligado, nenhuma flag -af de loudnorm deve aparecer
        if "-af" in cmd:
            idx = cmd.index("-af")
            assert "loudnorm" not in cmd[idx + 1]

    def test_loudnorm_antes_do_output(self):
        """A flag -af tem que vir antes do path de output, senão o FFmpeg
        interpreta como input adicional e quebra."""
        cmd = build_final_encode_cmd(VIDEO, OUTPUT)
        af_idx = cmd.index("-af")
        assert af_idx < len(cmd) - 1
        assert cmd[-1] == str(OUTPUT)


class TestBuildComposeAndEncodeCmd:
    """Pipeline atual: composição de overlays + encode final em UMA passada."""

    def _cmd(self, *, overlays=None, timings=None, **kwargs):
        return build_compose_and_encode_cmd(
            VIDEO,
            overlays or [],
            timings or [],
            OUTPUT,
            **kwargs,
        )

    def test_comeca_com_ffmpeg(self):
        cmd = self._cmd()
        assert cmd[0] == "ffmpeg"

    def test_output_no_fim(self):
        cmd = self._cmd()
        assert cmd[-1] == str(OUTPUT)

    def test_usa_h264_qsv(self):
        cmd = self._cmd()
        assert "h264_qsv" in cmd

    def test_aplica_fps_30(self):
        cmd = self._cmd()
        idx = cmd.index("-r")
        assert cmd[idx + 1] == "30"

    def test_bitrate_padrao_8M(self):
        cmd = self._cmd()
        assert "8M" in cmd
        assert "+faststart" in cmd

    def test_fps_customizavel(self):
        cmd = self._cmd(fps=60)
        idx = cmd.index("-r")
        assert cmd[idx + 1] == "60"

    def test_loudnorm_ligado_por_padrao(self):
        cmd = self._cmd()
        idx = cmd.index("-af")
        assert "loudnorm" in cmd[idx + 1]
        assert "I=-14" in cmd[idx + 1]

    def test_loudnorm_pode_ser_desligado(self):
        cmd = self._cmd(normalize_audio=False)
        if "-af" in cmd:
            af_idx = cmd.index("-af")
            assert "loudnorm" not in cmd[af_idx + 1]

    def test_sem_overlays_nao_tem_filter_complex(self):
        cmd = self._cmd()
        assert "-filter_complex" not in cmd
        assert "-filter_complex_script" not in cmd
        # Deve mapear video direto do input 0
        assert "0:v" in cmd

    def test_com_overlays_tem_filter_complex(self):
        cmd = self._cmd(
            overlays=[Path("ov1.mov"), Path("ov2.mov")],
            timings=[{"start_sec": 10.0, "end_sec": 15.0}, {"start_sec": 30.0, "end_sec": 35.0}],
        )
        assert "-filter_complex" in cmd or "-filter_complex_script" in cmd

    def test_com_overlays_inputs_incluem_todos(self):
        cmd = self._cmd(
            overlays=[Path("ov1.mov"), Path("ov2.mov")],
            timings=[{"start_sec": 10.0, "end_sec": 15.0}, {"start_sec": 30.0, "end_sec": 35.0}],
        )
        assert "ov1.mov" in cmd
        assert "ov2.mov" in cmd

    def test_webm_forca_decoder_vp9_com_alpha(self):
        cmd = self._cmd(
            overlays=[Path("ov1.webm")],
            timings=[{"start_sec": 10.0, "end_sec": 15.0}],
        )
        input_idx = cmd.index("ov1.webm")
        assert cmd[input_idx - 3 : input_idx] == ["-c:v", "libvpx-vp9", "-i"]

    def test_mov_nao_forca_decoder_vp9(self):
        cmd = self._cmd(
            overlays=[Path("ov1.mov")],
            timings=[{"start_sec": 10.0, "end_sec": 15.0}],
        )
        input_idx = cmd.index("ov1.mov")
        assert cmd[input_idx - 1] == "-i"

    def test_com_overlays_mapeia_vout(self):
        cmd = self._cmd(
            overlays=[Path("ov1.mov")],
            timings=[{"start_sec": 10.0, "end_sec": 15.0}],
        )
        # output do filter é [vout]; audio puxa de 0:a?
        map_idxs = [i for i, v in enumerate(cmd) if v == "-map"]
        mapeamentos = [cmd[i + 1] for i in map_idxs]
        assert "[vout]" in mapeamentos
        assert "0:a?" in mapeamentos

    def test_audio_puxa_do_input_base_nao_dos_overlays(self):
        """Áudio é da fonte de vídeo (input 0), nunca dos MOVs de overlay
        (que são silenciosos ou irrelevantes)."""
        cmd = self._cmd(
            overlays=[Path("ov1.mov")],
            timings=[{"start_sec": 0.0, "end_sec": 5.0}],
        )
        map_idxs = [i for i, v in enumerate(cmd) if v == "-map"]
        mapeamentos = [cmd[i + 1] for i in map_idxs]
        # Não pode haver mapping de 1:a, 2:a etc.
        for m in mapeamentos:
            assert not m.startswith("1:a")
            assert not m.startswith("2:a")

    def test_movflags_faststart_sempre_presente(self):
        cmd_sem = self._cmd()
        cmd_com = self._cmd(
            overlays=[Path("ov1.mov")],
            timings=[{"start_sec": 0.0, "end_sec": 5.0}],
        )
        assert "+faststart" in cmd_sem
        assert "+faststart" in cmd_com
