"""O que riscar um corte faz nele, por qualquer porta (D-1088, D-1097, RN-04, RN-15).

Duas portas riscam: o "Riscar corte" (`riscar_corte`) e o "Juntar com o
próximo", que risca o segundo corte em vez de apagá-lo (D-1097). As duas passam
por aqui: a marca na transação de quem pede, a mídia depois, numa thread (ADR-0016).

Módulo à parte porque `services/corte.py` não alcança `riscar_corte`: ele importa
o export, que importa `corte` de volta (D-695).
"""

from __future__ import annotations

import asyncio

from app.database import AsyncSessionLocal
from app.domain.corte import ciclo_corte
from app.models import Corte, StatusCorte
from app.services import proposta_apagada
from app.services.media_retention import MediaRetentionService, RetentionReport


def marcar_riscado(corte: Corte, motivo: str | None, *, conta_como_apagado: bool = True) -> str:
    """Risca o corte na transação de quem pede; devolve o status de antes.

    `conta_como_apagado=False` é o juntar: a proposta não foi recusada, ela vive
    no corte que ficou, e a telemetria não a conta como apagada (antes da D-1097
    o snapshot do juntado ficava sem `apagado_em`, e continua assim).
    """
    anterior = getattr(corte.status, "value", corte.status)
    ciclo_corte.validar_riscar(anterior, no_youtube=bool(corte.youtube_video_id))
    if anterior != ciclo_corte.REJEITADO:
        # Riscar de novo (o chip do motivo) não apaga a etapa de onde ele saiu.
        corte.status_antes_de_riscar = anterior
    corte.status = StatusCorte.REJEITADO
    if conta_como_apagado:
        proposta_apagada.registrar_riscado(corte, motivo)
    return anterior


async def soltar_midia_do_riscado(corte: Corte) -> RetentionReport:
    """Solta a mídia do corte já riscado, como o Limpar (D-598), depois do commit.

    O bruto que saiu fica anotado: o "Trazer de volta" o gera de novo.
    """
    bruto = corte.arquivo_clip_path
    relatorio = await asyncio.to_thread(MediaRetentionService.limpar_corte, corte)
    if bruto and not corte.arquivo_clip_path:
        await _anotar_o_bruto_solto(corte.id, bruto)
    return relatorio


async def _anotar_o_bruto_solto(corte_id: str, bruto: str) -> None:
    """Esquece o caminho do bruto que saiu, se ninguém gravou outro no meio."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if corte is not None and corte.arquivo_clip_path == bruto:
            corte.arquivo_clip_path = ""
            corte.bruto_solto_ao_riscar = True
