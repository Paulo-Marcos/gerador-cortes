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

from app.domain.compartilhado.erros import (
    ConfiguracaoAusente,
    ErroDeDominio,
    NaoEncontrado,
    PedidoInvalido,
    ServicoExternoFalhou,
)
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.routers")

_MENSAGEM_GENERICA = "Erro interno do servidor"


def erro_interno(exc: Exception, contexto: str = "") -> HTTPException:
    """Loga `exc` com traceback e devolve um 500 genérico, sem vazar detalhes.

    Deve ser chamada de dentro de um bloco `except` para que
    `logger.exception` capture o traceback ativo.
    """
    logger.exception("Erro interno%s", f": {contexto}" if contexto else "")
    return HTTPException(status_code=500, detail=_MENSAGEM_GENERICA)


# ─── Erros de domínio → HTTP (D-697) ────────────────────────────────────────
#
# O corpo continua `{"detail": mensagem}`, o mesmo do HTTPException: a tela mostra
# o corpo da resposta, e trocá-lo aqui mudaria o que o operador lê.

_STATUS_POR_SIGNIFICADO: dict[type[ErroDeDominio], int] = {
    PedidoInvalido: 400,
    NaoEncontrado: 404,
    ServicoExternoFalhou: 502,
    ConfiguracaoAusente: 500,
}


def _status_de(erro: ErroDeDominio) -> int:
    for classe in type(erro).__mro__:
        if classe in _STATUS_POR_SIGNIFICADO:
            return _STATUS_POR_SIGNIFICADO[classe]
    logger.warning("Erro de domínio sem status mapeado: %s", type(erro).__name__)
    return 500


async def responder_erro_de_dominio(_request: Request, erro: ErroDeDominio) -> JSONResponse:
    return JSONResponse(status_code=_status_de(erro), content={"detail": str(erro)})


def registrar_tratadores(app: FastAPI) -> None:
    """Liga os erros de domínio ao HTTP. O boot chama; os testes de router também."""
    app.add_exception_handler(ErroDeDominio, responder_erro_de_dominio)
