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

## A faixa central manda

A grade do perfil RECORTA a capa no centro, e a D-519 chutou o recorte errado.
Sem dado de campo, escolhemos a hipótese mais apertada — quadrado 1:1 — e
tratamos o selo como perda aceitável: ele caía fora do quadrado de propósito.

A capa real desmentiu isso. O próprio uploader do TikTok rotula a vitrine como
3:4, e as medidas de 2026 convergem: o recorte é ~1080x1440, com as guias de
safe zone pedindo ainda mais folga (~15% escondidos em cima e embaixo). O
recorte verdadeiro é MAIS generoso que o nosso palpite — e mesmo assim comia o
selo, porque o desenho o havia empurrado para y=1766, fora de qualquer hipótese.

Ficamos com a mais restritiva das duas medidas, 1344px de altura: errar para
dentro custa margem, errar para fora custa um componente inteiro. E agora a capa
INTEIRA vive lá dentro — nada é sacrificado, porque não precisa mais ser.

## O desenho

Três faixas que NÃO se tocam, empilhadas dentro da faixa segura:

    y=0     ┌──────────────┐  fundo (só o feed vê)
    y=288   ├──────────────┤  ← início da faixa segura
            │   ETIQUETA   │
            ├──────────────┤
            │              │
            │     ARTE     │  4:5, contida
            │              │
            ├──────────────┤
            │  selo canal  │
    y=1632  ├──────────────┤  ← fim da faixa segura
    y=1920  └──────────────┘  fundo

A D-526 pôs o texto POR CIMA da arte para poder dá-la de largura cheia. Foi
trocar a coisa pela moldura dela: na primeira capa real a etiqueta caiu
exatamente sobre o rosto do personagem — o único elemento que a capa tinha para
vender.

Agora a arte encolhe um pouco em troca de aparecer inteira, e o texto volta às
suas próprias faixas. O que se perde em área se ganha em leitura: um personagem
menor e visível vale mais que um maior com a cara tapada.

## Onde cada coisa cai no recorte da grade

Todas dentro. A etiqueta abre a faixa, a arte ocupa o meio, o selo fecha — e o
recorte da vitrine não tira nada. As sobras de cima e de baixo levam fundo, que
é o que pode desaparecer sem custo.

O preço foi 12px de altura da arte (1036 para 1024). Barato: a arte continua
sendo o maior elemento da capa, enquanto o selo deixou de ser uma assinatura que
só o feed via.

