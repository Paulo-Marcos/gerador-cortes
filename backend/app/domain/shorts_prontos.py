"""D-611: quando um short ainda pertence à central de prontos.

A central responde a uma pergunta só — "o que ainda falta subir?" — e a resposta
é por REDE, não por short: um vídeo no YouTube e fora do TikTok continua sendo
trabalho pendente. Por isso a regra devolve a lista do que falta, e o short sai
da central quando essa lista esvazia.

Puro de propósito: é a regra que decide o que some da tela, e regra que some com
coisas precisa ser testável sem banco.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.domain.publicacao import Plataforma

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
