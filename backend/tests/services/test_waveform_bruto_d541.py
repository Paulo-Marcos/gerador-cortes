"""D-541: os picos de audio do BRUTO, para a regua da curadoria de shorts.

A tentacao era apontar a regua dos shorts para o waveform que o editor ja tem.
Os dois eixos de tempo nao sao o mesmo: o do editor vem do PROXY do corte (uma
janela da live, com respiro antes e depois), e o bruto e o corte ja montado, com
os trechos removidos tirados fora — mais curto, comecando no zero, e com os
instantes internos deslocados por tudo o que saiu.

Servir a onda errada seria pior que nao servir nenhuma: ela desenha um envelope
plausivel, e o operador cortaria no silencio que na verdade esta noutro lugar.
"""

import shutil
import subprocess

import pytest
from app.services import waveform_bruto

_FFMPEG = shutil.which("ffmpeg")
precisa_de_ffmpeg = pytest.mark.skipif(_FFMPEG is None, reason="ffmpeg nao esta no PATH")


class TestQuantidadeDePontos:
    """Nem serrote sem informacao, nem mais pontos do que a tela desenha."""

    def test_doze_pontos_por_segundo(self):
        assert waveform_bruto.quantidade_de_pontos(600) == 7200

    def test_video_curto_ganha_o_piso(self):
        # 8 segundos pediriam 96 pontos: uma onda com degraus de um oitavo de
        # segundo, que nao mostra onde a frase comeca.
        assert waveform_bruto.quantidade_de_pontos(8) == waveform_bruto.PONTOS_MINIMO

    def test_video_longo_bate_no_teto(self):
        assert waveform_bruto.quantidade_de_pontos(1_000_000) == waveform_bruto.PONTOS_MAXIMO

    def test_pedido_explicito_manda(self):
        assert waveform_bruto.quantidade_de_pontos(600, pedido=3000) == 3000

    def test_duracao_negativa_nao_quebra(self):
        # `duracao_clip_seg` pode vir zerada ou suja do banco; a regua nao pode
        # cair por causa disso.
        assert waveform_bruto.quantidade_de_pontos(-10) == waveform_bruto.PONTOS_MINIMO


class TestCache:
    def test_bruto_regerado_nao_herda_a_onda_antiga(self, tmp_path):
        """O defeito que o mtime no hash existe para impedir.

        O bruto e regerado (D-528: apagar e re-extrair da live). Um cache
        indexado so pelo id do corte devolveria a onda do arquivo anterior — e
        o sintoma seria a regua "quase certa", o pior tipo de errado numa
        ferramenta de precisao.
        """
        bruto = tmp_path / "clip_raw_1.mp4"
        bruto.write_bytes(b"a" * 100)
        antes = waveform_bruto.caminho_do_cache(bruto, 1200)

        bruto.write_bytes(b"b" * 250)
        depois = waveform_bruto.caminho_do_cache(bruto, 1200)

        assert antes != depois

    def test_a_onda_mora_ao_lado_do_bruto(self, tmp_path):
        bruto = tmp_path / "clip_raw_1.mp4"
        bruto.write_bytes(b"x")

        assert waveform_bruto.caminho_do_cache(bruto, 1200).parent == tmp_path

    def test_cache_corrompido_regera_em_vez_de_derrubar(self, tmp_path):
        quebrado = tmp_path / "waveform_bruto_abc.json"
        quebrado.write_text("{isto nao e json", encoding="utf-8")

        assert waveform_bruto._ler_cache(quebrado) is None

    def test_cache_ausente_nao_e_erro(self, tmp_path):
        assert waveform_bruto._ler_cache(tmp_path / "nao-existe.json") is None


@pytest.mark.asyncio
async def test_corte_sem_bruto_recusa_dizendo_o_que_falta(monkeypatch):
    """Sem bruto nao ha onda, e a tela resolve isso gerando o bruto.

    Por isso e `ValueError` (404 na rota) e nao erro interno: a condicao e do
    material, e o operador sabe o que fazer com ela.
    """

    class CorteFalso:
        duracao_clip_seg = 100.0

    class SessaoFalsa:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, _modelo, _id):
            return CorteFalso()

    monkeypatch.setattr(waveform_bruto, "AsyncSessionLocal", SessaoFalsa)
    monkeypatch.setattr(waveform_bruto, "_bruto_em_disco", lambda _corte: None)

    with pytest.raises(ValueError, match="nao esta em disco"):
        await waveform_bruto.picos_do_bruto("c1")


@precisa_de_ffmpeg
@pytest.mark.asyncio
async def test_a_onda_acompanha_o_audio_de_verdade(monkeypatch, tmp_path):
    """O teste que prova que a regua nao esta desenhando ficcao.

    O clipe tem 12s com som alto SO entre 4s e 8s. Se os picos nao subirem no
    terco do meio, a onda nao esta descrevendo este arquivo — e uma onda que
    nao descreve o arquivo e exatamente o defeito que faria o operador cortar
    no lugar errado com toda a confianca.
    """
    bruto = tmp_path / "clip_raw_1.mp4"
    subprocess.run(
        [
            _FFMPEG,
            "-y",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=320x180:d=12",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:duration=12",
            "-af",
            "volume='if(between(t,4,8),1,0.02)':eval=frame",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            str(bruto),
        ],
        check=True,
        capture_output=True,
    )

    class CorteFalso:
        duracao_clip_seg = 12.0

    class SessaoFalsa:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, _modelo, _id):
            return CorteFalso()

    monkeypatch.setattr(waveform_bruto, "AsyncSessionLocal", SessaoFalsa)
    monkeypatch.setattr(waveform_bruto, "_bruto_em_disco", lambda _corte: bruto)

    dados = await waveform_bruto.picos_do_bruto("c1")
    picos = dados["peaks"]
    n = len(picos)

    def media(de: float, ate: float) -> float:
        fatia = picos[int(n * de) : int(n * ate)]
        return sum(abs(v) for v in fatia) / max(1, len(fatia))

    assert media(0.33, 0.66) > 0.5
    assert media(0, 0.30) < 0.2
    assert media(0.70, 1) < 0.2
    assert 11.5 < dados["duration_sec"] < 12.5
    assert dados["offset_sec"] == 0.0
    assert dados["cached"] is False

    # A segunda chamada sai do cache — o ffmpeg roda uma vez por bruto.
    assert (await waveform_bruto.picos_do_bruto("c1"))["cached"] is True


@precisa_de_ffmpeg
@pytest.mark.asyncio
async def test_bruto_quebrado_nao_vira_erro_interno(monkeypatch, tmp_path):
    """Acontece de verdade: o `.mkv` de demonstracao do DEV nao tem EBML valido.

    Um 500 diria "erro interno" e apontaria para nos, escondendo a unica
    informacao util — QUAL arquivo o ffmpeg nao leu.
    """
    bruto = tmp_path / "clip_raw_1.mkv"
    bruto.write_bytes(b"nao sou um container" * 50)

    class CorteFalso:
        duracao_clip_seg = 30.0

    class SessaoFalsa:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def get(self, _modelo, _id):
            return CorteFalso()

    monkeypatch.setattr(waveform_bruto, "AsyncSessionLocal", SessaoFalsa)
    monkeypatch.setattr(waveform_bruto, "_bruto_em_disco", lambda _corte: bruto)

    with pytest.raises(waveform_bruto.OndaIlegivel, match="clip_raw_1.mkv"):
        await waveform_bruto.picos_do_bruto("c1")
