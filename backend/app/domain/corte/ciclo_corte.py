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
#   rejeitado  -> proposto   "Voltar" um corte riscado.
#   rejeitado  -> aprovado   o botão de aprovar manda "aprovado" para tudo que
#                            não está aprovado/processado — um riscado aberto
#                            no editor é aprovado direto.
#
# Levar A `rejeitado` não passa por esta tabela: é o gesto "riscar o corte"
# (`validar_riscar`, D-1088), que também solta a mídia. Um PATCH que gravasse
# o status deixaria a mídia pesada no disco de um corte que ninguém vai usar.
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

# D-992: o corte que CONTA como trabalho entregue da live. Mora aqui porque a
# resposta depende da tabela acima: `processado` é o `aprovado` depois que o
# render final passou, e quem pergunta "quantos cortes a live entregou?" quer
# os dois. A listagem da Biblioteca perguntava só por `aprovado`, e a live
# terminada zerava — o corte saía da conta justamente por ter acabado.
#
# `proposto` fica fora porque ainda espera curadoria; `rejeitado` fica fora
# porque é o corte riscado (D-1088): o operador o tirou da live.
#
# Tupla, e não frozenset, para o `IN` do SQL sair sempre na mesma ordem.
CONTAM_NA_PUBLICACAO: tuple[str, ...] = (APROVADO, PROCESSADO)


# D-1088: riscar o corte é o "Rejeitar" de agora. Antes ele excluía o corte, e
# a proposta da IA e o trabalho do operador iam junto; riscado, o corte fica,
# com a mídia solta como no Limpar. Vale de qualquer etapa do operador.
RISCAVEIS = frozenset({PROPOSTO, APROVADO, PROCESSADO})


class TransicaoDeCorteInvalida(PedidoInvalido, ValueError):
    """O status pedido não existe ou não é alcançável a partir do atual.

    É `PedidoInvalido` (o tratador global responde 400) e continua `ValueError`,
    para quem já a tratava assim (D-705).
    """


class CorteNoYouTube(PedidoInvalido):
    """Riscar um corte que já subiu ao YouTube (D-1088).

    O vídeo no ar continua contando como entregue (`CONTAM_NA_PUBLICACAO`); riscar
    o tiraria da conta e soltaria a mídia de um corte publicado.
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


def validar_riscar(atual: str, *, no_youtube: bool) -> None:
    """Levanta erro se o operador não pode riscar este corte (D-1088, RN-04).

    Riscar de novo um corte já riscado é permitido, como repetir um clique.
    """
    if no_youtube:
        raise CorteNoYouTube("Já está no YouTube: um corte publicado não se risca.")
    if atual != REJEITADO and atual not in RISCAVEIS:
        raise TransicaoDeCorteInvalida(f"Um corte '{atual}' não pode ser riscado.")


def status_ao_trazer_de_volta(atual: str, anterior: str) -> str:
    """O status que o "Trazer de volta" devolve ao corte riscado (D-1088, RN-04).

    Volta a aprovado o corte que era aprovado ou processado: riscar soltou o vídeo
    final, e sem ele o processado é um aprovado que precisa renderizar de novo.
    Qualquer outro (proposto, ou riscado antes de o app guardar a etapa) volta a
    proposto, para a curadoria.
    """
    if atual != REJEITADO:
        raise TransicaoDeCorteInvalida("O corte não está riscado.")
    return APROVADO if anterior in (APROVADO, PROCESSADO) else PROPOSTO


def sistema_pode_marcar(atual: str, novo: str) -> bool:
    """Se o sistema (render/export) pode levar o corte de `atual` para `novo`."""
    return novo == atual or novo in _PELO_SISTEMA.get(atual, frozenset())
