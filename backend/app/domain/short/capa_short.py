"""A capa de um short: qual quadro, e o que a vitrine preserva dele (D-565, onda 4).

## Por que NAO e a capa do TikTok

A capa vertical do corte (`domain/corte/capa_tiktok.py`) existe para resolver um
problema do video DEITADO, e o codigo dela diz isso em tres lugares: o frame do
proprio video "saiu ruim por um motivo estrutural — o video e deitado e costuma
ter texto na tela"; a imagem 16:9 "virava uma faixa fina num retangulo vazio"; e
o crop e agressivo porque "a area virou 4:5 e o video e 16:9".

O short nao tem nenhum desses problemas. Ele JA nasce 9:16, preenchendo o quadro
inteiro, com o palco, a moldura e o fundo editorial do canal em volta — e, desde
a onda 1 desta demanda, com o gancho em cima nos primeiros segundos. Montar uma
arte por cima dele trocaria um quadro que ja e do canal por uma ilustracao.

O que se reaproveita de la e a GEOMETRIA, nao a montagem: a vitrine do perfil
recorta a capa em 3:4, e isso vale para qualquer capa 9:16.

## O gancho e uma capa pronta

Quatro a sete palavras de alto contraste, no terco superior, com identidade em
volta e dentro da faixa segura. Quando o short tem gancho, e de la que o quadro
padrao sai — o instante do MEIO dele, que e onde o texto ja esta opaco e ainda
nao comecou a sumir.

Modulo puro: so aritmetica. Sem I/O, sem ffmpeg.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# A faixa que sobrevive ao recorte da vitrine, em FRACAO da altura. Os pixels
# vivem em `capa_tiktok` (1344 de 1920); aqui viram fracao porque quem consome e
# a tela, que desenha sobre um quadro de tamanho qualquer.
#
# Importar de la seria melhor que copiar — e nao da: aquele modulo e sobre a
# capa MONTADA do corte, e depender dele para desenhar uma guia amarraria duas
# features que nao dividem mais nada. O teste confere os dois numeros.
FRACAO_SEGURA = 1344 / 1920
FRACAO_TOPO_CORTADO = (1 - FRACAO_SEGURA) / 2
FRACAO_BASE_CORTADA = 1 - FRACAO_TOPO_CORTADO

# Onde o quadro cai dentro do gancho. Nao no comeco (o fade de entrada ainda
# corre) e nao no fim (o de saida ja comecou): no meio o texto esta opaco.
_FRACAO_DO_GANCHO = 0.5

# Passo do ajuste fino na tela, em segundos.
PASSO_SEG = 0.1


@dataclass(frozen=True)
class GuiaDaVitrine:
    """O que a grade do perfil corta do quadro, em fracao da altura.

    `topo` e `base` sao as faixas PERDIDAS — e assim que a tela as desenha, como
    sombra sobre o que nao vai aparecer.
    """

    topo: float
    base: float

    @property
    def altura_util(self) -> float:
        """A fracao central que sobrevive ao recorte.

        >>> round(GuiaDaVitrine(0.15, 0.15).altura_util, 2)
        0.7
        """
        return 1 - self.topo - self.base


def guia_da_vitrine() -> GuiaDaVitrine:
    """As faixas que a vitrine do perfil come, em cima e embaixo.

    >>> guia = guia_da_vitrine()
    >>> round(guia.topo, 4)
    0.15
    >>> round(guia.altura_util, 2)
    0.7
    """
    return GuiaDaVitrine(topo=FRACAO_TOPO_CORTADO, base=FRACAO_TOPO_CORTADO)


def instante_padrao(duracao_seg: float, gancho_ate_seg: float = 0.0) -> float:
    """Onde tirar o quadro, quando ninguem escolheu.

    Com gancho, o meio dele: o texto ja esta opaco, ainda nao sumiu, e traz junto
    a promessa do short escrita em cima da imagem.

    Sem gancho, um terco do video — a mesma escolha que a capa do corte faz
    (`capa_tiktok.instante_do_frame`), e pelo mesmo motivo: o comeco costuma
    pegar o apresentador ainda se ajustando, e a metade cai em transicao.

    >>> instante_padrao(30.0, gancho_ate_seg=2.5)
    1.25
    >>> instante_padrao(30.0)
    10.0
    >>> instante_padrao(0.0)
    0.0
    """
    duracao = max(0.0, float(duracao_seg))
    if gancho_ate_seg and gancho_ate_seg > 0:
        return round(min(gancho_ate_seg * _FRACAO_DO_GANCHO, duracao), 2)
    return round(duracao / 3, 2)


def encaixar_instante(instante: object, duracao_seg: float) -> float:
    """O instante mais proximo que existe dentro do video.

    Valor ilegivel cai no zero em vez de levantar: um numero torto vindo do banco
    nao pode custar a capa inteira, e o primeiro quadro e uma capa ruim mas
    valida.

    >>> encaixar_instante(5.0, 30.0)
    5.0
    >>> encaixar_instante(99.0, 30.0)
    30.0
    >>> encaixar_instante(-3, 30.0)
    0.0
    >>> encaixar_instante("abc", 30.0)
    0.0
    """
    try:
        valor = float(instante)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return round(min(max(valor, 0.0), max(0.0, float(duracao_seg))), 2)


# ─── D-584: o prompt da arte da capa, validado ────────────────────────────
#
# Esta funcao existe porque a D-581 reusou `capa_tiktok.prompt_da_arte` aqui, e
# o contrato dele e o CONTRARIO deste.
#
# La a arte nasce SEM texto: a etiqueta e o selo sao desenhados por cima pelo
# sistema, com a tipografia do canal. Por isso aquele parser exige o literal
# "no text" na resposta — e a exigencia e correta LA.
#
# A capa do short nao e montada em faixas: ela e a imagem inteira, e a frase
# precisa nascer dentro dela. Um prompt bom para esta capa NUNCA contem "no
# text" — ele contem o oposto. O resultado foi 502 em toda geracao, com a
# mensagem dizendo que a skill nao devolveu prompt valido quando ela tinha
# devolvido um prompt perfeito.
#
# O que a validacao precisa pegar continua sendo o mesmo RISCO: o modelo, diante
# de um corpo de skill ainda generico, responder com uma PERGUNTA em portugues
# em vez de um prompt. Entao a checagem muda de marcador para forma.

# Um prompt de imagem e um paragrafo. Abaixo disto e recusa, pergunta ou
# preambulo — nenhum dos tres serve ao gerador.
TAMANHO_MINIMO_DO_PROMPT = 120

# Palavras que so aparecem se o modelo respondeu em portugues — ou seja, se ele
# esta conversando com o operador em vez de escrever o prompt em ingles que o
# contrato pede. Funcionais e curtas de proposito: nomes de coisa ("sapo",
# "verde") sairiam em ingles num prompt legitimo.
_PALAVRAS_DE_CONVERSA = (
    " voce ",
    " você ",
    " nao ",
    " não ",
    " qual ",
    " favor ",
    " preciso ",
    " poderia ",
    " me diga ",
)

# D-587: a frase da capa nasce em portugues DENTRO da arte, e o prompt a cita
# entre aspas — "a vida do outro não é a sua desculpa". Procurar conversa no
# prompt inteiro recusava justamente o conteudo que o contrato pede. As aspas
# saem antes da busca: aspas duplas retas, curvas e angulares, e simples so
# quando nao estao coladas numa letra, para o apostrofo de "frog's" nao abrir
# uma citacao que engoliria o resto do prompt.
_TRECHOS_CITADOS = re.compile(r"\"[^\"]*\"|“[^”]*”|«[^»]*»|(?<!\w)'[^']*'(?!\w)")


def prompt_da_capa(bruto: str) -> str:
    """O prompt de imagem dentro do que a skill devolveu, ou "" se nao for um.

    Recusa por FORMA, e nao por marcador: o prompt desta capa leva texto dentro
    da arte, entao nao ha frase obrigatoria que ele sempre contenha.

    >>> prompt_da_capa('Bold editorial illustration, vertical 9:16 1080x1920, ' \
        'subject centered inside the middle square, headline "JUROS" in bright ' \
        'yellow with a thick black outline, high contrast, no watermark.')[:12]
    'Bold editori'
    >>> prompt_da_capa('Me diga qual e o mascote do seu canal que eu escrevo o prompt.')
    ''
    >>> prompt_da_capa('Sure!')
    ''
    >>> prompt_da_capa('')
    ''
    """
    texto = (bruto or "").strip()

    # Cerca de markdown: o contrato pede texto puro, mas modelo gosta de ```.
    if texto.startswith("```"):
        linhas = [linha for linha in texto.splitlines() if not linha.strip().startswith("```")]
        texto = "\n".join(linhas).strip()

    if len(texto) < TAMANHO_MINIMO_DO_PROMPT:
        return ""

    # Pergunta nao e prompt. O modelo pergunta quando a skill ainda esta
    # generica — foi o caso real que originou a checagem da capa do TikTok.
    if texto.rstrip().endswith("?"):
        return ""

    fora_das_aspas = f" {_TRECHOS_CITADOS.sub(' ', texto).lower()} "
    if any(palavra in fora_das_aspas for palavra in _PALAVRAS_DE_CONVERSA):
        return ""

    return texto
