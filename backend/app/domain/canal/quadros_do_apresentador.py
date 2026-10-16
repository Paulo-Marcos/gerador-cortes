"""Os quadros da live que vão ao ChatGPT no lugar das fotos do banco (D-929).

## Por que quadros do próprio corte

Com as fotos do banco (duas grades de doze expressões), a capa saía sempre com
a mesma cara: o gerador escolhia na grade o emblema da emoção que o prompt
pedia. Ajustar as skills não bastou. O que resolveu, na prova de 15/10/2026, foi
anexar o apresentador no instante em que ele diz a frase da capa: a expressão
deixa de ser descrita e passa a ser a dele, naquele momento.

## Onde está o apresentador

Na live a webcam é uma janela fixa, e na tela compartilhada aparecem outros
rostos (o vídeo que ele comenta, fotos num slide). Primeiro, os LUGARES onde um
rosto volta em boa parte dos quadros em volta da frase; depois, entre eles, o
que fica dentro da webcam marcada no layout do corte e, na falta dela, o que se
mexe enquanto a frase é dita. Nem o maior rosto nem o mais frequente: no corte
da prova, a moça do vídeo comentado, pausado e de frente, ganhava nos dois.

O lugar também cobre o quadro em que o detector falha: o Haar só vê rosto de
frente, e o apresentador que vira a cabeça para falar continua ali, na mesma
janela. São justamente esses quadros que trazem os ângulos variados.

## Quais quadros

Nítidos (sem o borrão de quem gesticula) e diferentes entre si: três quadros
quase iguais ensinam menos que três momentos da fala. A distância entre
quadros é a da miniatura em tons de cinza da região do apresentador.

Puro: recebe números, devolve números. Ler o vídeo e recortar é da
infraestrutura (`infrastructure/quadros_do_video`).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import median

from app.domain.canal.fotos_do_apresentador import MAXIMO_DE_FOTOS_POR_CAPA

# Quantos quadros espalhados em volta da frase servem para achar os lugares. Medido no
# corte da prova (0d624bfc): o rosto de frente aparece em ~1/3 dos quadros.
QUADROS_PARA_OS_LUGARES = 16
# Quanto antes e depois da frase esses quadros se espalham.
RAIO_DOS_LUGARES_SEG = 120.0
# Duas detecções são do mesmo lugar quando os centros distam menos que isto,
# em fração da largura do quadro (o apresentador mexe a cabeça na janela).
DISTANCIA_DO_MESMO_LUGAR = 0.08
# O lugar precisa aparecer em pelo menos esta fração dos quadros amostrados.
FRACAO_MINIMA_DO_LUGAR = 0.2
MINIMO_DE_APARICOES = 2
# Mais que isso de lugares fixos é tela cheia de rostos: os três primeiros bastam.
MAXIMO_DE_LUGARES = 3
# A mudança média entre quadros seguidos (miniatura em cinza, 0 a 1) abaixo da
# qual o lugar é um retrato parado. Medido em oito cortes da PROD (15/10/2026)
# durante a frase: vídeo comentado pausado, 0,0006 a 0,0015; apresentador
# ouvindo quieto (a frase era do convidado), 0,0042 e 0,0044; falando, 0,015 a
# 0,043. O limiar fica entre o pausado e o que ouve. Desde a D-956 a vida é
# medida na caixa do rosto, e o limiar seguiu valendo (7 cortes, 16/10/2026):
# pausado 0,0008; retrato na parede 0,012 a 0,041; apresentador falando 0,034
# a 0,129.
VIDA_MINIMA = 0.0025

# A região do apresentador a partir do rosto: cabeça e ombros, como na prova
# (webcam 440x320 para um rosto de ~125px). Em múltiplos do lado do rosto.
LARGURA_DA_REGIAO = 3.0
ALTURA_DA_REGIAO = 2.4
ACIMA_DO_ROSTO = 0.7
# Uma linha horizontal é moldura da live quando cruza esta fração da largura da
# região em todos os quadros. O que está atrás do apresentador não chega lá: a
# cabeça e os ombros tapam um terço da região (LARGURA_DA_REGIAO), e o que é
# desenhado por cima dele não é tapado. Medido em 16/10/2026 (corte b4a2dd8c da
# PROD, câmera numa janela entre a barra do canal e a faixa "CHAVE PIX"): a
# moldura cruzou de 0,98 a 1,0.
FRACAO_DA_MOLDURA = 0.8

# A janela da frase ganha uma folga: a cara começa antes da primeira palavra.
FOLGA_DA_JANELA_SEG = 0.4
# Mesmo a frase mais curta dá pelo menos esta janela, para haver o que escolher.
JANELA_MINIMA_DOS_QUADROS = 3.0
PASSO_MINIMO_SEG = 0.4
CANDIDATOS_NA_JANELA = 12
# Dois quadros escolhidos ficam ao menos isto distantes no tempo.
INTERVALO_MINIMO_SEG = 0.8

# A prova ampliou 3x com lanczos; o lado maior chega a isto sem passar de 4x.
LADO_MAIOR_AMPLIADO = 1280
AMPLIACAO_MAXIMA = 4.0


@dataclass(frozen=True)
class Caixa:
    """Um retângulo em frações do quadro (0 a 1): canto superior esquerdo e tamanho."""

    x: float
    y: float
    largura: float
    altura: float

    @property
    def centro(self) -> tuple[float, float]:
        return self.x + self.largura / 2, self.y + self.altura / 2


@dataclass(frozen=True)
class QuadroCandidato:
    """Um instante da janela da frase, medido na região do apresentador.

    `assinatura` é a miniatura em cinza (valores de 0 a 1) que compara quadros;
    `nitidez`, a variância do Laplaciano; `tem_rosto`, se o detector o viu ali.
    """

    instante: float
    nitidez: float
    assinatura: tuple[float, ...]
    tem_rosto: bool


def _mesmo_lugar(a: Caixa, b: Caixa) -> bool:
    (ax, ay), (bx, by) = a.centro, b.centro
    return abs(ax - bx) < DISTANCIA_DO_MESMO_LUGAR and abs(ay - by) < DISTANCIA_DO_MESMO_LUGAR


def _grupo_mais_frequente(
    deteccoes: list[tuple[int, Caixa]],
) -> tuple[int, list[tuple[int, Caixa]]]:
    """O lugar que aparece em mais quadros (cada quadro conta uma vez); empate, o maior rosto."""
    melhor: tuple[int, float, list[tuple[int, Caixa]]] = (0, 0.0, [])
    for _, semente in deteccoes:
        grupo = [(i, c) for i, c in deteccoes if _mesmo_lugar(c, semente)]
        aparicoes = len({i for i, _ in grupo})
        tamanho = median(c.largura for _, c in grupo)
        if (aparicoes, tamanho) > melhor[:2]:
            melhor = (aparicoes, tamanho, grupo)
    return melhor[0], melhor[2]


def lugares_de_rosto(quadros: Sequence[Sequence[Caixa]]) -> list[Caixa]:
    """Os lugares fixos onde um rosto volta, do mais frequente ao menos.

    Um lugar precisa aparecer numa boa parte dos quadros: o rosto de passagem
    não é a webcam de ninguém. Cada caixa é a mediana das detecções do lugar,
    que um falso positivo não move. Quem é o apresentador entre eles decide
    `apresentador_entre`, pela vida no momento da frase.
    """
    minimo = max(MINIMO_DE_APARICOES, FRACAO_MINIMA_DO_LUGAR * len(quadros))
    restantes = [(i, caixa) for i, rostos in enumerate(quadros) for caixa in rostos]
    lugares: list[Caixa] = []
    while restantes and len(lugares) < MAXIMO_DE_LUGARES:
        aparicoes, grupo = _grupo_mais_frequente(restantes)
        if aparicoes < minimo:
            break
        caixas = [c for _, c in grupo]
        lugares.append(
            Caixa(
                x=median(c.x for c in caixas),
                y=median(c.y for c in caixas),
                largura=median(c.largura for c in caixas),
                altura=median(c.altura for c in caixas),
            )
        )
        restantes = [d for d in restantes if d not in grupo]
    return lugares


def vida(candidatos: Sequence[QuadroCandidato]) -> float:
    """Quanto a região muda de um quadro ao seguinte na janela da frase (0 a 1)."""
    pares = list(zip(candidatos, candidatos[1:], strict=False))
    if not pares:
        return 0.0
    return sum(_distancia(a.assinatura, b.assinatura) for a, b in pares) / len(pares)


def _contem(caixa: Caixa, ponto: tuple[float, float]) -> bool:
    x, y = ponto
    return caixa.x <= x <= caixa.x + caixa.largura and caixa.y <= y <= caixa.y + caixa.altura


def apresentador_entre(
    lugares: Sequence[Caixa],
    medidos: Sequence[Sequence[QuadroCandidato]],
    webcam: Caixa | None = None,
) -> int | None:
    """Qual dos lugares é o apresentador, ou `None` quando nenhum serve.

    `medidos` são os quadros da frase medidos na caixa do ROSTO de cada lugar
    (D-956): na região ampliada, um retrato pequeno na parede ganhava vida com
    a cabeça do apresentador entrando nela.

    Primeiro a webcam que o operador marcou no layout do corte (`crop_facecam`):
    é ele quem sabe onde o apresentador fica. Entre os lugares dentro dela, e
    na falta dela (ou de rosto vivo dentro dela), vence o que mais se mexe
    enquanto a frase é dita. O rosto do vídeo comentado costuma estar pausado
    (medido no corte 0d624bfc: a moça do vídeo aparecia em mais quadros que
    ele, de frente e parada) — mas nem sempre, e por isso a webcam vem antes.
    Um lugar sem vida nenhuma é um retrato parado: não é referência de expressão.
    """
    vidas = [vida(candidatos) for candidatos in medidos]
    vivos = [i for i, v in enumerate(vidas) if v >= VIDA_MINIMA]
    na_webcam = [i for i in vivos if webcam and _contem(webcam, lugares[i].centro)]
    escolhas = na_webcam or vivos
    return max(escolhas, key=lambda i: vidas[i]) if escolhas else None


def dentro_da_webcam(regiao: Caixa, webcam: Caixa | None) -> Caixa:
    """A região cortada nas bordas da webcam: a tela compartilhada ao lado não entra.

    Só quando a região está na webcam: o apresentador achado pela vida, fora
    dela, fica com a região inteira.

    >>> dentro_da_webcam(Caixa(0.0, 0.2, 0.4, 0.4), Caixa(0.01, 0.26, 0.33, 0.41))
    Caixa(x=0.01, y=0.26, largura=0.33, altura=0.34)
    """
    if webcam is None or not _contem(webcam, regiao.centro):
        return regiao
    x0, y0 = max(regiao.x, webcam.x), max(regiao.y, webcam.y)
    x1 = min(regiao.x + regiao.largura, webcam.x + webcam.largura)
    y1 = min(regiao.y + regiao.altura, webcam.y + webcam.altura)
    if x1 <= x0 or y1 <= y0:
        return regiao
    return Caixa(round(x0, 4), round(y0, 4), round(x1 - x0, 4), round(y1 - y0, 4))


def instantes_para_os_lugares(
    inicio_seg: float, fim_seg: float, duracao_do_video: float
) -> list[float]:
    """Onde procurar os lugares de rosto: espalhado em volta da frase, dentro do vídeo.

    Em volta da frase, e não no corte inteiro: o que importa é onde a webcam
    está NAQUELE trecho, e uma live às vezes troca de cena no meio.

    >>> instantes_para_os_lugares(100.0, 104.0, 3600.0)[:3]
    [13.176, 26.353, 39.529]
    """
    inicio = max(0.0, inicio_seg - RAIO_DOS_LUGARES_SEG)
    fim = min(duracao_do_video, fim_seg + RAIO_DOS_LUGARES_SEG)
    if fim <= inicio:
        return []
    passo = (fim - inicio) / (QUADROS_PARA_OS_LUGARES + 1)
    return [round(inicio + passo * (i + 1), 3) for i in range(QUADROS_PARA_OS_LUGARES)]


def regiao_do_apresentador(rosto: Caixa, proporcao_do_quadro: float) -> Caixa:
    """Cabeça e ombros em volta do rosto, dentro do quadro.

    `proporcao_do_quadro` é largura/altura em pixels: o rosto é quadrado em
    pixels, não em frações, e a região herda isso.

    >>> r = regiao_do_apresentador(Caixa(0.15, 0.4, 0.094, 0.167), 16 / 9)
    >>> (round(r.x, 3), round(r.y, 3), round(r.largura, 3), round(r.altura, 3))
    (0.056, 0.283, 0.282, 0.401)
    """
    lado_px = rosto.largura * proporcao_do_quadro  # o lado do rosto em "alturas"
    largura = min(1.0, rosto.largura * LARGURA_DA_REGIAO)
    altura = min(1.0, lado_px * ALTURA_DA_REGIAO)
    cx = rosto.x + rosto.largura / 2
    x = min(max(0.0, cx - largura / 2), 1.0 - largura)
    y = min(max(0.0, rosto.y - lado_px * ACIMA_DO_ROSTO), 1.0 - altura)
    return Caixa(x, y, largura, altura)


def aparar_na_moldura(regiao: Caixa, rosto: Caixa, linhas: Sequence[float]) -> Caixa:
    """A região entre as linhas da moldura mais próximas do rosto, acima e abaixo.

    Com a câmera em tela cheia o rosto é grande, e cabeça e ombros passam da
    janela da câmera: entram a barra do canal e a faixa da live (D-957). As
    `linhas` (alturas, em fração do quadro) são as bordas fixas que cruzam a
    região; o que passa delas é sobreposição, não o apresentador.

    >>> rosto = Caixa(0.44, 0.37, 0.23, 0.4)
    >>> aparar_na_moldura(Caixa(0.2, 0.04, 0.68, 0.96), rosto, [0.1, 0.13, 0.89, 0.9])
    Caixa(x=0.2, y=0.13, largura=0.68, altura=0.76)
    """
    fundo = regiao.y + regiao.altura
    y0 = max((y for y in linhas if regiao.y < y <= rosto.y), default=regiao.y)
    y1 = min((y for y in linhas if rosto.y + rosto.altura <= y < fundo), default=fundo)
    if (y0, y1) == (regiao.y, fundo):
        return regiao
    return Caixa(regiao.x, y0, regiao.largura, round(y1 - y0, 4))


def instantes_da_frase(inicio_seg: float, fim_seg: float, duracao_do_video: float) -> list[float]:
    """Os instantes candidatos: a janela da frase com folga, sem sair do vídeo.

    Frase curta ("LULA É ADULTO", 0,7 s) ganha folga até a janela mínima: a
    cara de quem diz uma frase curta é a mesma um segundo antes e depois.

    >>> instantes_da_frase(9.68, 13.0, 445.9)
    [9.28, 9.68, 10.08, 10.48, 10.88, 11.28, 11.68, 12.08, 12.48, 12.88, 13.28]
    >>> len(instantes_da_frase(140.0, 140.7, 445.9))
    8
    """
    folga = max(FOLGA_DA_JANELA_SEG, (JANELA_MINIMA_DOS_QUADROS - (fim_seg - inicio_seg)) / 2)
    inicio = max(0.0, inicio_seg - folga)
    fim = min(duracao_do_video, fim_seg + folga)
    if fim <= inicio:
        return []
    passo = max(PASSO_MINIMO_SEG, (fim - inicio) / CANDIDATOS_NA_JANELA)
    instantes: list[float] = []
    instante = inicio
    while instante < fim and len(instantes) < CANDIDATOS_NA_JANELA:
        instantes.append(round(instante, 3))
        instante += passo
    return instantes


def _distancia(a: Sequence[float], b: Sequence[float]) -> float:
    """A diferença média entre duas miniaturas, de 0 (iguais) a 1."""
    if not a or len(a) != len(b):
        return 0.0
    return sum(abs(x - y) for x, y in zip(a, b, strict=True)) / len(a)


def escolher_quadros(
    candidatos: Sequence[QuadroCandidato], maximo: int = MAXIMO_DE_FOTOS_POR_CAPA
) -> list[QuadroCandidato]:
    """Até `maximo` quadros nítidos e diferentes entre si, em ordem de tempo.

    O primeiro é o mais nítido com rosto visto (ou o mais nítido, se o detector
    não viu nenhum). Cada seguinte é o que mais se distancia dos já escolhidos,
    pesado pela nitidez relativa, desde que longe deles no tempo.
    """
    if not candidatos or maximo < 1:
        return []
    maior_nitidez = max(c.nitidez for c in candidatos) or 1.0
    com_rosto = [c for c in candidatos if c.tem_rosto] or list(candidatos)
    escolhidos = [max(com_rosto, key=lambda c: c.nitidez)]

    def longe_no_tempo(c: QuadroCandidato) -> bool:
        return all(abs(c.instante - e.instante) >= INTERVALO_MINIMO_SEG for e in escolhidos)

    while len(escolhidos) < maximo:
        restantes = [c for c in candidatos if c not in escolhidos and longe_no_tempo(c)]
        if not restantes:
            break
        escolhidos.append(
            max(
                restantes,
                key=lambda c: (
                    min(_distancia(c.assinatura, e.assinatura) for e in escolhidos)
                    * (c.nitidez / maior_nitidez)
                ),
            )
        )
    return sorted(escolhidos, key=lambda c: c.instante)


def ampliacao(largura_px: int, altura_px: int) -> float:
    """Quanto ampliar o recorte: o lado maior até `LADO_MAIOR_AMPLIADO`, de 1x a 4x.

    >>> ampliacao(360, 288)
    3.556
    >>> ampliacao(1600, 900)
    1.0
    """
    lado = max(largura_px, altura_px)
    if lado <= 0:
        return 1.0
    return round(min(AMPLIACAO_MAXIMA, max(1.0, LADO_MAIOR_AMPLIADO / lado)), 3)
