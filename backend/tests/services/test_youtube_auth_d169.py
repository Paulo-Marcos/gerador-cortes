"""D-169: conexão OAuth do YouTube pela UI (serviço youtube_auth).

Cobre os caminhos testáveis sem abrir navegador:
- status() sem token -> desconectado; reflete presença do client_secrets;
- status() com credencial válida -> conectado + título do canal;
- desconectar() remove o token do canal ativo;
- iniciar_conexao() falha cedo sem client_secrets e respeita single-flight.
"""

import os

import pytest
from app.services import youtube_auth

_porta_real = youtube_auth._porta_em_uso


def _apontar_credenciais(monkeypatch, tmp_path, *, com_client_secrets: bool):
    token = tmp_path / "youtube" / "token.json"
    client = tmp_path / "client_secrets.json"
    token.parent.mkdir(parents=True, exist_ok=True)
    if com_client_secrets:
        client.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(youtube_auth, "youtube_token_path", lambda: token)
    monkeypatch.setattr(youtube_auth, "youtube_client_secrets_path", lambda: client)
    # hermético: a porta real do OAuth pode estar ocupada na máquina de quem roda
    monkeypatch.setattr(youtube_auth, "_porta_em_uso", lambda porta: False)
    # estado global limpo entre testes
    youtube_auth._estado.em_andamento = False
    youtube_auth._estado.erro = None
    return token, client


def test_status_sem_token_desconectado(tmp_path, monkeypatch):
    _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
    monkeypatch.setattr(youtube_auth, "_carregar_credenciais_validas", lambda: None)

    st = youtube_auth.status()
    assert st["conectado"] is False
    assert st["canal_titulo"] == ""
    assert st["cliente_configurado"] is True
    assert st["fluxo_em_andamento"] is False
    assert st["client_secrets_destino"].endswith("client_secrets.json")


def test_status_conectado_com_titulo(tmp_path, monkeypatch):
    _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
    creds_fake = object()
    monkeypatch.setattr(youtube_auth, "_carregar_credenciais_validas", lambda: creds_fake)
    monkeypatch.setattr(youtube_auth, "_titulo_canal_autenticado", lambda c: "Meu Canal")

    st = youtube_auth.status()
    assert st["conectado"] is True
    assert st["canal_titulo"] == "Meu Canal"


def test_desconectar_remove_token(tmp_path, monkeypatch):
    token, _ = _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
    token.write_text("{}", encoding="utf-8")
    assert token.exists()

    resultado = youtube_auth.desconectar()
    assert resultado["status"] == "ok"
    assert not token.exists()


def test_conectar_sem_client_secrets_falha(tmp_path, monkeypatch):
    _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=False)

    resultado = youtube_auth.iniciar_conexao()
    assert resultado["status"] == "erro"
    assert youtube_auth._estado.em_andamento is False
    assert str(tmp_path) in resultado["mensagem"], "diz onde salvar o arquivo"


def test_conectar_single_flight(tmp_path, monkeypatch):
    _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
    youtube_auth._estado.em_andamento = True  # simula fluxo em curso

    resultado = youtube_auth.iniciar_conexao()
    assert resultado["status"] == "em_andamento"


def test_conectar_com_porta_ocupada_explica_como_resolver(tmp_path, monkeypatch):
    """D-626: porta do OAuth presa por outro programa vira mensagem acionável."""
    import socket

    _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
    monkeypatch.setattr(youtube_auth, "_porta_em_uso", _porta_real)  # teste real, sem stub
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as ocupante:
        ocupante.bind(("localhost", 0))
        ocupante.listen()
        porta = ocupante.getsockname()[1]
        monkeypatch.setattr(youtube_auth.settings, "youtube_oauth_port", porta)

        resultado = youtube_auth.iniciar_conexao()

    assert resultado["status"] == "erro"
    assert str(porta) in resultado["mensagem"]
    assert "YOUTUBE_OAUTH_PORT" in resultado["mensagem"]
    assert youtube_auth._estado.em_andamento is False


def test_porta_livre_nao_e_reportada_em_uso():
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("localhost", 0))
        porta = s.getsockname()[1]
    assert _porta_real(porta) is False


# ─── D-646: status barato e fora do event loop ──────────────────────────────


class TestTituloEmCache:
    """O título do canal é a única parte cara do status — e a que menos muda."""

    def _conectado(self, monkeypatch, tmp_path, titulo="Meu Canal"):
        token, _ = _apontar_credenciais(monkeypatch, tmp_path, com_client_secrets=True)
        token.write_text("{}", encoding="utf-8")
        monkeypatch.setattr(youtube_auth, "_carregar_credenciais_validas", lambda: object())
        chamadas = []

        def falar_com_o_google(_creds):
            chamadas.append(1)
            return titulo

        monkeypatch.setattr(youtube_auth, "_titulo_canal_autenticado", falar_com_o_google)
        youtube_auth._esquecer_titulo_em_cache()
        return token, chamadas

    def test_polls_seguidos_falam_com_o_google_uma_vez_so(self, tmp_path, monkeypatch):
        _token, chamadas = self._conectado(monkeypatch, tmp_path)

        titulos = [youtube_auth.status()["canal_titulo"] for _ in range(5)]

        assert titulos == ["Meu Canal"] * 5
        assert len(chamadas) == 1, "a tela pergunta de 2 em 2s; o Google não precisa ouvir tudo"

    def test_token_reescrito_refaz_a_consulta(self, tmp_path, monkeypatch):
        token, chamadas = self._conectado(monkeypatch, tmp_path)
        youtube_auth.status()

        os.utime(token, (0, 0))  # renovação do token reescreve o arquivo
        youtube_auth.status()

        assert len(chamadas) == 2

    def test_falha_de_rede_nao_vira_cache(self, tmp_path, monkeypatch):
        _token, chamadas = self._conectado(monkeypatch, tmp_path, titulo="")

        youtube_auth.status()
        youtube_auth.status()

        assert len(chamadas) == 2, "título vazio não pode grudar: a próxima tentativa vale"

    def test_desconectar_esquece_o_titulo_da_conta_anterior(self, tmp_path, monkeypatch):
        _token, _chamadas = self._conectado(monkeypatch, tmp_path)
        youtube_auth.status()

        youtube_auth.desconectar()

        assert youtube_auth._titulo_em_cache is None


@pytest.mark.asyncio
async def test_status_nao_roda_no_event_loop(tmp_path, monkeypatch):
    """D-646: o GET do status lê disco e fala com o Google — nunca no loop."""
    import threading

    from app.routers import youtube_browser

    def status_falso():
        assert threading.current_thread() is not threading.main_thread(), (
            "o status do YouTube voltou para o event loop"
        )
        return {"conectado": False}

    monkeypatch.setattr(youtube_browser.youtube_auth, "status", status_falso)

    assert await youtube_browser.youtube_auth_status() == {"conectado": False}
