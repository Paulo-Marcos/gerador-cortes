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
    ),
    Plataforma.TIKTOK: LimitesPlataforma(
        rotulo="TikTok",
        titulo_max=2200,
        titulo_visivel=100,
        duracao_min_seg=3.0,
        duracao_max_seg=600.0,
        vertical=True,
        hashtags_max=5,
    ),
    # O TikTok aceita 16:9 e ainda dá impulso a landscape acima de 60s. O ganho
    # é presença e descoberta, não watch time: 16:9 toca em janela pequena.
    Plataforma.TIKTOK_HORIZONTAL: LimitesPlataforma(
        rotulo="TikTok (horizontal)",
        titulo_max=2200,
        titulo_visivel=100,
        duracao_min_seg=60.0,
        duracao_max_seg=3600.0,
        vertical=False,
        hashtags_max=5,
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


def _normalizar_hashtags(hashtags: list[str], maximo: int) -> list[str]:
    """`#` garantido, sem espaço, sem repetição, respeitando o teto."""
    vistas: list[str] = []
    for bruta in hashtags:
        tag = "#" + "".join(str(bruta).split()).lstrip("#")
        if tag != "#" and tag not in vistas:
            vistas.append(tag)
    return vistas[:maximo]


def _num(valor: float) -> str:
    return str(int(valor)) if float(valor).is_integer() else f"{valor:g}"
