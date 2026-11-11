"""D-993: riscar um corte que a IA propôs deixa o rastro no snapshot da proposta.

O `CorteSnapshot` (D-303) guarda o projeto, a hora e o motivo que o operador
escolheu (ou nenhum). É o que a telemetria conta por motivo. D-1088: o riscar
ficou no lugar do apagar, e o corte e os shorts continuam no banco; D-1106 tirou
o apagar de vez, que não tinha mais quem o chamasse.
"""

from datetime import datetime

from app.domain.corte.motivo_apagado import normalizar_motivo_apagado
from app.domain.corte.motivos_do_canal import slugs_visiveis
from app.models import Corte
from app.services.canal import motivos_de_exclusao


def registrar_riscado(corte: Corte, motivo: str | None) -> None:
    """Marca o snapshot do corte riscado como apagado, com o motivo (D-1088).

    Os shorts não entram: eles continuam no banco, e a telemetria deles conta
    como apagado só o short que deixou de existir. Corte sem snapshot foi criado
    na mão: não há proposta a medir, e o motivo se perde sem prejuízo. D-1006:
    vale só motivo que o canal mostra hoje. O `snapshot` precisa vir carregado
    (é `lazy="selectin"` no modelo).
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
