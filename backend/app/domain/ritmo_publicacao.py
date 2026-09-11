"""O ritmo de cada plataforma — o que a fila do lote precisa saber (D-564).

## Por que "lote" não é "publicar N vezes rápido"

Porque as três plataformas param por motivos diferentes, e o motivo muda o
desenho da fila.

  - **YouTube** para por ARITMÉTICA: cada `videos.insert` custa 1.600 de um teto
    diário de 10.000 unidades. O dia acaba, e acaba num número exato.
  - **TikTok** para por VOCÊ: o robô faz os quatro passos repetitivos e o clique
    final é humano (D-537). Não adianta ter fila mais rápida que o operador.
  - **Instagram** nem robô tem: o pacote fica pronto e o upload é no celular.

Se isso virasse uma fila só, ela andaria no passo da mais lenta — o YouTube
esperaria o clique do TikTok sem nenhuma razão. Por isso a fila é uma RAIA por
plataforma, e este módulo é o que cada raia consulta antes de dar o próximo
passo: quantos cabem hoje, quanto esperar, e se há um humano no fim.

Puro de propósito: sem HTTP, sem banco, sem Playwright. O que decide o ritmo é
testável em milissegundos, e o que executa é que precisa de navegador.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from app.domain.publicacao import LIMITES, Plataforma

# `videos.insert` custa 1.600 de um teto diário de 10.000 unidades — a conta
# mora aqui, e não no destino, porque quem precisa dela é a fila: o destino só
# sabe subir um vídeo, a fila é que precisa saber quantos ainda cabem hoje.
CUSTO_QUOTA_UPLOAD = 1600
QUOTA_DIARIA = 10_000
UPLOADS_YOUTUBE_POR_DIA = QUOTA_DIARIA // CUSTO_QUOTA_UPLOAD


class EstadoItem(StrEnum):
    """Onde um item do lote está.

    `SUA_VEZ` é o estado que só existe por causa do TikTok e do Instagram: o
    trabalho da máquina acabou e o do humano começou. Sem ele a tela teria de
    escolher entre mentir ("publicado") e assustar ("erro") — e nenhum dos dois
    descreve uma aba aberta esperando um clique.
    """

    AGUARDANDO = "aguardando"
    PREPARANDO = "preparando"
    SUA_VEZ = "sua_vez"
    PUBLICADO = "publicado"
    ERRO = "erro"
    PULADO = "pulado"
    CANCELADO = "cancelado"


# Estados em que a raia não mexe mais: o item saiu da fila, para o bem ou para
# o mal. `SUA_VEZ` fica de fora de propósito — ali a raia ainda pode voltar,
# quando a vigília do TikTok vir a publicação acontecer (D-546).
ESTADOS_TERMINAIS: frozenset[EstadoItem] = frozenset(
    {EstadoItem.PUBLICADO, EstadoItem.ERRO, EstadoItem.PULADO, EstadoItem.CANCELADO}
)


@dataclass(frozen=True)
class Cadencia:
    """O que a plataforma aguenta por dia, e em que passo.

    `max_por_dia = 0` significa "sem teto conhecido", e não "zero": o TikTok e o
    Instagram não publicam um número documentado, e inventar um limite seria
    impedir o operador por causa de um palpite nosso.
    """

    plataforma: Plataforma
    max_por_dia: int
    intervalo_min_seg: float
    exige_humano: bool
    """O item termina esperando um gesto do operador, não uma resposta de API."""

    @property
    def rotulo(self) -> str:
        return LIMITES[self.plataforma].rotulo


CADENCIAS: dict[Plataforma, Cadencia] = {
    # O único teto que é conta, e não estimativa.
    Plataforma.YOUTUBE_SHORTS: Cadencia(
        plataforma=Plataforma.YOUTUBE_SHORTS,
        max_por_dia=UPLOADS_YOUTUBE_POR_DIA,
        intervalo_min_seg=0.0,
        exige_humano=False,
    ),
    # Sem intervalo: quem dá o passo é o operador clicando em Publicar, e impor
    # uma espera por cima disso só o faria olhar para uma barra parada.
    Plataforma.TIKTOK: Cadencia(
        plataforma=Plataforma.TIKTOK,
        max_por_dia=0,
        intervalo_min_seg=0.0,
        exige_humano=True,
    ),
    Plataforma.TIKTOK_HORIZONTAL: Cadencia(
        plataforma=Plataforma.TIKTOK_HORIZONTAL,
        max_por_dia=0,
        intervalo_min_seg=0.0,
        exige_humano=True,
    ),
    # O pacote é barato de montar (não copia o MP4), então a raia inteira sai
    # em segundos e o que sobra é o upload no celular.
    Plataforma.INSTAGRAM_REELS: Cadencia(
        plataforma=Plataforma.INSTAGRAM_REELS,
        max_por_dia=0,
        intervalo_min_seg=0.0,
        exige_humano=True,
    ),
}


def cadencia_de(plataforma: Plataforma) -> Cadencia:
    """A cadência da plataforma; a do YouTube é a única com teto por padrão.

    >>> cadencia_de(Plataforma.YOUTUBE_SHORTS).max_por_dia
    6
    >>> cadencia_de(Plataforma.TIKTOK).exige_humano
    True
    """
    return CADENCIAS[plataforma]


def cabe_hoje(*, publicados_hoje: int, cadencia: Cadencia) -> bool:
    """Ainda há orçamento do dia para mais um item nesta plataforma?

    >>> cabe_hoje(publicados_hoje=5, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
    True
    >>> cabe_hoje(publicados_hoje=6, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
    False
    >>> cabe_hoje(publicados_hoje=99, cadencia=cadencia_de(Plataforma.TIKTOK))
    True
    """
    if cadencia.max_por_dia <= 0:
        return True
    return publicados_hoje < cadencia.max_por_dia


def espera_do_proximo(
    *,
    ultima_em: datetime | None,
    agora: datetime,
    cadencia: Cadencia,
) -> float:
    """Segundos que faltam para o próximo item desta raia poder sair.

    Zero quando não há espera — o caso comum. O relógio é o da última publicação
    DESTA plataforma, e não o do lote: raias diferentes não se atrasam entre si.

    >>> from datetime import timedelta
    >>> ritmo = Cadencia(Plataforma.TIKTOK, 0, 600.0, True)
    >>> agora = datetime(2026, 9, 10, 20, 0, 0)
    >>> espera_do_proximo(ultima_em=None, agora=agora, cadencia=ritmo)
    0.0
    >>> espera_do_proximo(ultima_em=agora - timedelta(minutes=2), agora=agora, cadencia=ritmo)
    480.0
    >>> espera_do_proximo(ultima_em=agora - timedelta(hours=1), agora=agora, cadencia=ritmo)
    0.0
    """
    if ultima_em is None or cadencia.intervalo_min_seg <= 0:
        return 0.0
    decorrido = (agora - ultima_em).total_seconds()
    return max(0.0, cadencia.intervalo_min_seg - decorrido)


def publicados_no_dia(momentos: list[datetime], agora: datetime) -> int:
    """Quantos itens desta plataforma já saíram HOJE.

    Dia de calendário, e não janela de 24h: é assim que a cota do YouTube vira,
    e contar diferente faria a tela dizer um número que a plataforma não usa.

    >>> hoje = datetime(2026, 9, 10, 23, 30)
    >>> ontem = datetime(2026, 9, 9, 23, 30)
    >>> publicados_no_dia([ontem, hoje, hoje], hoje)
    2
    >>> publicados_no_dia([], hoje)
    0
    """
    return sum(1 for m in momentos if m.date() == agora.date())


def motivo_para_parar(*, publicados_hoje: int, cadencia: Cadencia) -> str | None:
    """A frase que a tela mostra quando a raia trava, ou `None` se ela pode andar.

    Frase pronta e não código de erro: quem lê é o operador às onze da noite.

    >>> motivo_para_parar(publicados_hoje=6, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
    'A cota do YouTube Shorts para hoje acabou (6 envios). O resto sobe amanha.'
    >>> motivo_para_parar(publicados_hoje=1, cadencia=cadencia_de(Plataforma.YOUTUBE_SHORTS))
    """
    if cabe_hoje(publicados_hoje=publicados_hoje, cadencia=cadencia):
        return None
    return (
        f"A cota do {cadencia.rotulo} para hoje acabou "
        f"({cadencia.max_por_dia} envios). O resto sobe amanha."
    )
