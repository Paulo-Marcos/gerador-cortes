"""Tradução de exceções inesperadas em respostas HTTP genéricas (D-218).

Os handlers dos routers capturavam `Exception` e devolviam
`HTTPException(500, detail=str(e))`, vazando internals (mensagens de
exceção, caminhos de arquivo, detalhes de driver) para o cliente — o
backend sobe em `--host 0.0.0.0`. Aqui centralizamos o tratamento: o erro
completo (com traceback) vai para o log do servidor e o cliente recebe uma
mensagem genérica.

Uso no router::

    except Exception as e:
        raise erro_interno(e) from e
"""

import logging

from fastapi import HTTPException

logger = logging.getLogger("app.routers")

_MENSAGEM_GENERICA = "Erro interno do servidor"


def erro_interno(exc: Exception, contexto: str = "") -> HTTPException:
    """Loga `exc` com traceback e devolve um 500 genérico, sem vazar detalhes.

    Deve ser chamada de dentro de um bloco `except` para que
    `logger.exception` capture o traceback ativo.
    """
    logger.exception("Erro interno%s", f": {contexto}" if contexto else "")
    return HTTPException(status_code=500, detail=_MENSAGEM_GENERICA)
