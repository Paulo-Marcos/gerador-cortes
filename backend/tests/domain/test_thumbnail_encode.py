"""A capa precisa caber nos 2 MB do YouTube perdendo o mínimo possível.

O que existia usava `Image.save("JPEG", quality=92)`, e o padrão do PIL é
subsampling **4:2:0** — descarta 3/4 da informação de cor. Numa capa editorial
(texto grande em cor saturada, com contorno, sobre fundo escuro) é justamente a
borda colorida do texto que vira croma de alta frequência, então o dano aparece
onde mais se olha. Medido numa capa real de 1672x941, contra o PNG original:
q92 4:2:0 dava 34,6 dB; q95 4:4:4 dá 41,3 dB usando 907 KB dos 2 MB.
"""

import io
import math
import random

import pytest
from app.infrastructure.imagem.thumbnail_encode import (
    LIMITE_YOUTUBE_BYTES,
    detectar_mimetype,
    preparar_para_youtube,
)
from PIL import Image, ImageDraw

pytestmark = pytest.mark.integration  # codifica imagem de verdade com PIL (D-751)


def _capa_com_texto(largura: int = 1672, altura: int = 941) -> Image.Image:
    """Reproduz o caso difícil da capa real.

    O fundo precisa ter TEXTURA: barras sólidas viram um PNG de 7 KB, que cabe
    em qualquer limite e nunca exercita a conversão. O ruído determinístico
    (seed fixa) dá ao arquivo um peso realista, e sobre ele vão as faixas de cor
    saturada com contorno — o croma de alta frequência que o 4:2:0 destrói.
    """
    sorteio = random.Random(42)
    imagem = Image.new("RGB", (largura, altura))
    imagem.putdata(
        [
            (sorteio.randrange(16, 80), sorteio.randrange(4, 40), sorteio.randrange(24, 110))
            for _ in range(largura * altura)
        ]
    )
    desenho = ImageDraw.Draw(imagem)
    for i in range(6):
        y = int(altura * 0.62) + i * 34
        desenho.rectangle([40, y, largura - 40, y + 22], fill=(200, 255, 0))
        desenho.rectangle([40, y + 22, largura - 40, y + 26], fill=(90, 0, 120))
    return imagem


def _bytes_png(imagem: Image.Image) -> bytes:
    buffer = io.BytesIO()
    imagem.save(buffer, "PNG")
    return buffer.getvalue()


def _psnr(a: Image.Image, b: Image.Image) -> float:
    pa, pb = a.tobytes(), b.tobytes()
    soma = sum((pa[i] - pb[i]) ** 2 for i in range(0, len(pa), 97))
    quantidade = len(range(0, len(pa), 97))
    mse = soma / quantidade
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)


def test_imagem_que_ja_cabe_passa_intacta():
    """Reencodar um arquivo que cabia so jogaria qualidade fora."""
    dados = _bytes_png(Image.new("RGB", (320, 180), (10, 20, 30)))
    saida, mimetype, nota = preparar_para_youtube(dados)
    assert saida == dados
    assert mimetype == "image/png"
    assert "preservado" in nota


def test_acima_do_limite_converte_e_cabe():
    original = _capa_com_texto()
    dados = _bytes_png(original)
    saida, mimetype, nota = preparar_para_youtube(dados, limite=400_000)
    assert len(saida) <= 400_000
    assert mimetype == "image/jpeg"
    assert "4:4:4" in nota


def test_croma_em_resolucao_total_bate_o_padrao_do_pil():
    """O ganho medido que motivou a mudanca — aqui como regressao."""
    original = _capa_com_texto()
    dados = _bytes_png(original)

    saida, _, _ = preparar_para_youtube(dados, limite=LIMITE_YOUTUBE_BYTES // 2)
    with Image.open(io.BytesIO(saida)) as convertida:
        novo = _psnr(original, convertida.convert("RGB"))

    antigo_buffer = io.BytesIO()
    original.save(antigo_buffer, "JPEG", quality=92, optimize=True)  # 4:2:0, o padrao
    antigo_buffer.seek(0)
    with Image.open(antigo_buffer) as antiga:
        antigo = _psnr(original, antiga.convert("RGB"))

    assert novo > antigo + 3, f"ganho insuficiente: {novo:.1f} dB vs {antigo:.1f} dB"


def test_mimetype_sai_do_conteudo_nao_da_extensao():
    """As capas eram gravadas como .jpg contendo PNG e enviadas como image/jpeg."""
    assert detectar_mimetype(_bytes_png(Image.new("RGB", (8, 8)))) == "image/png"
    jpeg = io.BytesIO()
    Image.new("RGB", (8, 8)).save(jpeg, "JPEG")
    assert detectar_mimetype(jpeg.getvalue()) == "image/jpeg"
    assert detectar_mimetype(b"nada disso") == "application/octet-stream"


def test_limite_inalcancavel_ainda_devolve_imagem_valida():
    """Melhor esforço, nunca exceção: sem capa é pior que com capa feia.

    Um limite absurdo (1 KB) não é atingível sem redimensionar, e reduzir a capa
    PIORA o resultado no YouTube (medido: 1280x720 dá 34,4 dB contra 41,3 dB no
    tamanho original). Então a função entrega a melhor tentativa e deixa o
    chamador decidir — o upload real usa 2 MB, onde a capa cabe com folga.
    """
    dados = _bytes_png(_capa_com_texto())
    saida, mimetype, _ = preparar_para_youtube(dados, limite=1_000)
    assert mimetype == "image/jpeg"
    with Image.open(io.BytesIO(saida)) as imagem:
        assert imagem.size == (1672, 941)


@pytest.mark.parametrize("limite", [400_000, 800_000, LIMITE_YOUTUBE_BYTES])
def test_respeita_o_limite_em_varias_folgas(limite):
    dados = _bytes_png(_capa_com_texto())
    saida, _, _ = preparar_para_youtube(dados, limite=limite)
    assert len(saida) <= limite


def test_capa_real_cabe_nos_2mb_com_a_melhor_qualidade():
    """No limite que importa, a primeira qualidade da lista vence — a conversao
    nao precisa descer degrau nenhum, e sobra mais da metade do orcamento."""
    dados = _bytes_png(_capa_com_texto())
    saida, _, nota = preparar_para_youtube(dados)
    assert "q95" in nota
    assert len(saida) < LIMITE_YOUTUBE_BYTES
