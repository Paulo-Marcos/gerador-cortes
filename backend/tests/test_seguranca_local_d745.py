"""A API só atende quem está nesta máquina (D-745).

Antes: CORS "*" e escuta em 0.0.0.0. O preflight de um DELETE vindo de
`https://site-qualquer.example` era aprovado, e qualquer página aberta no
navegador do usuário mexia na API local, que não tem login.
"""

import pytest
from app.seguranca_local import (
    ORIGEM_LOCAL_REGEX,
    GuardaDeOrigemLocal,
    host_e_local,
    motivo_da_recusa,
    origem_e_local,
)
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

ESTRANHA = "https://site-qualquer.example"


@pytest.mark.parametrize(
    "host",
    ["localhost", "localhost:8000", "127.0.0.1:8001", "[::1]:8000", "LOCALHOST", "testserver"],
)
def test_hosts_locais(host):
    assert host_e_local(host)


@pytest.mark.parametrize("host", ["evil.example", "evil.example:8000", "192.168.0.10:8000", ""])
def test_hosts_de_fora(host):
    assert not host_e_local(host)


@pytest.mark.parametrize(
    ("origem", "local"),
    [
        ("http://localhost:4300", True),
        ("http://localhost:3057", True),  # porta sorteada pelo renderer
        ("http://127.0.0.1:3200", True),
        ("http://[::1]:4300", True),
        (ESTRANHA, False),
        ("http://localhost.evil.example", False),
        ("null", False),  # file:// e iframes isolados
    ],
)
def test_origens(origem, local):
    assert origem_e_local(origem) is local


def test_leitura_de_origem_estranha_passa_escrita_nao():
    assert motivo_da_recusa("http", "GET", "localhost:8000", ESTRANHA) is None
    assert "origem" in motivo_da_recusa("http", "POST", "localhost:8000", ESTRANHA)
    assert "origem" in motivo_da_recusa("http", "DELETE", "localhost:8000", ESTRANHA)
    assert "origem" in motivo_da_recusa("websocket", "GET", "localhost:8000", ESTRANHA)


def test_sem_origin_passa():
    # curl, scripts e o worker não mandam Origin — são processos da própria máquina.
    assert motivo_da_recusa("http", "POST", "localhost:8000", None) is None


def _app_de_teste() -> TestClient:
    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origin_regex=ORIGEM_LOCAL_REGEX, allow_methods=["*"])
    app.add_middleware(GuardaDeOrigemLocal)

    @app.delete("/coisa")
    def apagar():
        return {"ok": True}

    @app.get("/coisa")
    def ler():
        return {"ok": True}

    @app.websocket("/ws")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        await websocket.send_text("oi")
        await websocket.close()

    return TestClient(app)


def test_app_recusa_delete_de_site_estranho_e_aceita_do_frontend():
    cliente = _app_de_teste()
    assert cliente.delete("/coisa", headers={"Origin": ESTRANHA}).status_code == 403
    assert cliente.delete("/coisa", headers={"Origin": "http://localhost:4300"}).status_code == 200
    assert cliente.delete("/coisa").status_code == 200


def test_app_nao_libera_cors_para_site_estranho():
    cliente = _app_de_teste()
    preflight = {"Origin": ESTRANHA, "Access-Control-Request-Method": "DELETE"}
    resposta = cliente.options("/coisa", headers=preflight)
    assert "access-control-allow-origin" not in resposta.headers

    local = {"Origin": "http://localhost:3057", "Access-Control-Request-Method": "DELETE"}
    resposta = cliente.options("/coisa", headers=local)
    assert resposta.headers["access-control-allow-origin"] == "http://localhost:3057"


def test_app_recusa_host_de_rebinding():
    cliente = _app_de_teste()
    assert cliente.get("/coisa", headers={"Host": "evil.example:8000"}).status_code == 400


def test_app_fecha_websocket_de_site_estranho():
    cliente = _app_de_teste()
    with cliente.websocket_connect("/ws", headers={"Origin": "http://localhost:4300"}) as ws:
        assert ws.receive_text() == "oi"
    with pytest.raises(WebSocketDisconnect):
        with cliente.websocket_connect("/ws", headers={"Origin": ESTRANHA}) as ws:
            ws.receive_text()


def test_app_real_tem_a_guarda():
    from app.main import app

    assert any(m.cls is GuardaDeOrigemLocal for m in app.user_middleware)
