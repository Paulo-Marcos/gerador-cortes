"""Mudanças de status feitas pelo próprio sistema, passando pelo domínio (D-665).

As regras vivem em `domain/ciclo_corte.py` e `domain/projeto/ciclo_projeto.py`. Aqui
fica a política de quem aplica: nos caminhos em segundo plano (ingestão,
análise, render, export) uma transição fora da tabela vira AVISO no log, não
exceção. Derrubar um download de uma hora porque a tabela não previu um salto
seria trocar um defeito de cadastro por um defeito de produção; o aviso mostra
o caminho que a tabela ainda não conhece, para ele ser decidido.

Os pedidos do operador (PATCH, /aprovar) não passam por aqui: eles são
recusados com 400, porque quem pediu está olhando e pode corrigir.
"""

import logging

from app.domain import ciclo_corte
from app.domain.projeto import ciclo_projeto

logger = logging.getLogger(__name__)


def _valor(status) -> str:
    # Em memória o status pode ser o enum; `str()` de um enum misto devolve
    # "StatusProjeto.PRONTO" no Python 3.13, não "pronto".
    return getattr(status, "value", status)


def marcar_corte(corte, novo, *, origem: str) -> None:
    """Muda o status do corte a pedido do sistema, avisando se a tabela não prevê."""
    atual, alvo = _valor(corte.status), _valor(novo)
    if not ciclo_corte.sistema_pode_marcar(atual, alvo):
        logger.warning(
            "[ciclo] corte %s: %s -> %s fora da tabela (origem: %s)",
            corte.id,
            atual,
            alvo,
            origem,
        )
    corte.status = novo


def mudar_projeto(projeto, novo, *, origem: str) -> None:
    """Muda o status do projeto, avisando se a tabela não prevê a transição."""
    atual, alvo = _valor(projeto.status), _valor(novo)
    if not ciclo_projeto.transicao_permitida(atual, alvo):
        logger.warning(
            "[ciclo] projeto %s: %s -> %s fora da tabela (origem: %s)",
            projeto.id,
            atual,
            alvo,
            origem,
        )
    projeto.status = novo
