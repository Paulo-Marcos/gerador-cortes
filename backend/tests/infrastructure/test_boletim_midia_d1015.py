"""D-1015: as medições do boletim contra mídia sintética gerada pelo próprio FFmpeg."""

from __future__ import annotations

import shutil
import subprocess

import numpy as np
import pytest
from app.domain.corte import boletim_tecnico as regra
from app.infrastructure import boletim_midia as m

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="precisa do ffmpeg"),
]


def _ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True, timeout=60)


@pytest.fixture(scope="module")
def video_com_parada(tmp_path_factory):
    """4 s, 30 fps; dos quadros 45 a 89 a imagem repete o 44 (parada de 1,5 s)."""
    saida = tmp_path_factory.mktemp("midia") / "v.mp4"
    _ffmpeg(
        "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
        "-filter_complex",
        "[0:v]trim=end_frame=45,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop=45[a];"
        "[0:v]trim=start_frame=45,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-map", "1:a", "-t", "4",
        "-c:v", "libx264", "-c:a", "aac", str(saida),
    )  # fmt: skip
    return saida


def test_mede_volume_integrado_pico_e_lra(video_com_parada):
    volume = m.medir_volume(video_com_parada, timeout=60)
    assert -40 < volume.integrado_lufs < -5
    assert volume.pico_dbtp < 0
    assert volume.lra_lu >= 0


def test_acha_a_parada_de_imagem_e_so_ela(video_com_parada):
    fps, repete = m.medir_quadros_parados(video_com_parada, timeout=60)
    paradas = regra.paradas_de_quadros(repete, fps)
    assert fps == 30
    assert len(paradas) == 1
    assert paradas[0].inicio_seg == pytest.approx(44 / 30, abs=0.1)
    assert paradas[0].duracao_seg == pytest.approx(1.5, abs=0.1)


def test_arquivo_sem_audio_levanta_erro_de_medicao(tmp_path):
    mudo = tmp_path / "mudo.mp4"
    _ffmpeg("-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30", "-t", "1", str(mudo))
    with pytest.raises(m.ErroDeMedicao):
        m.medir_volume(mudo, timeout=60)


def test_timeout_interrompe_a_medicao(video_com_parada):
    with pytest.raises(m.ErroDeMedicao, match="passou de"):
        m.medir_quadros_parados(video_com_parada, timeout=0.001)


def _seno(segundos: float, fase: float = 0.0) -> np.ndarray:
    t = np.arange(int(segundos * m.TAXA_DO_AUDIO)) / m.TAXA_DO_AUDIO
    return (np.sin(2 * np.pi * 200 * t + fase) * 12000).astype(np.int16)


def test_emenda_com_salto_de_fase_tem_degrau_acima_do_p99_da_fala():
    # Dois trechos de "fala" sem continuidade de fase: a costura é um salto seco.
    amostras = np.concatenate([_seno(1.0), _seno(1.0, fase=np.pi / 2)])
    p99 = m.p99_do_degrau_da_fala(amostras)
    ((instante, antes, depois, degrau),) = m.medir_emendas(amostras, [1.0])
    emenda = regra.julgar_emenda(instante, antes, depois, degrau, p99)
    assert emenda.com_som_dos_dois_lados and emenda.acima_do_p99


def test_emenda_continua_nao_passa_do_p99():
    amostras = _seno(2.0)
    p99 = m.p99_do_degrau_da_fala(amostras)
    ((instante, antes, depois, degrau),) = m.medir_emendas(amostras, [1.0])
    assert not regra.julgar_emenda(instante, antes, depois, degrau, p99).acima_do_p99


def test_emenda_em_silencio_nao_tem_som_dos_dois_lados():
    amostras = np.concatenate([_seno(1.0), np.zeros(m.TAXA_DO_AUDIO, dtype=np.int16)])
    ((instante, antes, depois, degrau),) = m.medir_emendas(amostras, [1.0])
    assert not regra.julgar_emenda(instante, antes, depois, degrau, 0.01).com_som_dos_dois_lados


def test_emenda_fora_do_audio_e_descartada():
    assert m.medir_emendas(_seno(1.0), [5.0]) == []


def test_estalo_e_achado_mesmo_com_o_instante_deslocado_de_um_quadro():
    # O instante vem de soma de durações e erra até ~1 quadro: o degrau é buscado na folga.
    amostras = np.concatenate([_seno(1.0), _seno(1.0, fase=np.pi / 2)])
    p99 = m.p99_do_degrau_da_fala(amostras)
    ((instante, antes, depois, degrau),) = m.medir_emendas(amostras, [1.0 + 0.03])
    assert regra.julgar_emenda(instante, antes, depois, degrau, p99).acima_do_p99


def test_fala_sem_emenda_quase_nunca_e_acusada():
    # Ruído com som o tempo todo e nenhuma costura: ~1% de acusação por construção do p99.
    rng = np.random.default_rng(7)
    amostras = (rng.normal(0, 4000, 60 * m.TAXA_DO_AUDIO)).astype(np.int16)
    p99 = m.p99_do_degrau_da_fala(amostras)
    instantes = [float(t) for t in rng.uniform(1, 58, 400)]
    acusadas = sum(
        regra.julgar_emenda(i, a, d, g, p99).acima_do_p99
        for i, a, d, g in m.medir_emendas(amostras, instantes)
    )
    assert acusadas / 400 < 0.05
