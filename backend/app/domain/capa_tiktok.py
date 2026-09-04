"""Geometria e texto da capa vertical do TikTok (D-519).

## Por que a capa do YouTube não serve

A thumbnail do canal é 16:9, feita para um cartaz que compete sozinho numa lista
de concorrentes. A capa do TikTok é 9:16 — inclusive para o vídeo DEITADO, que
toca com tarjas dentro do quadro vertical enquanto a capa ocupa o quadro
inteiro. Uma imagem 16:9 aqui vira uma faixa fina no meio de um retângulo vazio.

E o trabalho dela é outro. No feed o vídeo já começou tocando: a capa quase
nunca decide um clique. Ela decide a VITRINE do perfil, onde nove capas são
vistas de uma vez. Por isso a recomendação de mercado é de 0 a 3 palavras (3 a 5
no limite do conteúdo educativo), contra a manchete inteira que o Capista escreve
para o YouTube. Lá é cartaz; aqui é prateleira.

## O quadrado central manda

A grade do perfil RECORTA a capa, e as fontes de 2026 divergem entre corte
quadrado (1:1) e ~3:4. A regra que sobrevive às duas é a mesma: tudo que importa
mora no quadrado central de 1080x1080. Os 420px de cima e os 420 de baixo são
território perdido na grade — no feed eles aparecem, e é por isso que levam
fundo, não conteúdo.

## O desenho

Três faixas, todas dentro do quadrado central:

    y=0     ┌──────────────┐  fundo (só aparece no feed)
    y=420   ├──────────────┤  ← início do quadrado seguro
            │   ETIQUETA   │  2-3 palavras
            ├──────────────┤
            │  frame 16:9  │  o still do vídeo
            ├──────────────┤
            │  selo canal  │
    y=1500  ├──────────────┤  ← fim do quadrado seguro
    y=1920  └──────────────┘  fundo

Assumir o formato deitado em vez de escondê-lo é decisão de projeto: a faixa
central mostra exatamente o que o espectador vai ver, e a repetição das três
bandas é o que faz a grade parecer um canal e não um amontoado.

Módulo puro: só aritmética e texto. Sem I/O, sem Remotion, sem ffmpeg.
"""

from __future__ import annotations

from dataclasses import dataclass

LARGURA = 1080
ALTURA = 1920

# O quadrado central que sobrevive ao recorte da grade do perfil.
LADO_SEGURO = LARGURA
TOPO_SEGURO = (ALTURA - LADO_SEGURO) // 2
BASE_SEGURA = TOPO_SEGURO + LADO_SEGURO

# Respiro entre a borda do quadrado seguro e o conteúdo. Encostar exatamente no
# limite é apostar que o recorte da grade é o que as fontes dizem — e elas
# divergem entre 1:1 e 3:4.
MARGEM_SEGURA = 50

# O trilho do chrome do palco (`StageChrome pad`). A faixa do vídeo encosta
# nele em vez de sangrar até a borda: sangrada, ela ATRAVESSA o contorno do
# palco, e a capa deixa de ler como um cartão único.
MARGEM_DO_CHROME = 40

# A faixa do vídeo vai de trilho a trilho; a altura sai do 16:9 dela.
LARGURA_DO_FRAME = LARGURA - 2 * MARGEM_DO_CHROME
ALTURA_DO_FRAME = round(LARGURA_DO_FRAME * 9 / 16)

ALTURA_DA_ETIQUETA = 300
ALTURA_DO_SELO = 84
ESPACO_ENTRE_FAIXAS = 22

# Acima disso a etiqueta deixa de ser etiqueta. O mercado recomenda de 0 a 3
# palavras; 5 é o teto do conteúdo educativo, e é onde este módulo corta.
MAX_PALAVRAS_DA_ETIQUETA = 5
# Caracteres que ainda cabem em duas linhas com corpo legível na grade.
MAX_CARACTERES_DA_ETIQUETA = 34


@dataclass(frozen=True)
class Faixa:
    """Um retângulo do desenho, em pixels do quadro de 1080x1920."""

    x: int
    y: int
    w: int
    h: int

    def como_dict(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "w": self.w, "h": self.h}


@dataclass(frozen=True)
class Layout:
    """As três faixas da capa, já posicionadas."""

    etiqueta: Faixa
    frame: Faixa
    selo: Faixa

    @property
    def cabe_no_quadrado_seguro(self) -> bool:
        """Nenhuma faixa escapa do território que a grade preserva."""
        topo = self.etiqueta.y
        base = self.selo.y + self.selo.h
        return topo >= TOPO_SEGURO and base <= BASE_SEGURA

    def como_dict(self) -> dict[str, dict[str, int]]:
        return {
            "etiqueta": self.etiqueta.como_dict(),
            "frame": self.frame.como_dict(),
            "selo": self.selo.como_dict(),
        }


