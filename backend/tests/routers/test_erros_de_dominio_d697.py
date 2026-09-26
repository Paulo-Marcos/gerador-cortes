"""O tratador global dos erros de domínio (D-697).

Cada erro sai pelo significado com o status certo, e o corpo continua o de
sempre — `{"detail": mensagem}` —, porque a tela mostra o corpo da resposta.
"""

import pytest
from app.domain.compartilhado.erros import (
    ConfiguracaoAusente,
    ErroDeDominio,
    NaoEncontrado,
    ServicoExternoFalhou,
)
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


class _SemSignificadoMapeado(ErroDeDominio):
    pass


class _CanalSumiu(NaoEncontrado):
    """Um erro específico herda o status do significado."""


def _cliente(erro: Exception) -> TestClient:
    app = FastAPI()
    registrar_tratadores(app)

    @app.get("/falha")
    async def falha():
        raise erro

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize(
    ("erro", "status"),
    [
        (NaoEncontrado("Canal '@x' não encontrado"), 404),
        (_CanalSumiu("sumiu"), 404),
        (ServicoExternoFalhou("Erro na YouTube API (search): quebrou"), 502),
        (ConfiguracaoAusente("youtube_api_key não configurada no .env"), 500),
        (_SemSignificadoMapeado("sem mapa"), 500),
    ],
)
def test_o_status_sai_do_significado_e_o_corpo_e_o_de_sempre(erro, status):
    resposta = _cliente(erro).get("/falha")

    assert resposta.status_code == status
    assert resposta.json() == {"detail": str(erro)}


def test_http_exception_segue_como_antes():
    resposta = _cliente(HTTPException(status_code=418, detail="bule")).get("/falha")

    assert (resposta.status_code, resposta.json()) == (418, {"detail": "bule"})
