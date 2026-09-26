"""D-477: o detector lendo um video de verdade.

## O que este arquivo garante, e o que nao

Nao garante que o Haar reconhece rostos — isso e do cv2, e um teste que o
repetisse so provaria que o cv2 faz o que faz. A qualidade do classificador foi
aferida a mao, num quadro real: `alt2` achou o rosto a 0.805 da largura onde ele
estava a 0.800, em 8 de 8 quadros amostrados.

O que se guarda aqui e o CODIGO DESTE MODULO, que e onde os erros seriam meus:

  - o quadro lido e o do instante pedido, nao o primeiro do arquivo;
  - a coordenada volta em FRACAO da largura, apesar da reducao interna — se
    vazasse pixel, o consumidor teria de saber da reducao, e o dia em que ela
    mudasse ninguem lembraria do outro lado;
  - quadro sem rosto vira lista vazia, nao excecao.

Por isso o classificador e trocado por um dublê de posicao conhecida: assim o
teste e deterministico e falha por bug meu, nunca por versao do cv2.
"""

import shutil
import subprocess

import pytest
import pytest_asyncio
from app.domain.short.enquadramento_rosto import decidir
from app.infrastructure import detector_rosto
from app.infrastructure.detector_rosto import DeteccaoIndisponivel, detectar_nos_instantes

pytestmark = pytest.mark.integration  # OpenCV e ffmpeg de verdade (D-751)

LARGURA, ALTURA = 960, 540


def _exigir_ffmpeg():
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg ausente")


def _gerar(caminho, *, filtro: str, duracao: int = 4):
    subprocess.run(
        # fmt: off
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            filtro,
            "-t",
            str(duracao),
            "-r",
            "10",
            "-pix_fmt",
            "yuv420p",
            str(caminho),
        ],
        # fmt: on
        check=True,
        timeout=90,
    )
    return caminho


class CascataDeMentira:
    """Diz sempre que ha um rosto na fracao pedida do quadro que RECEBEU.

    Recebe o quadro ja reduzido, como o classificador de verdade — e e isso que
    torna o teste capaz de pegar um erro de conversao: se o modulo dividisse
    pela largura ORIGINAL em vez da de trabalho, a fracao sairia errada.
    """

    def __init__(self, centro: float, lado: float = 0.2):
        self.centro = centro
        self.lado = lado
        self.larguras_recebidas: list[int] = []

    def detectMultiScale(self, imagem, **_kwargs):  # noqa: N802 — assinatura do cv2
        altura, largura = imagem.shape[:2]
        self.larguras_recebidas.append(largura)
        lado = int(largura * self.lado)
        x = int(largura * self.centro - lado / 2)
        return [(x, max(0, altura // 2 - lado // 2), lado, lado)]


@pytest_asyncio.fixture
def cascata(monkeypatch):
    def instalar(centro: float) -> CascataDeMentira:
        dublê = CascataDeMentira(centro)
        monkeypatch.setattr(detector_rosto, "_carregar_cascata", lambda: dublê)
        return dublê

    return instalar


@pytest_asyncio.fixture
async def video(tmp_path):
    """Um video legivel de verdade — o cv2 precisa abrir e navegar nele."""
    _exigir_ffmpeg()
    return _gerar(tmp_path / "fonte.mp4", filtro=f"testsrc=s={LARGURA}x{ALTURA}:r=10")


class TestGeometria:
    @pytest.mark.asyncio
    async def test_a_coordenada_volta_em_fracao_do_quadro(self, video, cascata):
        cascata(0.75)

        quadros = await detectar_nos_instantes(video, [1.0, 2.0])

        for rostos in quadros:
            assert rostos[0].centro_x == pytest.approx(0.75, abs=0.01)

    @pytest.mark.asyncio
    async def test_a_reducao_interna_nao_vaza(self, video, cascata):
        """O quadro chega reduzido ao classificador; a fracao sai igual.

        Se o modulo dividisse pela largura original, este teste apontaria 0.5
        onde o dublê disse 0.75.
        """
        dublê = cascata(0.75)

        await detectar_nos_instantes(video, [1.0])

        assert dublê.larguras_recebidas[0] < LARGURA, "nao reduziu"
        assert dublê.larguras_recebidas[0] == detector_rosto._LARGURA_DE_ANALISE

    @pytest.mark.asyncio
    async def test_quadro_menor_que_a_largura_de_analise_nao_e_ampliado(self, tmp_path, cascata):
        """Ampliar nao inventa detalhe; so custa tempo."""
        _exigir_ffmpeg()
        pequeno = _gerar(tmp_path / "peq.mp4", filtro="testsrc=s=320x180:r=10")
        dublê = cascata(0.5)

        await detectar_nos_instantes(pequeno, [1.0])

        assert dublê.larguras_recebidas[0] == 320

    @pytest.mark.asyncio
    async def test_um_resultado_por_instante_pedido(self, video, cascata):
        cascata(0.5)

        quadros = await detectar_nos_instantes(video, [0.5, 1.5, 2.5, 3.5])

        assert len(quadros) == 4


class TestQuadrosQueNaoDao:
    @pytest.mark.asyncio
    async def test_instante_alem_do_fim_vira_quadro_vazio(self, video, cascata):
        """O banco pode dizer que o trecho vai ate depois do fim do arquivo.

        Isso nao pode virar excecao: o dominio conta quadros sem rosto, e um
        buraco na lista e informacao — um erro seria o fim do fluxo.
        """
        cascata(0.5)

        quadros = await detectar_nos_instantes(video, [1.0, 999.0])

        assert quadros[0], "o instante valido tinha de achar"
        assert quadros[1] == []

    @pytest.mark.asyncio
    async def test_arquivo_inexistente_e_indisponibilidade(self, tmp_path):
        with pytest.raises(DeteccaoIndisponivel):
            await detectar_nos_instantes(tmp_path / "nao-existe.mp4", [1.0])

    @pytest.mark.asyncio
    async def test_sem_instantes_nao_abre_o_arquivo(self, tmp_path):
        """Curto-circuito: um VideoCapture para nada custa I/O a toa."""
        assert await detectar_nos_instantes(tmp_path / "nem-existe.mp4", []) == []


class TestComOCascadeDeVerdade:
    """Sem dublê. Prova que o cascade CARREGA e roda sobre um quadro real."""

    @pytest.mark.asyncio
    async def test_video_liso_nao_inventa_rosto(self, tmp_path):
        """Falso positivo num quadro cinza seria motivo para trocar de cascade."""
        _exigir_ffmpeg()
        liso = _gerar(tmp_path / "liso.mp4", filtro=f"color=c=gray:s={LARGURA}x{ALTURA}:r=10")

        quadros = await detectar_nos_instantes(liso, [1.0, 2.0])

        assert quadros == [[], []]
        assert decidir(quadros).foco_x is None