def montar_layout() -> Layout:
    """As três faixas, centradas no quadrado seguro.

    O bloco inteiro é centrado em vez de ancorado no topo: sobrando espaço, ele
    sobra igual em cima e embaixo, e a capa continua equilibrada se um dia a
    altura de alguma faixa mudar.

    >>> layout = montar_layout()
    >>> (layout.frame.w, layout.frame.h)
    (1000, 562)
    >>> layout.cabe_no_quadrado_seguro
    True
    """
    alto_total = (
        ALTURA_DA_ETIQUETA
        + ESPACO_ENTRE_FAIXAS
        + ALTURA_DO_FRAME
        + ESPACO_ENTRE_FAIXAS
        + ALTURA_DO_SELO
    )
    y = TOPO_SEGURO + (LADO_SEGURO - alto_total) // 2

    etiqueta = Faixa(MARGEM_SEGURA, y, LARGURA - 2 * MARGEM_SEGURA, ALTURA_DA_ETIQUETA)
    y += ALTURA_DA_ETIQUETA + ESPACO_ENTRE_FAIXAS

    # O frame encosta no trilho do chrome, e não na borda do quadro: ele é a
    # citação do vídeo dentro do cartão, não uma tira passando por cima dele.
    frame = Faixa(MARGEM_DO_CHROME, y, LARGURA_DO_FRAME, ALTURA_DO_FRAME)
    y += ALTURA_DO_FRAME + ESPACO_ENTRE_FAIXAS

    selo = Faixa(MARGEM_SEGURA, y, LARGURA - 2 * MARGEM_SEGURA, ALTURA_DO_SELO)
    return Layout(etiqueta=etiqueta, frame=frame, selo=selo)


def normalizar_etiqueta(texto: str) -> str:
    """Deixa a etiqueta no tamanho que a grade aguenta.

    Corta pelo número de PALAVRAS, e não de caracteres, porque cortar no meio de
    uma palavra produz um rótulo que parece defeito. Se ainda assim passar do
    comprimento legível, cai palavra a palavra até caber.

    >>> normalizar_etiqueta('  o juro   composto  ')
    'O JURO COMPOSTO'
    >>> normalizar_etiqueta('uma frase inteira que jamais caberia numa etiqueta curta')
    'UMA FRASE INTEIRA QUE JAMAIS'
    >>> normalizar_etiqueta('')
    ''
    """
    palavras = (texto or "").split()
    if not palavras:
        return ""

    palavras = palavras[:MAX_PALAVRAS_DA_ETIQUETA]
    while palavras and len(" ".join(palavras)) > MAX_CARACTERES_DA_ETIQUETA:
        palavras.pop()

    return " ".join(palavras).upper()


def etiqueta_da_resposta(bruto: str) -> str:
    r"""A etiqueta dentro do que o modelo devolveu (D-520).

    O contrato pede uma linha e nada mais, mas contrato de saída é promessa, não
    garantia: um modelo eventualmente explica a escolha embaixo, envolve em
    aspas ou embrulha em crase. Sem esta limpeza, a explicação inteira viraria a
    etiqueta — e o corte cortaria no meio dela, produzindo um rótulo sem sentido
    que ninguém entenderia olhando só a capa.

    >>> etiqueta_da_resposta('JURO COMPOSTO')
    'JURO COMPOSTO'
    >>> etiqueta_da_resposta('"teto de gastos"')
    'TETO DE GASTOS'
    >>> etiqueta_da_resposta('SELIC\n\nEscolhi porque o corte fala da taxa.')
    'SELIC'
    >>> etiqueta_da_resposta('   ')
    ''
    """
    texto = (bruto or "").strip()
    if not texto:
        return ""

    primeira = texto.splitlines()[0]
    # Crase, aspas retas e curvas: o modelo às vezes trata a etiqueta como
    # citação, e a aspa entraria na imagem.
    return normalizar_etiqueta(primeira.strip("`\"'“”‘’ "))


# O prompt da arte TEM de proibir texto na imagem — é a regra central da skill,
# e é o que distingue esta cena da capa do YouTube, que embute a manchete. Usamos
# a proibição como MARCADOR de contrato: se ela não veio, o que voltou não é um
# prompt de imagem.
MARCADOR_DO_PROMPT = "no text"


def prompt_da_arte(bruto: str) -> str:
    """O prompt de imagem dentro do que a skill devolveu (D-523).

    Devolve `""` quando a resposta não é um prompt. Isso acontece de verdade: na
    primeira execução o modelo, diante de um corpo de skill ainda com o texto
    genérico do template, respondeu com uma PERGUNTA pedindo a identidade do
    mascote. Sem esta checagem, aquele parágrafo em português iria para o
    gerador de imagem e voltaria uma ilustração de nada.

    >>> prompt_da_arte('Editorial illustration of a hand. No text, no letters.')
    'Editorial illustration of a hand. No text, no letters.'
    >>> prompt_da_arte('Me diga como e o mascote do seu canal e eu escrevo.')
    ''
    >>> prompt_da_arte('')
    ''
    """
    texto = (bruto or "").strip()
    # Cerca de markdown: o contrato pede texto puro, mas modelo gosta de ```.
    if texto.startswith("```"):
        linhas = [linha for linha in texto.splitlines() if not linha.strip().startswith("```")]
        texto = "\n".join(linhas).strip()

    if MARCADOR_DO_PROMPT not in texto.lower():
        return ""
    return texto


def instante_do_frame(duracao_seg: float) -> float:
    """Onde tirar o still, quando ninguém escolheu.

    Um terço do vídeo, e não a metade nem o começo. O começo costuma pegar a
    vinheta ou a primeira sílaba de uma frase, com o rosto ainda se ajustando; a
    metade cai com frequência no meio de uma transição. O primeiro terço é onde
    o assunto já está posto e o apresentador já está no lugar.

    >>> instante_do_frame(90.0)
    30.0
    >>> instante_do_frame(0.0)
    0.0
    """
    duracao = max(0.0, float(duracao_seg))
    return round(duracao / 3, 2)
