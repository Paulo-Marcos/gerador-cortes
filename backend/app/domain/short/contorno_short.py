"""O contorno das janelas do short no estilo limpo (D-911, D-913).

Uma janela que encosta na borda do quadro recua dela, e o fundo aparece em volta
como um contorno; duas janelas que se tocam abrem um vão entre si. Com o fundo de
palco, isso é só desenho: o PNG cobre a borda do vídeo. Com o ECO (D-913) o PNG
fica transparente, e quem precisa parar o vídeo no contorno é o FFmpeg — por isso
a regra também mora aqui, espelhando `janelaComContorno` e `raioDaJanela` de
`video-renderer/src/youtube-bg/palco-limpo.tsx`.

Sem I/O: só retângulos em px do quadro vertical.
"""

from __future__ import annotations

from app.domain.short.formato_video import VERTICAL

# Espelham `VAO_ENTRE_JANELAS` e `RAIO_DA_JANELA_DO_SHORT` do renderer.
VAO_ENTRE_JANELAS = 12
RAIO_DA_JANELA = 24

# Tolerância de 1 px a 2 px: os slots vêm de contas inteiras e podem errar por um.
_NA_BORDA = 1
_COLADA = 2


def janela_com_contorno(janela: dict, janelas: list[dict], contorno: int) -> dict:
    """O buraco da janela depois do contorno: recua das bordas e das vizinhas.

    Exemplos (a empilhada: tela em cima, pessoa colada embaixo):
        >>> tela = {"x": 51, "y": 352, "w": 978, "h": 608}
        >>> pessoa = {"x": 0, "y": 960, "w": 1080, "h": 960}
        >>> janela_com_contorno(pessoa, [tela, pessoa], 32)
        {'x': 32, 'y': 972, 'w': 1016, 'h': 916}
        >>> janela_com_contorno(tela, [tela, pessoa], 32)
        {'x': 51, 'y': 352, 'w': 978, 'h': 596}
        >>> janela_com_contorno(pessoa, [tela, pessoa], 0) == pessoa
        True
    """

    def toca_outra(lado: str) -> bool:
        for outra in janelas:
            if outra is janela:
                continue
            cruza = outra["x"] < janela["x"] + janela["w"] and janela["x"] < outra["x"] + outra["w"]
            if not cruza:
                continue
            if lado == "cima" and abs(outra["y"] + outra["h"] - janela["y"]) <= _COLADA:
                return True
            if lado == "baixo" and abs(janela["y"] + janela["h"] - outra["y"]) <= _COLADA:
                return True
        return False

    def recuo(na_borda: bool, na_vizinha: bool) -> int:
        if na_borda:
            return contorno
        return min(VAO_ENTRE_JANELAS, contorno) if na_vizinha else 0

    largura, altura = VERTICAL.largura, VERTICAL.altura
    esquerda = recuo(janela["x"] <= _NA_BORDA, False)
    direita = recuo(janela["x"] + janela["w"] >= largura - _NA_BORDA, False)
    cima = recuo(janela["y"] <= _NA_BORDA, toca_outra("cima"))
    baixo = recuo(janela["y"] + janela["h"] >= altura - _NA_BORDA, toca_outra("baixo"))
    return {
        "x": janela["x"] + esquerda,
        "y": janela["y"] + cima,
        "w": janela["w"] - esquerda - direita,
        "h": janela["h"] - cima - baixo,
    }


def raio_da_janela(janela: dict) -> int:
    """O raio dos cantos: nenhum quando a janela vai de borda a borda.

    Exemplos:
        >>> raio_da_janela({"x": 0, "y": 960, "w": 1080, "h": 960})
        0
        >>> raio_da_janela({"x": 32, "y": 972, "w": 1016, "h": 916})
        24
    """
    de_lado_a_lado = janela["x"] <= _NA_BORDA and janela["w"] >= VERTICAL.largura - _NA_BORDA
    de_cima_a_baixo = janela["y"] <= _NA_BORDA and janela["h"] >= VERTICAL.altura - _NA_BORDA
    return 0 if de_lado_a_lado or de_cima_a_baixo else RAIO_DA_JANELA
