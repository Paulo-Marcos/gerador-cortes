"""A fábrica de shorts pelo caminho manual: regerar o bruto e propor os shorts (D-755).

Mora aqui, acima dos shorts e do export, porque os dois se pediam coisas: a
fábrica pedia o bruto ao export, e o export, ao fim do bruto de um corte Fire,
pede os shorts (D-455). Com os dois pedidos passando pelos shorts, eles e o
export se importavam. Aqui o caminho manual fala com os dois, e cada um deles
fala só para baixo.
"""

from __future__ import annotations

import logging

from app.services import shorts
from app.services.export import ExportService

logger = logging.getLogger(__name__)


async def gerar_shorts_do_corte(corte_id: str) -> dict:
    """Caminho MANUAL da fabrica: regera o bruto se preciso e propoe os shorts.

    Serve os cortes que o automatico nao alcanca — os que ja tinham bruto antes
    da E-030, os que tiveram o bruto descartado, e o teste da esteira sem
    reprocessar a live inteira.

    O ponto delicado e a regeneracao do bruto. Ela roda com
    `refazer_transcricao=False, refazer_cenas=False`, o modo que a D-160 criou
    justamente para isto: refaz o VIDEO e nao encosta no texto nem nas cenas.
    Assim a pos-producao ja feita — cenas, layout, metadados, thumbnail —
    sobrevive intacta; o que muda no banco e so o ponteiro do clip e a duracao,
    que sao recalculados iguais porque as bordas do corte nao mudaram.

    Levanta `LookupError` (corte inexistente) e `ValueError` (corte sem Fire, ou
    bruto que nao pode ser regerado).
    """
    estado = await shorts.elegibilidade(corte_id)
    if not estado["elegivel"]:
        raise ValueError(
            "Este corte nao esta na fabrica de shorts. Marque o Fire, ou indique-o "
            "para shorts, e tente de novo."
        )

    regerou = False
    if not estado["tem_bruto"]:
        # Mesma checagem do caminho explicito: sem a live, o FFmpeg falharia com
        # uma mensagem que nao diz o que fazer.
        await shorts.exigir_video_da_live(corte_id)
        await _regerar_bruto_preservando_pos_producao(corte_id)
        regerou = True

    resultado = await shorts.sugerir_shorts(corte_id)
    logger.info(
        "[Shorts] geracao manual corte=%s bruto_regerado=%s candidatos=%d",
        corte_id[:8],
        regerou,
        len(resultado.get("shorts", [])),
    )
    return {**resultado, "bruto_regerado": regerou}


async def _regerar_bruto_preservando_pos_producao(corte_id: str) -> None:
    """Refaz so o video do bruto — nem transcricao, nem cenas (D-160)."""
    resultado = await ExportService.gerar_bruto_via_worker(
        corte_id, refazer_transcricao=False, refazer_cenas=False
    )
    if resultado.get("status") != "pronto":
        raise ValueError(
            f"Nao consegui regerar o bruto: {resultado.get('mensagem', 'erro desconhecido')}"
        )