Módulo puro: só aritmética e texto. Sem I/O, sem Remotion, sem ffmpeg.
"""

from __future__ import annotations

from dataclasses import dataclass

LARGURA = 1080
ALTURA = 1920

# A faixa central que sobrevive ao recorte da vitrine do perfil (D-536).
#
# O recorte medido é 3:4 — 1080x1440. As guias de safe zone pedem mais: ~15% de
# cima e de baixo escondidos, o que deixa 1344. Adotamos a mais apertada das
# duas. A largura NÃO é recortada; o corte da grade é só vertical.
ALTURA_SEGURA = 1344
TOPO_SEGURO = (ALTURA - ALTURA_SEGURA) // 2
BASE_SEGURA = TOPO_SEGURO + ALTURA_SEGURA

# Margem lateral das faixas de texto. Nada aqui protege contra a grade — ela não
# corta na horizontal —, é só respiro de leitura.
MARGEM_SEGURA = 50

# O trilho do chrome do palco (`StageChrome pad`).
MARGEM_DO_CHROME = 40

# Faixas de TEXTO, em cima e embaixo da arte. Encolheram junto com a mudança de
# alvo: o espaço que a faixa segura dá vai para a arte, e não para o ar em volta
# do texto, que já tem corpo elástico (D-533).
ALTURA_DA_ETIQUETA = 200
ALTURA_DO_SELO = 72

# Respiro entre as faixas.
ESPACO_ENTRE_FAIXAS = 24

# A arte é 4:5 e ocupa o que sobra DENTRO da faixa segura — não mais o que sobra
# do quadro de 1920. A largura sai da altura disponível, e não o contrário: é a
# altura que está apertada, com texto nas duas pontas.
ALTURA_DO_FRAME = ALTURA_SEGURA - (ALTURA_DA_ETIQUETA + ALTURA_DO_SELO + 2 * ESPACO_ENTRE_FAIXAS)
LARGURA_DO_FRAME = round(ALTURA_DO_FRAME * 4 / 5)

# Guarda contra texto absurdo, e não regra editorial (D-533). O limite de 2-3
# palavras vive na SKILL, que escreve o texto; aqui o papel é só impedir que um
# parágrafo inteiro chegue à capa. Até este tamanho o renderizador dá conta
# encolhendo o corpo e usando até três linhas.
MAX_CARACTERES_DA_ETIQUETA = 72


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
    def cabe_na_faixa_segura(self) -> bool:
        """Os TRÊS componentes cabem no território que a grade preserva.

        Até a D-533 só a etiqueta era verificada, e o selo ficava fora "de
        propósito". A justificativa era boa (na vitrine o handle é redundante) e
        a consequência era ruim: o selo sumia do único lugar onde as capas são
        vistas em conjunto. Com o recorte real — mais largo que o palpite
        antigo — sacrificar deixou de ser necessário, então ninguém é
        sacrificado.
        """
        return all(
            faixa.y >= TOPO_SEGURO and faixa.y + faixa.h <= BASE_SEGURA
            for faixa in (self.etiqueta, self.frame, self.selo)
        )

    def como_dict(self) -> dict[str, dict[str, int]]:
        return {
            "etiqueta": self.etiqueta.como_dict(),
            "frame": self.frame.como_dict(),
            "selo": self.selo.como_dict(),
        }


# O menor lado que um componente pode ter. Abaixo disso ele some da capa e leva
# junto a alça de arraste do editor — o operador perderia o bloco sem entender.
LADO_MINIMO = 40

# Os nomes dos três componentes, na ordem em que aparecem de cima para baixo.
# São a chave do layout salvo e o rótulo no editor: um vocabulário só.
COMPONENTES = ("etiqueta", "arte", "selo")


def layout_padrao() -> Layout:
    """As três faixas empilhadas, sem sobreposição — o ponto de partida.

    A pilha PREENCHE a faixa segura: a etiqueta encosta no topo dela e o selo
    no fim. Isso resolve duas coisas de uma vez — a capa fica centrada no
    quadro (a faixa segura é centrada por construção) e a vitrine do perfil
    mostra a composição inteira.

    >>> layout = layout_padrao()
    >>> round(layout.frame.w / layout.frame.h, 2)
    0.8
    >>> layout.cabe_na_faixa_segura
    True
    >>> layout.etiqueta.y + layout.etiqueta.h <= layout.frame.y   # nada tapa a arte
    True
    >>> layout.frame.y + layout.frame.h <= layout.selo.y
    True
    >>> layout.selo.y + layout.selo.h == BASE_SEGURA   # a pilha fecha a faixa
    True
    """
    y = TOPO_SEGURO
    etiqueta = Faixa(MARGEM_SEGURA, y, LARGURA - 2 * MARGEM_SEGURA, ALTURA_DA_ETIQUETA)

    y += ALTURA_DA_ETIQUETA + ESPACO_ENTRE_FAIXAS
    frame = Faixa((LARGURA - LARGURA_DO_FRAME) // 2, y, LARGURA_DO_FRAME, ALTURA_DO_FRAME)

    y += ALTURA_DO_FRAME + ESPACO_ENTRE_FAIXAS
    selo = Faixa(MARGEM_SEGURA, y, LARGURA - 2 * MARGEM_SEGURA, ALTURA_DO_SELO)
    return Layout(etiqueta=etiqueta, frame=frame, selo=selo)


def montar_layout(ajuste: dict | None = None) -> Layout:
    """O layout da capa, com o ajuste do operador por cima do padrão (D-532).

    O ajuste é PARCIAL, como toda a cascata de layout deste projeto: a chave
    ausente herda o padrão. Quem move só a etiqueta grava só a etiqueta, e a
    arte continua acompanhando qualquer mudança futura no default.

    Cada componente é encaixado no quadro (`encaixar`), então um valor
    impossível — vindo de um arraste, de um JSON editado à mão, ou de um default
    que mudou embaixo de um ajuste antigo — vira o valor mais próximo que cabe,
    em vez de uma capa quebrada.

    >>> montar_layout({"etiqueta": {"y": 200}}).etiqueta.y
    200
    >>> montar_layout({"etiqueta": {"y": -50}}).etiqueta.y
    0
    >>> montar_layout(None) == layout_padrao()
    True
    """
    padrao = layout_padrao()
    if not ajuste:
        return padrao

    return Layout(
        etiqueta=_com_ajuste(padrao.etiqueta, ajuste.get("etiqueta")),
        frame=_com_ajuste(padrao.frame, ajuste.get("arte")),
        selo=_com_ajuste(padrao.selo, ajuste.get("selo")),
    )


def _com_ajuste(padrao: Faixa, campos: dict | None) -> Faixa:
    """Uma faixa com os campos que o operador mexeu, encaixada no quadro."""
    if not campos:
        return padrao
    return encaixar(
        Faixa(
            _inteiro(campos.get("x"), padrao.x),
            _inteiro(campos.get("y"), padrao.y),
            _inteiro(campos.get("w"), padrao.w),
            _inteiro(campos.get("h"), padrao.h),
        )
    )


def _inteiro(valor: object, padrao: int) -> int:
    """Um campo do JSON salvo, ou o padrão quando ele não é número."""
    try:
        return int(round(float(valor)))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return padrao


def encaixar(faixa: Faixa) -> Faixa:
    """A faixa mais próxima que cabe no quadro de 1080x1920.

    Primeiro o tamanho, depois a posição: encolher um bloco maior que o quadro
    antes de movê-lo evita empurrá-lo para uma origem negativa só para caber.

    >>> encaixar(Faixa(-30, 0, 200, 100)).x
    0
    >>> encaixar(Faixa(1000, 0, 200, 100)).x
    880
    >>> encaixar(Faixa(0, 0, 5, 5)).w
    40
    """
    w = min(max(faixa.w, LADO_MINIMO), LARGURA)
    h = min(max(faixa.h, LADO_MINIMO), ALTURA)
    x = min(max(faixa.x, 0), LARGURA - w)
    y = min(max(faixa.y, 0), ALTURA - h)
    return Faixa(x, y, w, h)


def normalizar_etiqueta(texto: str) -> str:
    """Arruma o texto da etiqueta — sem apagar palavra nenhuma (D-533).

    Antes ela CORTAVA, por palavras e por caracteres, para caber num corpo de
    fonte fixo. O resultado era o defeito que o dev viu: "TODO MUNDO ASSINOU
    EMBAIXO" virava "TODO MUNDO ASSINOU…", e "🔥 NÃO TEM PAÍS QUE SOBREVIVE"
    perdia o verbo.

    Apagar a última palavra de um texto que o operador escreveu à mão é pior que
    qualquer corpo pequeno, e é silencioso — o que faz dele um defeito e não uma
    escolha. Quem resolve o espaço agora é o renderizador, que calcula o corpo
    a partir da faixa e usa até três linhas.

    O teto que restou é guarda contra texto absurdo, não regra editorial: acima
    dele nem três linhas salvam, e cortar vira o menos pior.

    >>> normalizar_etiqueta('  o juro   composto  ')
    'O JURO COMPOSTO'
    >>> normalizar_etiqueta('TODO MUNDO ASSINOU EMBAIXO')
    'TODO MUNDO ASSINOU EMBAIXO'
    >>> normalizar_etiqueta('')
    ''
    """
    palavras = (texto or "").split()
    if not palavras:
        return ""

    while len(palavras) > 1 and len(" ".join(palavras)) > MAX_CARACTERES_DA_ETIQUETA:
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
