"""D-987: em qual rede os cortes HORIZONTAIS da live já estão inteiros.

Espelho de `domain/short/shorts_prontos.py` (`redes_do_corte`, D-905), um nível
acima: lá a pergunta é por corte, sobre os shorts verticais; aqui é pela LIVE,
sobre o MP4 16:9. O card da Biblioteca responde "esta live já subiu?" sem o
operador abrir o projeto e conferir corte a corte.

Puro de propósito: é a regra que acende um sinal de "pode esquecer esta live", e
sinal que dispensa conferência precisa ser testável sem banco.
"""

from __future__ import annotations

from collections.abc import Mapping

from app.domain.compartilhado.plataforma import Plataforma

# O YouTube horizontal NÃO entra no enum `Plataforma`: lá moram os destinos que
# passam pela máquina de publicação (cadência, hashtags, `publicacoes_shorts`),
# e o corte 16:9 sobe por fora dela — a prova de que foi é o
# `Corte.youtube_video_id` que o upload consulta para ser idempotente. Um membro
# sem destino registrado seria meio membro. O TikTok horizontal, esse já existe
# no enum (D-470), e é dele que o id vem.
YOUTUBE_HORIZONTAL = "youtube"
TIKTOK_HORIZONTAL = Plataforma.TIKTOK_HORIZONTAL.value
REDES_DO_HORIZONTAL: tuple[str, ...] = (YOUTUBE_HORIZONTAL, TIKTOK_HORIZONTAL)


def redes_do_projeto(prontos: int, publicados_por_rede: Mapping[str, int]) -> list[dict]:
    """Por rede, se TODOS os cortes com vídeo pronto da live já estão no ar.

    "Pronto" é o corte aprovado que já subiu ao YouTube ou tem o `video.mp4`
    final no disco — a mesma população do `total_video_pronto` do card. Não é
    `pronto_publicar` (metadado e capa): com o denominador menor a rede
    acenderia "tudo no ar" com corte ainda por subir.

    Sem corte pronto nenhuma rede acende: zero de zero não é "tudo publicado",
    é "nada para publicar" — a mesma decisão da D-905.

    >>> redes_do_projeto(2, {"youtube": 2, "tiktok_horizontal": 1})[0]
    {'plataforma': 'youtube', 'publicados': 2, 'completa': True}
    >>> [r["completa"] for r in redes_do_projeto(0, {})]
    [False, False]
    """
    return [
        {
            "plataforma": rede,
            "publicados": publicados_por_rede.get(rede, 0),
            "completa": prontos > 0 and publicados_por_rede.get(rede, 0) >= prontos,
        }
        for rede in REDES_DO_HORIZONTAL
    ]
