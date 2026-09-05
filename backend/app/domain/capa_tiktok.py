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

A arte 4:5 ocupa o quadro; a etiqueta e o selo vão POR CIMA dela, dentro do
quadrado seguro:

    y=0     ┌──────────────┐  fundo
    y=335   ├──────────────┤  ← topo da arte (sangra o quadrado seguro)
    y=420   │ ···········  │  ← início do quadrado seguro
            │   ETIQUETA   │  sobre a arte, com véu escuro
            │              │
            │     ARTE     │  1000x1250, o assunto da capa
            │              │
            │  selo canal  │  sobre a arte
    y=1500  │ ···········  │  ← fim do quadrado seguro
    y=1585  ├──────────────┤  ← base da arte
    y=1920  └──────────────┘  fundo

Duas regras diferentes governam a arte e o texto, e confundi-las foi o erro da
primeira versão.

**O texto** fica dentro do quadrado seguro, sempre: a grade do perfil recorta a
capa, e uma etiqueta cortada pela metade não se lê.

**A arte** sangra além dele de propósito. Ela é imagem: o recorte da grade mostra
o miolo, que é justamente onde o assunto está. Prendê-la ao quadrado seguro
obrigaria a encolhê-la a menos da metade da largura — e a arte deixaria de ser o
que a pessoa vê primeiro.

Foi por isso que a faixa deixou de ser 16:9. Enquanto ela mostrava um quadro do
vídeo, a proporção deitada era honesta: citava o formato do que ia tocar. Com uma
ilustração feita sob medida essa razão caiu, e sobrava uma tira ocupando um terço
da altura de uma capa vertical.

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

# O trilho do chrome do palco (`StageChrome pad`). A arte encosta nele em vez de
# sangrar até a borda: sangrada, ela ATRAVESSA o contorno do palco, e a capa
# deixa de ler como um cartão único.
MARGEM_DO_CHROME = 40

# A arte vai de trilho a trilho; a altura sai do 4:5 dela.
LARGURA_DO_FRAME = LARGURA - 2 * MARGEM_DO_CHROME
ALTURA_DO_FRAME = round(LARGURA_DO_FRAME * 5 / 4)

# Faixas de TEXTO, sobrepostas à arte. A etiqueta cabe em duas linhas; o rodapé
# leva só o selo.
ALTURA_DA_ETIQUETA = 250
ALTURA_DO_SELO = 84

# Respiro entre o texto e a borda do quadrado seguro. O texto não encosta no
# limite porque as fontes divergem sobre o recorte exato da grade.
FOLGA_DO_TEXTO = 30

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
        """O TEXTO cabe no território que a grade preserva.

        Só o texto: a arte sangra além do quadrado de propósito, e cobrá-la aqui
        obrigaria a encolhê-la a menos da metade da largura do quadro.
        """
        return self.etiqueta.y >= TOPO_SEGURO and self.selo.y + self.selo.h <= BASE_SEGURA

    def como_dict(self) -> dict[str, dict[str, int]]:
        return {
            "etiqueta": self.etiqueta.como_dict(),
            "frame": self.frame.como_dict(),
            "selo": self.selo.como_dict(),
        }


def montar_layout() -> Layout:
    """A arte centrada no quadro; o texto por cima, dentro do quadrado seguro.

    A arte é centrada no CANVAS, e não no quadrado seguro: assim o miolo dela —
    o que a grade do perfil vai mostrar — coincide com o centro da imagem, que é
    onde a skill manda o assunto ficar.

    >>> layout = montar_layout()
    >>> (layout.frame.w, layout.frame.h)
    (1000, 1250)
    >>> layout.cabe_no_quadrado_seguro
    True
    >>> layout.frame.y < TOPO_SEGURO      # a arte sangra, de propósito
    True
    """
    frame = Faixa(
        MARGEM_DO_CHROME,
        (ALTURA - ALTURA_DO_FRAME) // 2,
        LARGURA_DO_FRAME,
        ALTURA_DO_FRAME,
    )

    etiqueta = Faixa(
        MARGEM_SEGURA,
        TOPO_SEGURO + FOLGA_DO_TEXTO,
        LARGURA - 2 * MARGEM_SEGURA,
        ALTURA_DA_ETIQUETA,
    )
    selo = Faixa(
        MARGEM_SEGURA,
        BASE_SEGURA - FOLGA_DO_TEXTO - ALTURA_DO_SELO,
        LARGURA - 2 * MARGEM_SEGURA,
        ALTURA_DO_SELO,
    )
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
