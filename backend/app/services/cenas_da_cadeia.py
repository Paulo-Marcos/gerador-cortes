"""O passo de cenas na cadeia do bruto, com a marca que o bruto já segura (D-1037).

Fora de `cenas_em_geracao` porque precisa chamar o `CenasRemotionService`, que já
importa aquele módulo. E fora de `export`, que está no teto da catraca de tamanho.
"""

from __future__ import annotations

from app.core.logging import operational_error
from app.services.bruto_progress import BrutoProgress
from app.services.cenas_em_geracao import ReservaDeCenas


async def gerar_cenas_da_cadeia(corte_id: str, reserva: ReservaDeCenas) -> None:
    """O passo de cenas do bruto. Falha é não-fatal: o bruto fica pronto."""
    BrutoProgress.marcar(corte_id, "cenas", "rodando")
    try:
        from app.services.cenas_remotion import CenasRemotionService

        await CenasRemotionService.gerar_cenas_via_claude(corte_id, reserva=reserva)
        BrutoProgress.marcar(corte_id, "cenas", "concluido")
    except Exception as exc:  # noqa: BLE001 — etapa não-fatal: não derruba o bruto
        BrutoProgress.marcar(corte_id, "cenas", "erro")
        operational_error("ExportService", f"Cenas via Claude falharam para {corte_id}: {exc}")
