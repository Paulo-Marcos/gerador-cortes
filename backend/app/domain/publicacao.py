"""Domínio da publicação multiplataforma (D-467).

O que cada plataforma aceita é conhecimento volátil e espalhado — título de 100
caracteres aqui, 90 segundos ali, 9:16 obrigatório num, tolerado no outro. Sem
um lugar só para isso, a regra vaza para dentro de cada destino e passa a ser
descoberta na hora do erro, no upload.

Aqui ela vive concentrada, pura e testável. Cada destino (D-468 YouTube por API,
D-469 pacote manual, D-470 TikTok horizontal) implementa o transporte; o que
publicar e em que forma sai daqui.

Levantamento de agosto/2026 — datado de propósito: estes números mudam, e quem
revisar precisa saber de quando eles são.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum


class Plataforma(StrEnum):
    YOUTUBE_SHORTS = "youtube_shorts"
    INSTAGRAM_REELS = "instagram_reels"
    TIKTOK = "tiktok"
    TIKTOK_HORIZONTAL = "tiktok_horizontal"


class ModoPublicacao(StrEnum):
    """Como o vídeo chega na plataforma.

    API é automático; MANUAL entrega um pacote pronto para o operador subir.
    Instagram e TikTok exigem app review de 2 a 4 semanas para o modo API, então
    MANUAL não é gambiarra — é o caminho principal enquanto o audit não sai.
    """

    API = "api"
    MANUAL = "manual"


@dataclass(frozen=True)
class LimitesPlataforma:
    """O que a plataforma aceita, e o que ela mostra."""

    rotulo: str
    titulo_max: int
    """Corte duro: acima disso a plataforma recusa ou trunca."""
    titulo_visivel: int
    """O que aparece no feed antes do 'mais'. O peso do título vai aqui."""
    duracao_min_seg: float
    duracao_max_seg: float
    vertical: bool
    """True = 9:16 é requisito; False = aceita horizontal."""
    hashtags_max: int
    caixa_unica: bool = False
    """A plataforma tem UMA caixa de texto, e não título + descrição.

    TikTok e Instagram só têm a legenda: o "título" é a primeira linha dela, e
    não um campo. O pacote manual precisa saber disso, senão manda o operador
    procurar um campo que não existe — foi o que aconteceu, e a dúvida chegou
    como pergunta.
    """


LIMITES: dict[Plataforma, LimitesPlataforma] = {
    # Vertical até 3 min já entra no feed de Shorts; o título tem 100 caracteres
    # mas só ~40 aparecem antes do corte.
    Plataforma.YOUTUBE_SHORTS: LimitesPlataforma(
        rotulo="YouTube Shorts",
        titulo_max=100,
        titulo_visivel=40,
        duracao_min_seg=1.0,
        duracao_max_seg=180.0,
        vertical=True,
        hashtags_max=3,
    ),
    # Reels: 5 a 90s. Abaixo de 5 a plataforma recusa; acima de 90 nem todos os
    # perfis conseguem publicar pela API.
    Plataforma.INSTAGRAM_REELS: LimitesPlataforma(
        rotulo="Instagram Reels",
        titulo_max=2200,
        titulo_visivel=125,
        duracao_min_seg=5.0,
        duracao_max_seg=90.0,
        vertical=True,
        hashtags_max=10,
        caixa_unica=True,
    ),
    # 4000 e nao 2200: o contador da propria caixa de legenda diz "16/4000"
    # (medido na pagina em 06/09/2026). O numero antigo veio de material de
    # terceiros e ja estava desatualizado.
    Plataforma.TIKTOK: LimitesPlataforma(
        rotulo="TikTok",
        titulo_max=4000,
        titulo_visivel=100,
        duracao_min_seg=3.0,
        duracao_max_seg=600.0,
        vertical=True,
        hashtags_max=5,
        caixa_unica=True,
    ),
    # O TikTok aceita 16:9 e ainda dá impulso a landscape acima de 60s. O ganho
    # é presença e descoberta, não watch time: 16:9 toca em janela pequena.
    Plataforma.TIKTOK_HORIZONTAL: LimitesPlataforma(
        rotulo="TikTok (horizontal)",
        titulo_max=4000,
        titulo_visivel=100,
        duracao_min_seg=60.0,
        duracao_max_seg=3600.0,
        vertical=False,
        hashtags_max=5,
        caixa_unica=True,
    ),
}


@dataclass(frozen=True)
class MetadadosBase:
    """O que o app já sabe sobre o vídeo, antes de virar publicação."""

    titulo: str
    descricao: str = ""
    hashtags: list[str] = field(default_factory=list)
    url_video_longo: str = ""


@dataclass(frozen=True)
class MetadadosPublicacao:
    """O texto já adaptado a UMA plataforma."""

    plataforma: Plataforma
    titulo: str
    descricao: str
    hashtags: list[str]

    @property
    def titulo_visivel(self) -> str:
        """O pedaço que aparece no feed antes do corte."""
        return self.titulo[: LIMITES[self.plataforma].titulo_visivel]


def adaptar(base: MetadadosBase, plataforma: Plataforma) -> MetadadosPublicacao:
    """Adapta o texto aos limites da plataforma, sem inventar conteúdo.

    O título é CORTADO na palavra, não no caractere: terminar em "o erro que
    todo mundo com…" é pior que terminar em "o erro que todo mundo".

    O CTA para o vídeo longo entra na descrição quando há URL — o short é
    funil, e sem o link ele não leva a lugar nenhum.

    Exemplos:
        >>> meta = adaptar(MetadadosBase("Um titulo curto"), Plataforma.YOUTUBE_SHORTS)
        >>> meta.titulo
        'Um titulo curto'
        >>> adaptar(
        ...     MetadadosBase("t", hashtags=["a", "b", "c", "d"]),
        ...     Plataforma.YOUTUBE_SHORTS,
        ... ).hashtags
        ['#a', '#b', '#c']
    """
    limites = LIMITES[plataforma]
    partes = [base.descricao.strip()]
    if base.url_video_longo:
        partes.append(f"Corte completo: {base.url_video_longo}")

    hashtags = _normalizar_hashtags(base.hashtags, limites.hashtags_max)
    if hashtags:
        partes.append(" ".join(hashtags))

    return MetadadosPublicacao(
        plataforma=plataforma,
        titulo=truncar_por_palavra(base.titulo, limites.titulo_max),
        descricao="\n\n".join(p for p in partes if p),
        hashtags=hashtags,
    )


def validar(plataforma: Plataforma, *, duracao_seg: float, vertical: bool) -> list[str]:
    """Os motivos pelos quais a plataforma recusaria (ou desperdiçaria) o vídeo.

    Lista vazia = pode subir. Cada item é uma frase pronta para a tela: quem lê
    é o operador às onze da noite, não um desenvolvedor lendo stack trace.

    Exemplos:
        >>> validar(Plataforma.INSTAGRAM_REELS, duracao_seg=120, vertical=True)
        ['Instagram Reels aceita ate 90s; este video tem 120s.']
        >>> validar(Plataforma.YOUTUBE_SHORTS, duracao_seg=40, vertical=True)
        []
    """
    limites = LIMITES[plataforma]
    avisos: list[str] = []

    if duracao_seg > limites.duracao_max_seg:
        avisos.append(
            f"{limites.rotulo} aceita ate {_num(limites.duracao_max_seg)}s; "
            f"este video tem {_num(duracao_seg)}s."
        )
    if duracao_seg < limites.duracao_min_seg:
        avisos.append(
            f"{limites.rotulo} exige pelo menos {_num(limites.duracao_min_seg)}s; "
            f"este video tem {_num(duracao_seg)}s."
        )
    if limites.vertical and not vertical:
        avisos.append(f"{limites.rotulo} espera video vertical (9:16).")

    return avisos


def truncar_por_palavra(texto: str, limite: int) -> str:
    """Corta no espaço anterior ao limite, para não terminar no meio da palavra.

    Exemplos:
        >>> truncar_por_palavra("o erro que todo mundo comete", 20)
        'o erro que todo'
        >>> truncar_por_palavra("curto", 20)
        'curto'
        >>> truncar_por_palavra("palavraenormesemespaco", 10)
        'palavraeno'
    """
    limpo = " ".join(texto.split())
    if len(limpo) <= limite:
        return limpo
    cortado = limpo[:limite]
    espaco = cortado.rfind(" ")
    return cortado[:espaco] if espaco > 0 else cortado


# D-535: uma hashtag e um TERMO DE BUSCA, nao uma frase.
#
# A versao anterior so tirava os espacos, e o resultado com um tema editorial
# real foi "#Ofetichedaderrotaearomantizacaodafraquezanasimbologiadeesquerda":
# 64 caracteres que ninguem digita, ninguem clica e nenhuma pagina de hashtag
# indexa. Estes dois tetos separam termo de frase.
MAX_PALAVRAS_POR_HASHTAG = 3
MAX_CARACTERES_POR_HASHTAG = 28


def legenda_unica(titulo: str, descricao: str) -> str:
    """Título e descrição na única caixa que a plataforma tem.

    TikTok e Instagram não têm campo de título: têm a legenda, e o "título" é a
    primeira linha dela. A separação existe do nosso lado porque o YouTube
    Shorts precisa dela — aqui os dois voltam a ser um texto só.

    A linha em branco no meio não é enfeite: é o que faz o TikTok cortar no
    "mais" depois do gancho, e não no meio dele.

    >>> legenda_unica("O juro composto", "Corte completo: x #pix")
    'O juro composto\n\nCorte completo: x #pix'
    >>> legenda_unica("", "so a descricao")
    'so a descricao'
    """
    return "\n\n".join(p for p in (titulo.strip(), descricao.strip()) if p)


def _normalizar_hashtags(hashtags: list[str], maximo: int) -> list[str]:
    """Termos de busca: minusculos, sem pontuacao, sem frase, sem repeticao.

    A pontuacao sai porque a plataforma QUEBRA a tag nela — "mestre-aprendiz"
    viraria a tag "mestre" e o resto vira texto solto. Minusculas porque e a
    convencao das duas redes, e porque "#Pix" e "#pix" sao a mesma pagina: sem
    normalizar, a deduplicacao deixaria as duas passarem.

    O acento tambem sai. "#educacao" e "#educação" sao duas paginas distintas, e
    a que tem volume e a sem acento — o teclado do celular nao acentua sozinho.
    Publicar na acentuada e entrar na sala vazia.

    >>> _normalizar_hashtags(['banco master', 'Daniel Vorcaro', 'pix'], 5)
    ['#bancomaster', '#danielvorcaro', '#pix']
    >>> _normalizar_hashtags(['mestre-aprendiz'], 5)
    ['#mestreaprendiz']
    >>> _normalizar_hashtags(['Precarizacao', 'Precarização'], 5)
    ['#precarizacao']
    >>> _normalizar_hashtags(['O fetiche da derrota e a romantizacao da fraqueza'], 5)
    []
    >>> _normalizar_hashtags(['Pix', 'pix'], 5)
    ['#pix']
    """
    vistas: list[str] = []
    for bruta in hashtags:
        palavras = str(bruta).lstrip("#").split()
        if not palavras or len(palavras) > MAX_PALAVRAS_POR_HASHTAG:
            continue

        junto = unicodedata.normalize("NFKD", "".join(palavras))
        corpo = "".join(c for c in junto if c.isalnum() and not unicodedata.combining(c)).lower()
        if not corpo or len(corpo) > MAX_CARACTERES_POR_HASHTAG:
            continue

        tag = f"#{corpo}"
        if tag not in vistas:
            vistas.append(tag)
    return vistas[:maximo]


def _num(valor: float) -> str:
    return str(int(valor)) if float(valor).is_integer() else f"{valor:g}"
