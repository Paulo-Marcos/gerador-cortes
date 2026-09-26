"""Formatos de vídeo do projeto — horizontal e vertical (D-463).

Até aqui o app tinha UM formato, e `1920x1080` aparecia cravado em cada lugar
que precisava dele. O short traz o segundo, e com ele a necessidade de nomear o
que antes era implícito.

## Por que o grade NÃO foi parametrizado

O plano previa tornar a resolução um parâmetro de `ffmpeg_grade`. Ao mapear o
caminho do short, isso se mostrou trabalho de risco sem retorno: a grade compõe
o **palco editorial** do vídeo longo — moldura, cards, chrome, overlays de
quadro cheio — e o short não passa por ela. Ele nasce de um RECORTE do bruto,
que é o quadro cru da live.

Parametrizar a grade significaria mexer no arquivo mais sensível do render
(o que a E-023/D-415 passou meses afinando) para alimentar um caminho que não o
usa. O critério de aceite da demanda era "o horizontal não pode regredir"; a
forma mais forte de garantir isso é não tocá-lo. A grade segue 1920x1080 por
decisão registrada, não por esquecimento.

Sem I/O: só o vocabulário e a aritmética do enquadramento.
"""

from __future__ import annotations

from dataclasses import dataclass

# O ffmpeg exige dimensões pares para yuv420p; ímpar quebra o encode com
# "width not divisible by 2". Toda conta aqui arredonda para par.
_PAR = 2


@dataclass(frozen=True)
class Resolucao:
    """Um formato de saída, em pixels."""

    largura: int
    altura: int

    @property
    def aspecto(self) -> float:
        """Exemplo:
        >>> round(HORIZONTAL.aspecto, 3)
        1.778
        """
        return self.largura / self.altura

    @property
    def e_vertical(self) -> bool:
        """Exemplo:
        >>> VERTICAL.e_vertical, HORIZONTAL.e_vertical
        (True, False)
        """
        return self.altura > self.largura

    def __str__(self) -> str:
        """Exemplo:
        >>> str(VERTICAL)
        '1080x1920'
        """
        return f"{self.largura}x{self.altura}"


HORIZONTAL = Resolucao(1920, 1080)
"""O formato do vídeo longo. A grade inteira assume este e continua assumindo."""

VERTICAL = Resolucao(1080, 1920)
"""9:16 — o formato de Shorts, Reels e TikTok."""


@dataclass(frozen=True)
class Recorte:
    """Uma janela retangular na imagem de origem, em pixels."""

    largura: int
    altura: int
    x: int
    y: int


def calcular_recorte(origem: Resolucao, destino: Resolucao, foco_x: float = 0.5) -> Recorte:
    """A maior janela do aspecto de `destino` que cabe em `origem`.

    `foco_x` (0.0 a 1.0) diz onde o centro da janela deve ficar na horizontal —
    0.5 é o meio do quadro. Enquadrar sempre no meio erra quando quem fala está
    de lado, que é o caso comum de uma live com facecam num canto.

    A janela nunca sai da imagem: pedir foco fora da borda encosta na borda em
    vez de gerar coordenada negativa (o ffmpeg falharia em silêncio no meio do
    render, e o operador só descobriria no arquivo final).

    Exemplos:
        >>> calcular_recorte(HORIZONTAL, VERTICAL)
        Recorte(largura=608, altura=1080, x=656, y=0)
        >>> calcular_recorte(HORIZONTAL, VERTICAL, foco_x=0.0).x
        0
        >>> calcular_recorte(HORIZONTAL, VERTICAL, foco_x=1.0).x
        1312
    """
    largura = min(_par(origem.largura), _par(origem.altura * destino.aspecto))
    altura = min(_par(origem.altura), _par(origem.largura / destino.aspecto))

    centro = _limitar(foco_x, 0.0, 1.0) * origem.largura
    x = _limitar(int(round(centro - largura / 2)), 0, origem.largura - largura)
    y = max(0, (origem.altura - altura) // 2)
    return Recorte(largura=largura, altura=altura, x=x, y=y)


def filtro_reenquadrar(origem: Resolucao, destino: Resolucao, foco_x: float = 0.5) -> str:
    """O `-vf` que recorta e escala a origem para o destino, sem tarja.

    Crop e depois scale, nesta ordem: escalar antes gastaria pixels que o crop
    jogaria fora.

    Exemplo:
        >>> filtro_reenquadrar(HORIZONTAL, VERTICAL)
        'crop=608:1080:656:0,scale=1080:1920,setsar=1'
    """
    r = calcular_recorte(origem, destino, foco_x)
    return (
        f"crop={r.largura}:{r.altura}:{r.x}:{r.y},scale={destino.largura}:{destino.altura},setsar=1"
    )


def foco_de_regiao(regiao: dict | None, largura_canvas: int = HORIZONTAL.largura) -> float:
    """O `foco_x` que centra o recorte numa região do layout (D-464).

    A região natural é o `crop_facecam`: num short vertical quem carrega o vídeo
    é a pessoa falando, não a tela reagida. Enquadrar no meio do quadro deixaria
    o rosto na borda sempre que a facecam vive num canto — que é o normal numa
    live.

    Região ausente ou malformada devolve `0.5` (meio), que é o comportamento
    seguro: pior enquadrado, nunca quebrado.

    Exemplos:
        >>> foco_de_regiao({"x": 24, "y": 410, "w": 340, "h": 260})
        0.101
        >>> foco_de_regiao(None)
        0.5
        >>> foco_de_regiao({"x": 860})
        0.5
    """
    if not isinstance(regiao, dict) or largura_canvas <= 0:
        return 0.5
    try:
        centro = float(regiao["x"]) + float(regiao["w"]) / 2
    except (KeyError, TypeError, ValueError):
        return 0.5
    return round(_limitar(centro / largura_canvas, 0.0, 1.0), 3)


def _par(valor: float) -> int:
    """O inteiro PAR mais próximo — o ffmpeg recusa dimensão ímpar em yuv420p.

    Exemplos:
        >>> _par(607.5), _par(608.0), _par(610.4)
        (608, 608, 610)
    """
    return int(round(valor / _PAR)) * _PAR


def _limitar(valor: float, minimo: float, maximo: float) -> float:
    return max(minimo, min(valor, maximo))
