"""O passo de cenas na cadeia do bruto, com a marca da D-1037.

Fora de `cenas_em_geracao` porque precisa chamar o `CenasRemotionService`, que já
importa aquele módulo. E fora de `export`, que está no teto da catraca de tamanho.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from app.core.logging import operational_error, operational_info
from app.services.bruto_progress import BrutoProgress
from app.services.cenas_em_geracao import ReservaDeCenas, reservar


@contextmanager
def reserva_da_cadeia(corte_id: str, pedir: bool) -> Iterator[ReservaDeCenas | None]:
    """A cadeia do bruto segura a marca do bruto gravado até as cenas.

    `None` quando ela não vai gerar, ou quando o clique chegou primeiro. Vale para
    toda saída: erro na sincronia, cancelamento do bruto.
    """
    reserva = reservar(corte_id) if pedir else None
    try:
        yield reserva
    finally:
        if reserva:
            reserva.liberar()


async def gerar_cenas_da_cadeia(corte_id: str, reserva: ReservaDeCenas | None) -> None:
    """O passo de cenas do bruto. Sem reserva, quem gera é o clique: a cadeia não paga de novo."""
    BrutoProgress.marcar(corte_id, "cenas", "rodando")
    try:
        from app.services.cenas_remotion import CenasRemotionService

        if reserva:
            await CenasRemotionService.gerar_cenas_via_claude(corte_id, reserva=reserva)
        else:
            operational_info("ExportService", f"Cenas de {corte_id} já em geração: não repete.")
        BrutoProgress.marcar(corte_id, "cenas", "concluido")
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        BrutoProgress.marcar(corte_id, "cenas", "erro")
        operational_error("ExportService", f"Cenas via Claude falharam para {corte_id}: {exc}")
