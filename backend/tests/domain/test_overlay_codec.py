"""Testes para o domain do codec de overlay."""

from pathlib import Path

import pytest
from app.domain.ffmpeg_commands import _build_overlay_input_args
from app.domain.overlay_codec import (
    OverlayCodec,
    OverlayCodecProfile,
    overlay_codec_profile,
)


class TestOverlayCodecEnum:
    def test_vp9_existe(self):
        assert OverlayCodec.VP9.value == "vp9"

    def test_prores_existe(self):
        assert OverlayCodec.PRORES_4444.value == "prores_4444"

    def test_apenas_dois_codecs_definidos(self):
        # Garante que adicionar codec novo exige atualizar testes/configs
        assert set(OverlayCodec) == {OverlayCodec.VP9, OverlayCodec.PRORES_4444}


class TestProfileVP9:
    @pytest.fixture
    def perfil(self) -> OverlayCodecProfile:
        return overlay_codec_profile(OverlayCodec.VP9)

    def test_extensao_webm(self, perfil):
        assert perfil.file_extension == ".webm"

    def test_args_incluem_codec_vp9(self, perfil):
        assert "--codec=vp9" in perfil.remotion_args

    def test_args_usam_yuva420p_para_alpha(self, perfil):
        # yuva420p garante canal alpha sem inflar o arquivo com 4:4:4
        assert "--pixel-format=yuva420p" in perfil.remotion_args

    def test_image_format_png_para_input_dos_frames(self, perfil):
        assert "--image-format=png" in perfil.remotion_args


class TestProfileProRes4444:
    @pytest.fixture
    def perfil(self) -> OverlayCodecProfile:
        return overlay_codec_profile(OverlayCodec.PRORES_4444)

    def test_extensao_mov(self, perfil):
        assert perfil.file_extension == ".mov"

    def test_args_codec_prores(self, perfil):
        assert "--codec=prores" in perfil.remotion_args

    def test_args_profile_4444(self, perfil):
        assert "--prores-profile=4444" in perfil.remotion_args

    def test_args_pixel_format_alpha_10bit(self, perfil):
        assert "--pixel-format=yuva444p10le" in perfil.remotion_args


class TestProfileImutabilidade:
    def test_perfil_e_frozen(self):
        perfil = overlay_codec_profile(OverlayCodec.VP9)
        with pytest.raises(Exception):
            perfil.file_extension = ".mov"  # type: ignore[misc]

    def test_remotion_args_e_tupla_imutavel(self):
        perfil = overlay_codec_profile(OverlayCodec.VP9)
        assert isinstance(perfil.remotion_args, tuple)


class TestPerfisDistintos:
    def test_extensoes_diferentes(self):
        assert (
            overlay_codec_profile(OverlayCodec.VP9).file_extension
            != overlay_codec_profile(OverlayCodec.PRORES_4444).file_extension
        )

    def test_args_diferentes(self):
        a = overlay_codec_profile(OverlayCodec.VP9).remotion_args
        b = overlay_codec_profile(OverlayCodec.PRORES_4444).remotion_args
        assert a != b


class TestCadeiaCodecAteDecodeFFmpeg:
    """Contrato cross-layer: a extensão que o Remotion produz (por codec) tem
    que casar com o decoder que o FFmpeg usa na composição. É exatamente a
    cadeia onde 'trocar o codec quebra o overlay' se algo estiver desalinhado.
    """

    def test_vp9_webm_decodifica_com_libvpx_vp9(self):
        # VP9+alpha em .webm SÓ preserva o canal alpha com o decoder explícito
        # libvpx-vp9; sem ele o overlay sai opaco. Este é o detalhe historico.
        perfil = overlay_codec_profile(OverlayCodec.VP9)
        assert perfil.file_extension == ".webm"
        args = _build_overlay_input_args(Path(f"chunk_001{perfil.file_extension}"))
        assert "-c:v" in args and "libvpx-vp9" in args
        assert args[-1].endswith(".webm")

    def test_prores_mov_decodifica_com_input_simples(self):
        # ProRes 4444 em .mov: o FFmpeg auto-detecta e decodifica o alpha de
        # forma robusta sem decoder especial — o `-i` vem logo antes do arquivo
        # (pode haver um teto de threads de decode prefixado, D-065).
        perfil = overlay_codec_profile(OverlayCodec.PRORES_4444)
        assert perfil.file_extension == ".mov"
        args = _build_overlay_input_args(Path(f"chunk_001{perfil.file_extension}"))
        assert "libvpx-vp9" not in args
        assert "-c:v" not in args
        assert args[args.index("-i") + 1].endswith(".mov")
        assert args[-1].endswith(".mov")

    @pytest.mark.parametrize("codec", list(OverlayCodec))
    def test_todo_codec_produz_input_args_terminando_no_arquivo(self, codec):
        # Garante que QUALQUER codec do enum gera args de input válidos
        # (não-vazios, terminando no caminho) — pega regressão ao adicionar codec.
        perfil = overlay_codec_profile(codec)
        args = _build_overlay_input_args(Path(f"ov{perfil.file_extension}"))
        assert args
        assert args[-1].endswith(perfil.file_extension)
