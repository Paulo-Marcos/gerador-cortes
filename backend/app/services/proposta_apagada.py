"""D-993: apagar um corte que a IA propôs deixa o rastro no snapshot da proposta.

O corte some; o `CorteSnapshot` (D-303) fica, com o projeto, a hora e o motivo
que o operador escolheu (ou nenhum). É o que a telemetria conta por motivo.
D-995: os shorts do corte saem no mesmo cascade, e o snapshot de cada um fica datado.
"""

from datetime import datetime

from app.domain.corte.motivo_apagado import normalizar_motivo_apagado
from app.models import Corte
from app.services import proposta_do_short
from sqlalchemy.ext.asyncio import AsyncSession


async def registrar(db: AsyncSession, corte: Corte, motivo: str | None) -> None:
    """Marca os snapshots do corte e dos shorts dele como apagados; chamar antes do `delete`.

    Corte sem snapshot foi criado na mão: não há proposta a medir, e o motivo
    se perde sem prejuízo.
    """
    await proposta_do_short.marcar_apagados(db, corte.id)
    snapshot = corte.snapshot
    if snapshot is None:
        return
    snapshot.projeto_id = corte.projeto_id
    snapshot.apagado_em = datetime.utcnow()
    snapshot.motivo_apagado = normalizar_motivo_apagado(motivo)
