"""A miniatura da capa e a amostra de pixels dela (D-1130, E-069 B-3).

A aurora do front desfoca a capa inteira; ampliar 64 px desfocados é barato, e uma
imagem de 4 KB dispensa o navegador de baixar o PNG de 3 MB só para borrar. O croma
fica em 4:4:4: o 4:2:0 padrão do PIL perde a cor da borda do texto (ver
`thumbnail_encode`), e a aurora é justamente a cor.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

LARGURA_DA_MINIATURA = 64
LIMITE_DA_MINIATURA_BYTES = 4096
_QUALIDADES = (80, 70, 60, 50, 40, 30, 20)
_LADO_DA_AMOSTRA = 32


def _abrir_rgb(caminho: Path, lado_maximo: int) -> Image.Image:
    img = Image.open(caminho)
    # Num JPEG o decodificador já entrega a imagem encolhida: poupa ler os pixels todos.
    img.draft("RGB", (lado_maximo * 2, lado_maximo * 2))
    return img.convert("RGB")


def miniatura_jpeg(caminho: Path) -> bytes:
    """A capa em 64 px de largura, JPEG 4:4:4, com até 4 KB (a melhor qualidade que cabe)."""
    img = _abrir_rgb(caminho, LARGURA_DA_MINIATURA)
    altura = max(1, round(img.height * LARGURA_DA_MINIATURA / img.width))
    img = img.resize((LARGURA_DA_MINIATURA, altura), Image.Resampling.LANCZOS)
    dados = b""
    for qualidade in _QUALIDADES:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=qualidade, subsampling=0, optimize=True)
        dados = buf.getvalue()
        if len(dados) <= LIMITE_DA_MINIATURA_BYTES:
            break
    return dados


def amostra_de_pixels(caminho: Path) -> list[tuple[int, int, int]]:
    """Os pixels da capa reduzida a 32 px de lado (1 024 no máximo), para a luz do canal."""
    img = _abrir_rgb(caminho, _LADO_DA_AMOSTRA)
    img.thumbnail((_LADO_DA_AMOSTRA, _LADO_DA_AMOSTRA), Image.Resampling.BOX)
    brutos = img.tobytes()
    return [(brutos[i], brutos[i + 1], brutos[i + 2]) for i in range(0, len(brutos), 3)]
