"""D-993: apagar um corte que a IA propôs deixa o rastro no snapshot da proposta.

O corte some; o `CorteSnapshot` (D-303) fica, com o projeto, a hora e o motivo
que o operador escolheu (ou nenhum). É o que a telemetria conta por motivo.
"""

from datetime import datetime

from app.domain.corte.motivo_apagado import normalizar_motivo_apagado
from app.models import Corte


def registrar(corte: Corte, motivo: str | None) -> None:
    """Marca o snapshot do corte como apagado; chamar antes do `delete`.

    Corte sem snapshot foi criado na mão: não há proposta a medir, e o motivo
    se perde sem prejuízo.
    """
    snapshot = corte.snapshot
    if snapshot is None:
        return
    snapshot.projeto_id = corte.projeto_id
    snapshot.apagado_em = datetime.utcnow()
    snapshot.motivo_apagado = normalizar_motivo_apagado(motivo)
