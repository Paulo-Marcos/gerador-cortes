"""D-611: quando um short ainda pertence à central de prontos.

A central responde a uma pergunta só — "o que ainda falta subir?" — e a resposta
é por REDE, não por short: um vídeo no YouTube e fora do TikTok continua sendo
trabalho pendente. Por isso a regra devolve a lista do que falta, e o short sai
da central quando essa lista esvazia.

A D-905 faz a pergunta inversa, por CORTE: "em qual rede este corte já está
inteiro?" — é o que acende o ícone no cartão da tela de Shorts.

Puro de propósito: é a regra que decide o que some da tela, e regra que some com
coisas precisa ser testável sem banco.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from app.domain.compartilhado.plataforma import Plataforma

# As três redes que recebem o MP4 VERTICAL. O TikTok horizontal é do corte
# 16:9 (D-470) e não do short — contá-lo deixaria todo short eternamente
# "faltando uma rede" que ele nunca poderia receber.
PLATAFORMAS_DO_SHORT: tuple[Plataforma, ...] = (
    Plataforma.YOUTUBE_SHORTS,
    Plataforma.TIKTOK,
    Plataforma.INSTAGRAM_REELS,
)


def plataformas_pendentes(publicadas: Iterable[str]) -> list[str]:
    """As redes do short onde ele ainda NÃO está no ar, na ordem canônica.

    >>> plataformas_pendentes([])
    ['youtube_shorts', 'tiktok', 'instagram_reels']
    >>> plataformas_pendentes(['tiktok', 'tiktok_horizontal'])
    ['youtube_shorts', 'instagram_reels']
    """
    ja_foi = set(publicadas)
    return [p.value for p in PLATAFORMAS_DO_SHORT if p.value not in ja_foi]


def redes_do_corte(prontos: int, publicados_por_rede: Mapping[str, int]) -> list[dict]:
    """D-905: por rede, se TODOS os shorts prontos do corte já estão no ar.

    O cartão da tela de Shorts acende o ícone da rede quando o corte está
    inteiro nela — é o sinal de que dá para finalizar. "Inteiro" conta os
    shorts RENDERIZADOS: são os únicos que podem ter subido, e o candidato
    ainda em curadoria já aparece na contagem ao lado. Sem short pronto nenhuma
    rede acende: zero de zero não é "tudo publicado", é "nada para publicar".

    >>> redes_do_corte(2, {"tiktok": 2, "youtube_shorts": 1})[1]
    {'plataforma': 'tiktok', 'publicados': 2, 'completa': True}
    """
    return [
        {
            "plataforma": rede.value,
            "publicados": publicados_por_rede.get(rede.value, 0),
            "completa": prontos > 0 and publicados_por_rede.get(rede.value, 0) >= prontos,
        }
        for rede in PLATAFORMAS_DO_SHORT
    ]
