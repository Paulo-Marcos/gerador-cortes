"""Serviço de legendas do short — palavras viram o payload do Remotion (D-462).

85% das visualizações de short acontecem no mudo, então a legenda não é
acessibilidade: é o conteúdo. Este serviço monta o que o `@remotion/captions`
consome — uma lista de tokens com início e fim em MILISSEGUNDOS, já recortada e
rebaseada para o zero do short.

O agrupamento em "páginas" (o quanto aparece de uma vez) NÃO é feito aqui: quem
faz é o `createTikTokStyleCaptions` no renderer, que é onde a decisão visual
mora. Aqui a responsabilidade acaba nos tokens corretos.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.domain.short import segmentos_short
from app.domain.short.legenda_short import para_captions
from app.domain.short.transcricao_fiel import recortar_varios
from app.services import transcricao_fiel

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LegendaDoShort:
    """Os tokens do short + a fonte que os produziu (para o operador saber a qualidade)."""

    captions: list[dict]
    fonte: str

    @property
    def total(self) -> int:
        return len(self.captions)


async def montar_do_short(
    corte_id: str,
    inicio_seg: float,
    fim_seg: float,
    segmentos: list[segmentos_short.Segmento] | None = None,
) -> LegendaDoShort:
    """Legenda de um trecho do bruto, pronta para o renderer.

    D-604: `segmentos` e a colagem do short — as fatias do bruto na ordem em que
    tocam. Cada uma e recortada e rebaseada no seu offset, entao a fala de um
    pedaco nunca cai por cima da do outro. `None`/vazio e a janela unica, que e o
    caso normal e se comporta exatamente como antes.

    Sem este recorte por segmento o defeito seria silencioso e feio: a legenda
    levaria a fala do BURACO — o material que o operador tirou fora —, porque
    `[inicio, fim]` cobre o vao entre os segmentos. O video pularia e o texto
    continuaria lendo o que ninguem ouve.

    Levanta `LookupError` quando o corte não existe. Trecho sem fala devolve
    lista vazia — short de reação ou de imagem existe, e legenda vazia é uma
    resposta válida, não um erro.
    """
    transcricao = await transcricao_fiel.obter_do_corte(corte_id)
    janelas = [
        (segmento.inicio_seg, segmento.fim_seg, offset)
        for segmento, offset in segmentos_short.com_offsets(
            segmentos or [], inicio_seg=inicio_seg, fim_seg=fim_seg
        )
    ]
    palavras = recortar_varios(transcricao.palavras, janelas)

    logger.info(
        "[LegendasShort] corte=%s trecho=%.1f-%.1f segmentos=%d fonte=%s palavras=%d",
        corte_id[:8],
        inicio_seg,
        fim_seg,
        len(janelas),
        transcricao.fonte,
        len(palavras),
    )
    return LegendaDoShort(captions=para_captions(palavras), fonte=transcricao.fonte)
