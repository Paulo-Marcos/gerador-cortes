"""D-1015: a regra do boletim técnico — o que merece aviso, sem FFmpeg."""

from __future__ import annotations

from app.domain.corte import boletim_tecnico as b

_RESUMO = """
[Parsed_ebur128_0 @ 000001] t: 12.3  TARGET:-23 LUFS  M: -14.0 S: -14.1  I: -13.9 LUFS  LRA: 4.0 LU
[Parsed_ebur128_0 @ 000001] Summary:

  Integrated loudness:
    I:         -15.4 LUFS
    Threshold: -25.6 LUFS

  Loudness range:
    LRA:         5.2 LU
    Threshold: -35.8 LUFS
    LRA low:   -19.0 LUFS
    LRA high:  -13.8 LUFS

  True peak:
    Peak:       -0.4 dBFS
"""


def test_le_o_resumo_e_ignora_o_parcial():
    # Pedido: LUFS, pico verdadeiro e LRA vêm do bloco Summary, não da última linha parcial.
    assert b.ler_resumo_ebur128(_RESUMO) == b.Volume(-15.4, -0.4, 5.2)


def test_sem_resumo_ou_mudo_nao_inventa_numero():
    assert b.ler_resumo_ebur128("nada aqui") is None
    assert b.ler_resumo_ebur128(_RESUMO.replace("-15.4", "-inf")) is None


def test_avisa_volume_fora_da_referencia_e_pico_alto_em_portugues():
    avisos = b.avisos_de_volume(b.Volume(-15.4, -0.4, 5.2))
    assert any("mais baixo" in a and "-14" in a for a in avisos)
    assert any("-0.4 dBTP" in a for a in avisos)


def test_dentro_da_referencia_nao_avisa():
    assert b.avisos_de_volume(b.Volume(-13.2, -1.5, 6.0)) == []
    assert b.avisos_de_volume(b.Volume(-14.9, -1.0, 6.0)) == []


def test_parada_so_conta_a_partir_de_033_s():
    fps = 30.0
    curto = [False] + [True] * 9 + [False] * 3  # 0,30 s: frame duplicado normal
    longo = [False] * 5 + [True] * 10 + [False] * 3  # 0,333 s: travada
    assert b.paradas_de_quadros(curto, fps) == []
    assert b.paradas_de_quadros(longo, fps) == [b.Parada(round(4 / 30, 3), round(10 / 30, 3))]


def test_parada_no_fim_do_video_e_fechada():
    paradas = b.paradas_de_quadros([False] + [True] * 30, 30.0)
    assert len(paradas) == 1 and paradas[0].duracao_seg == 1.0


def test_origem_da_parada_live_render_ou_nao_verificada():
    parada = b.Parada(10.0, 1.0)
    assert b.origem_da_parada(parada, [b.Parada(9.9, 1.2)]) == b.ORIGEM_LIVE
    assert b.origem_da_parada(parada, [b.Parada(50.0, 1.0)]) == b.ORIGEM_RENDER
    assert b.origem_da_parada(parada, []) == b.ORIGEM_RENDER
    assert b.origem_da_parada(parada, None) == b.ORIGEM_NAO_VERIFICADA


def test_emendas_sao_as_fronteiras_dos_trechos_com_a_deriva_espalhada():
    assert b.instantes_das_emendas([30.0, 50.0, 20.0], 100.0) == [30.0, 80.0]
    # Vídeo 1% mais longo que a soma: cada fronteira anda junto, proporcional.
    assert b.instantes_das_emendas([30.0, 50.0, 20.0], 101.0) == [30.3, 80.8]
    assert b.instantes_das_emendas([100.0], 100.0) == []


def test_emenda_so_e_suspeita_com_som_dos_dois_lados_e_degrau_acima_do_p99():
    com_estalo = b.julgar_emenda(5.0, -20.0, -22.0, degrau=0.2, p99_da_fala=0.05)
    assert com_estalo.com_som_dos_dois_lados and com_estalo.acima_do_p99
    suave = b.julgar_emenda(5.0, -20.0, -22.0, degrau=0.01, p99_da_fala=0.05)
    assert suave.com_som_dos_dois_lados and not suave.acima_do_p99
    # Silêncio de um lado: degrau grande não conta, e nem é reportado.
    no_silencio = b.julgar_emenda(5.0, -20.0, -60.0, degrau=0.5, p99_da_fala=0.05)
    assert not no_silencio.com_som_dos_dois_lados and no_silencio.degrau is None
    assert not no_silencio.acima_do_p99


def test_resumo_das_emendas_conta_cada_grupo():
    emendas = [
        b.julgar_emenda(1.0, -20, -20, 0.2, 0.05),
        b.julgar_emenda(2.0, -20, -20, 0.01, 0.05),
        b.julgar_emenda(3.0, -20, -70, 0.9, 0.05),
    ]
    assert b.resumir_emendas(emendas) == b.ResumoDasEmendas(3, 2, 1)
