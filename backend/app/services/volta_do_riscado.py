"""A volta do corte riscado, dentro da transação de quem pede (D-1088, RN-04, RN-05).

Uma volta só, por qualquer porta: a rota "Trazer de volta" (`riscar_corte`, do
Desfazer do aviso do editor e da seção Riscados, D-1092) e o PATCH ou o /aprovar
que tiram o corte do riscado (o A do editor, o "Voltar" do Workspace). Voltar
limpa o snapshot de apagado (a telemetria deixa de contar) e diz se o bruto que o
riscar soltou precisa ser gerado de novo.

Módulo à parte, sem gerar o bruto: `services/corte.py` o importa, e a geração
(`bruto_do_corte` → `export`) alcança `corte` de volta, o que fecharia um ciclo de
import (D-695). Quem gera é `pedidos_de_status` (PATCH, /aprovar) ou
`riscar_corte.trazer_de_volta`, depois do commit (ADR-0016).
"""

from __future__ import annotations

from app.domain.corte import ciclo_corte
from app.models import Corte, StatusCorte
from app.services import proposta_apagada


def voltar_se_riscado(corte: Corte, pedido: str) -> bool:
    """O PATCH e o /aprovar que tiram o corte do riscado passam pela volta única.

    Chamar na transação do pedido, depois de validá-lo. O status pedido vale: o
    "Voltar" do Workspace pede proposto e fica proposto; o A pede aprovado e fica
    aprovado. Só o "Trazer de volta", que não pede status, herda a etapa de antes
    (`desfazer_o_riscar`). Devolve se o bruto que o riscar soltou precisa ser
    gerado. Corte que não está riscado não muda, nem o pedido de rejeitado num
    riscado: ele não sai do riscado, e desfazer ali apagaria a etapa de antes, o
    tiraria da conta de apagados e geraria o bruto de um corte riscado (D-1101).
    """
    if getattr(corte.status, "value", corte.status) != ciclo_corte.REJEITADO:
        return False
    if pedido == ciclo_corte.REJEITADO:
        return False
    regerar = desfazer_o_riscar(corte)
    corte.status = StatusCorte(pedido)
    return regerar


def desfazer_o_riscar(corte: Corte) -> bool:
    """A etapa de antes, fora da conta de apagados. Devolve se o riscar soltou um
    bruto que precisa ser gerado de novo."""
    novo = ciclo_corte.status_ao_trazer_de_volta(
        getattr(corte.status, "value", corte.status), corte.status_antes_de_riscar or ""
    )
    corte.status = StatusCorte(novo)
    regerar = bool(corte.bruto_solto_ao_riscar)
    corte.status_antes_de_riscar = ""
    corte.bruto_solto_ao_riscar = False
    proposta_apagada.desfazer_riscado(corte)
    return regerar
