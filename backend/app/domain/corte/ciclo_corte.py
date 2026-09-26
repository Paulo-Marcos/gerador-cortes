"""Ciclo de vida do Corte: de que status para que status se pode ir (D-665).

Até aqui o status era texto livre: o PATCH gravava o que chegasse, inclusive
um valor que nem existe no enum. Esta tabela registra as transições que o app
REALMENTE faz (levantadas em 21/09/2026) — ela descreve o comportamento atual,
não inventa um novo.

Os valores espelham `StatusCorte` (models.py). O domain não importa models; um
teste garante que as duas listas não se desencontrem.
"""

from app.domain.compartilhado.erros import PedidoInvalido

PROPOSTO = "proposto"
APROVADO = "aprovado"
REJEITADO = "rejeitado"
PROCESSADO = "processado"

STATUS_DO_CORTE = frozenset({PROPOSTO, APROVADO, REJEITADO, PROCESSADO})

# Pedidas por gente (PATCH, rota /aprovar).
#
#   proposto   -> aprovado   aprovar (editor, Revisão Final)
#   aprovado   -> proposto   o botão de aprovar é liga/desliga
#   processado -> proposto   desaprovar um corte que já foi renderizado
#   rejeitado  -> proposto   "Voltar". Rejeitado é legado: hoje "Rejeitar"
#                            EXCLUI o corte, e nada mais grava esse status.
#   rejeitado  -> aprovado   o botão de aprovar manda "aprovado" para tudo que
#                            não está aprovado/processado — um rejeitado antigo
#                            aberto no editor é aprovado direto.
_PELO_OPERADOR: dict[str, frozenset[str]] = {
    PROPOSTO: frozenset({APROVADO}),
    APROVADO: frozenset({PROPOSTO}),
    PROCESSADO: frozenset({PROPOSTO}),
    REJEITADO: frozenset({PROPOSTO, APROVADO}),
}

# Feitas pelo próprio sistema: o render final e o export marcam o corte como
# processado. O render final roda a pedido, sem exigir aprovação antes.
_PELO_SISTEMA: dict[str, frozenset[str]] = {
    PROPOSTO: frozenset({PROCESSADO}),
    APROVADO: frozenset({PROCESSADO}),
}


class TransicaoDeCorteInvalida(PedidoInvalido, ValueError):
    """O status pedido não existe ou não é alcançável a partir do atual.

    É `PedidoInvalido` (o tratador global responde 400) e continua `ValueError`,
    para quem já a tratava assim (D-705).
    """


def validar_pedido_do_operador(atual: str, novo: str) -> None:
    """Levanta `TransicaoDeCorteInvalida` se o operador não pode fazer essa troca.

    Pedir o status em que o corte já está é permitido: repetir o clique não é
    erro, só não muda nada.
    """
    if novo not in STATUS_DO_CORTE:
        validos = ", ".join(sorted(STATUS_DO_CORTE))
        raise TransicaoDeCorteInvalida(f"Status '{novo}' não existe. Válidos: {validos}.")
    if novo == atual:
        return
    if novo not in _PELO_OPERADOR.get(atual, frozenset()):
        raise TransicaoDeCorteInvalida(f"Um corte '{atual}' não pode passar para '{novo}'.")


def sistema_pode_marcar(atual: str, novo: str) -> bool:
    """Se o sistema (render/export) pode levar o corte de `atual` para `novo`."""
    return novo == atual or novo in _PELO_SISTEMA.get(atual, frozenset())
