"""Ciclo de vida do Projeto: de que status para que status se pode ir (D-665).

O status do projeto era mudado em cerca de dez pontos (rotas de reiniciar,
reanalisar e refazer transcrição; ingestão; análise), cada um com a sua ideia
do que era permitido. Esta tabela junta essas ideias num lugar só, registrando
as transições que o app FAZ hoje (levantadas em 21/09/2026).

Os valores espelham `StatusProjeto` (models.py); um teste mantém as duas
listas iguais.
"""

PENDENTE = "pendente"
BAIXANDO = "baixando"
TRANSCREVENDO = "transcrevendo"
PRONTO = "pronto"
ANALISANDO = "analisando"
ANALISADO = "analisado"
ERRO = "erro"

STATUS_DO_PROJETO = frozenset(
    {PENDENTE, BAIXANDO, TRANSCREVENDO, PRONTO, ANALISANDO, ANALISADO, ERRO}
)

# Caminho feliz: pendente -> baixando -> transcrevendo -> pronto -> analisando
# -> analisado. Os desvios, cada um com quem o faz:
#
#   * -> erro                  ingestão ou análise falharam
#   erro/baixando -> pendente  reiniciar download (um ou todos os falhados)
#   * -> pronto                reanalisar e refazer transcrição (D-444) voltam
#                              o projeto para "pronto para analisar"
#   analisando -> anterior     a análise falhou e devolve o status de antes
#                              (pronto, analisado ou erro), sem perder cortes
_TRANSICOES: dict[str, frozenset[str]] = {
    PENDENTE: frozenset({BAIXANDO, ERRO}),
    BAIXANDO: frozenset({TRANSCREVENDO, PENDENTE, ERRO}),
    TRANSCREVENDO: frozenset({PRONTO, ERRO}),
    PRONTO: frozenset({ANALISANDO, ERRO}),
    ANALISANDO: frozenset({ANALISADO, PRONTO, ERRO}),
    ANALISADO: frozenset({ANALISANDO, PRONTO, ERRO}),
    ERRO: frozenset({PENDENTE, PRONTO, ANALISANDO}),
}


def transicao_permitida(atual: str, novo: str) -> bool:
    """Se o projeto pode ir de `atual` para `novo`. Ficar onde está sempre pode."""
    if novo not in STATUS_DO_PROJETO:
        return False
    return novo == atual or novo in _TRANSICOES.get(atual, frozenset())
