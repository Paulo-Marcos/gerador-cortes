"""A máscara de cantos arredondados de uma janela do short (D-911).

O FFmpeg arredonda o vídeo com `alphamerge`: o alfa vem de uma imagem em tons
de cinza do mesmo tamanho. Desenhar a máscara uma vez, com o Pillow, custa
milissegundos; arredondar com `geq` avaliaria uma expressão por pixel a cada
quadro do short.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Supersampling: desenha 4x maior e reduz, para a borda do canto sair suave.
_ESCALA = 4


def mascara_arredondada(largura: int, altura: int, raio: int, pasta: Path) -> Path:
    """O PNG da máscara (branco = vídeo, preto = fora), em cache por tamanho."""
    destino = pasta / f"mascara-{largura}x{altura}-r{raio}.png"
    if destino.is_file():
        return destino
    pasta.mkdir(parents=True, exist_ok=True)
    grande = Image.new("L", (largura * _ESCALA, altura * _ESCALA), 0)
    ImageDraw.Draw(grande).rounded_rectangle(
        (0, 0, largura * _ESCALA - 1, altura * _ESCALA - 1), radius=raio * _ESCALA, fill=255
    )
    grande.resize((largura, altura), Image.Resampling.LANCZOS).save(destino)
    return destino
