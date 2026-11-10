"""O PATCH e o /aprovar do corte, com a volta do riscado até o bruto (D-1088).

Tirar o corte do riscado pelo A do editor (aprovar) ou pelo "Voltar" do Workspace
(PATCH proposto) é a mesma volta do "Trazer de volta" (`volta_do_riscado`). O
service do corte faz essa volta na transação do pedido e diz se o bruto que o
riscar soltou precisa ser gerado; quem gera é este service, depois do commit.

Por que um service à parte: `services/corte.py` não pode alcançar o
`bruto_do_corte`, porque `bruto_do_corte → export → corte` fecharia um ciclo de
import (D-695). Este módulo importa os dois, e nenhum deles o importa.
"""

from __future__ import annotations

from app.models import Corte
from app.services import riscar_corte
from app.services.corte import AtualizarCorteDTO, CorteService
from sqlalchemy.ext.asyncio import AsyncSession


async def atualizar(db: AsyncSession, corte_id: str, dados: AtualizarCorteDTO) -> Corte:
    """O PATCH do corte; se ele tirou o corte do riscado, gera o bruto solto (RN-04)."""
    corte = await CorteService.atualizar(db, corte_id, dados)
    if corte.bruto_a_regerar:
        # ADR-0016: o PATCH já gravou; fecha a leitura do refresh antes de disparar.
        await db.commit()
        await riscar_corte.gerar_o_bruto_se_solto(corte_id, True)
    return corte


async def aprovar(corte_id: str) -> None:
    """Aprova o corte; se ele estava riscado, gera o bruto solto (RN-04)."""
    regerar = await CorteService.aprovar(corte_id)
    await riscar_corte.gerar_o_bruto_se_solto(corte_id, regerar)
