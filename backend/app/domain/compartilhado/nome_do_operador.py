"""O nome do operador: a pessoa que usa o app, a quem a Biblioteca saúda (D-1129).

É da aplicação, não do canal. Vazio significa "sem nome": a saudação sai sem ele.
"""

from __future__ import annotations

from app.domain.compartilhado.erros import PedidoInvalido

TAMANHO_MAXIMO = 60


def normalizar_nome(texto: str | None) -> str:
    """O nome sem espaços nas pontas; "" quando não há nome.

    >>> normalizar_nome("  Paulo ")
    'Paulo'
    >>> normalizar_nome("   ")
    ''
    """
    nome = (texto or "").strip()
    if len(nome) > TAMANHO_MAXIMO:
        raise PedidoInvalido(f"O nome pode ter no máximo {TAMANHO_MAXIMO} caracteres.")
    return nome
