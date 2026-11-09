"""D-993: apagar um corte que a IA propôs deixa o rastro no snapshot da proposta.

O corte some; o `CorteSnapshot` (D-303) fica, com o projeto, a hora e o motivo
que o operador escolheu (ou nenhum). É o que a telemetria conta por motivo.
D-995: os shorts do corte saem no mesmo cascade, e o snapshot de cada um fica datado.
D-1088: riscar o corte grava o mesmo rastro, mas o corte e os shorts ficam.
"""

from datetime import datetime

from app.domain.corte.motivo_apagado import normalizar_motivo_apagado
from app.domain.corte.motivos_do_canal import slugs_visiveis
from app.models import Corte
from app.services import proposta_do_short
from app.services.canal import motivos_de_exclusao
from sqlalchemy.ext.asyncio import AsyncSession


async def registrar(db: AsyncSession, corte: Corte, motivo: str | None) -> None:
    """Marca os snapshots do corte e dos shorts dele como apagados; chamar antes do `delete`.

    Corte sem snapshot foi criado na mão: não há proposta a medir, e o motivo
    se perde sem prejuízo. D-1006: vale só motivo que o canal mostra hoje.
    """
    await proposta_do_short.marcar_apagados(db, corte.id)
    registrar_riscado(corte, motivo)


def registrar_riscado(corte: Corte, motivo: str | None) -> None:
    """Marca o snapshot do corte riscado como apagado, com o motivo (D-1088).

    Os shorts não entram: eles continuam no banco, e a telemetria deles conta
    como apagado só o short que deixou de existir. O `snapshot` precisa vir
    carregado (é `lazy="selectin"` no modelo).
    """
    snapshot = corte.snapshot
    if snapshot is None:
        return
    snapshot.projeto_id = corte.projeto_id
    snapshot.apagado_em = datetime.utcnow()
    visiveis = slugs_visiveis(motivos_de_exclusao.motivos())
    snapshot.motivo_apagado = normalizar_motivo_apagado(motivo, visiveis)


def desfazer_riscado(corte: Corte) -> None:
    """O corte riscado voltou: a proposta deixa de contar como apagada (D-1088)."""
    snapshot = corte.snapshot
    if snapshot is None:
        return
    snapshot.apagado_em = None
    snapshot.motivo_apagado = ""
