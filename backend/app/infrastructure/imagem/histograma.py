"""O histograma de luminância de uma imagem em disco (D-909).

A régua da claridade mora no domínio (`domain/corte/claridade_da_capa`); aqui só
se abre o arquivo. Modo "L" do Pillow: a luma ITU-R 601, a mesma da medição
das grades de referência.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image


def histograma_de_luminancia(caminho: Path) -> list[int]:
    """As 256 contagens de luminância da imagem."""
    with Image.open(caminho) as imagem:
        return imagem.convert("L").histogram()
