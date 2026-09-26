"""O que os services pedem às bibliotecas do Google (D-696).

Teste de caracterização, antes de o googleapiclient e o google-auth saírem do
youtube_auth e do destinos_shorts para um adaptador da infraestrutura: o token
lido e renovado, o título do canal, a autorização no navegador e a capa do
short. As bibliotecas do Google são trocadas nas próprias classes, que são o
mesmo objeto antes e depois do movimento.
"""

from __future__ import annotations

import googleapiclient.discovery
import googleapiclient.http
import pytest
from app.services import youtube_auth
from app.services.destinos_shorts import DestinoYouTubeShorts
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow


class _Creds:
    def __init__(self, *, valid=True, expired=False, refresh_token="r", falha_ao_renovar=False):
        self.valid = valid
        self.expired = expired
        self.refresh_token = refresh_token
        self.falha_ao_renovar = falha_ao_renovar
        self.renovado = False

    def refresh(self, _request):
        if self.falha_ao_renovar:
            raise RuntimeError("sem rede")
        self.renovado = True
        self.valid = True

    def to_json(self):
        return '{"token": "novo"}'


@pytest.fixture
def token(tmp_path, monkeypatch):
    caminho = tmp_path / "token.json"
    monkeypatch.setattr(youtube_auth, "youtube_token_path", lambda: caminho)
    return caminho


def _ler_token_como(monkeypatch, creds_ou_erro):
    def ler(_arquivo, _scopes):
        if isinstance(creds_ou_erro, Exception):
            raise creds_ou_erro
        return creds_ou_erro

    monkeypatch.setattr(Credentials, "from_authorized_user_file", staticmethod(ler))


def test_token_valido_volta_como_esta(token, monkeypatch):
    token.write_text("{}", encoding="utf-8")
    creds = _Creds()
    _ler_token_como(monkeypatch, creds)

    assert youtube_auth._carregar_credenciais_validas() is creds
    assert creds.renovado is False


def test_token_vencido_e_renovado_e_regravado(token, monkeypatch):
    token.write_text("{}", encoding="utf-8")
    creds = _Creds(valid=False, expired=True)
    _ler_token_como(monkeypatch, creds)

    assert youtube_auth._carregar_credenciais_validas() is creds
    assert creds.renovado is True
    assert token.read_text(encoding="utf-8") == '{"token": "novo"}'


@pytest.mark.parametrize(
    "situacao",
    ["sem_arquivo", "arquivo_ruim", "falha_ao_renovar", "vencido_sem_refresh"],
)
def test_token_que_nao_serve_vira_none(token, monkeypatch, situacao):
    if situacao != "sem_arquivo":
        token.write_text("{}", encoding="utf-8")
    if situacao == "arquivo_ruim":
        _ler_token_como(monkeypatch, ValueError("json ruim"))
    elif situacao == "falha_ao_renovar":
        _ler_token_como(monkeypatch, _Creds(valid=False, expired=True, falha_ao_renovar=True))
    elif situacao == "vencido_sem_refresh":
        _ler_token_como(monkeypatch, _Creds(valid=False, expired=True, refresh_token=None))

    assert youtube_auth._carregar_credenciais_validas() is None


class _ApiDoCanal:
    def __init__(self, resposta=None, erro=None):
        self.resposta, self.erro, self.pedido = resposta, erro, None

    def channels(self):
        return self

    def list(self, **pedido):
        self.pedido = pedido
        return self

    def execute(self):
        if self.erro:
            raise self.erro
        return self.resposta


def test_titulo_do_canal_autenticado(monkeypatch):
    api = _ApiDoCanal({"items": [{"snippet": {"title": "Meu Canal"}}]})
    monkeypatch.setattr(youtube_auth, "build", lambda *a, **k: api, raising=False)
    monkeypatch.setattr(googleapiclient.discovery, "build", lambda *a, **k: api)

    assert youtube_auth._titulo_canal_autenticado("creds") == "Meu Canal"
    assert api.pedido == {"part": "snippet", "mine": True, "maxResults": 1}


def test_titulo_do_canal_vazio_quando_a_api_falha(monkeypatch):
    api = _ApiDoCanal(erro=RuntimeError("cota"))
    monkeypatch.setattr(youtube_auth, "build", lambda *a, **k: api, raising=False)
    monkeypatch.setattr(googleapiclient.discovery, "build", lambda *a, **k: api)

    assert youtube_auth._titulo_canal_autenticado("creds") == ""


def test_autorizar_no_navegador_grava_o_token_e_limpa_o_erro(tmp_path, monkeypatch):
    pedidos = {}

    class _Fluxo:
        def run_local_server(self, port):
            pedidos["porta"] = port
            return _Creds()

    def de_arquivo(caminho, scopes):
        pedidos["segredos"] = caminho
        return _Fluxo()

    monkeypatch.setattr(InstalledAppFlow, "from_client_secrets_file", staticmethod(de_arquivo))
    monkeypatch.setattr(youtube_auth.settings, "youtube_oauth_port", 8123)
    youtube_auth._estado.erro = "antigo"
    youtube_auth._estado.em_andamento = True
    destino = tmp_path / "canal" / "token.json"

    youtube_auth._executar_fluxo("segredos.json", str(destino))

    assert destino.read_text(encoding="utf-8") == '{"token": "novo"}'
    assert pedidos == {"segredos": "segredos.json", "porta": 8123}
    assert (youtube_auth._estado.erro, youtube_auth._estado.em_andamento) == (None, False)


def test_capa_do_short_vai_para_o_video(monkeypatch):
    chamadas = {}

    class _ApiDaCapa:
        def thumbnails(self):
            return self

        def set(self, **pedido):
            chamadas["set"] = pedido
            return self

        def execute(self):
            chamadas["executou"] = True

    def midia(dados, mimetype):
        chamadas["midia"] = (dados, mimetype)
        return "midia"

    monkeypatch.setattr(googleapiclient.discovery, "build", lambda *a, **k: _ApiDaCapa())
    monkeypatch.setattr(googleapiclient.http, "MediaInMemoryUpload", midia)

    DestinoYouTubeShorts._subir_capa("creds", "vid1", b"jpeg", "image/jpeg")

    assert chamadas == {
        "midia": (b"jpeg", "image/jpeg"),
        "set": {"videoId": "vid1", "media_body": "midia"},
        "executou": True,
    }
