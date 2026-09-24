"""O YouTube com a conta do operador: credenciais OAuth, canal e envio (D-696).

As bibliotecas do Google (google-auth, google-auth-oauthlib e googleapiclient)
eram importadas pelos services. Aqui ficam as operações que eles pedem — ler e
renovar o token, autorizar no navegador, ler o título do canal, enviar o vídeo
em partes e colar a capa —, e a regra de cada caso de uso fica no service.

O `build` e as classes de mídia são lidos do módulo do googleapiclient na hora
da chamada, e não importados por nome: é por ali que os testes trocam o Google.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient import discovery
from googleapiclient import http as google_http

Credenciais = Credentials

_PARTE_DO_UPLOAD = 8 * 1024 * 1024


def credenciais_do_arquivo(caminho: Path, scopes: list[str]) -> Credentials:
    return Credentials.from_authorized_user_file(str(caminho), scopes)


def renovar(creds: Credentials) -> None:
    creds.refresh(Request())


def autorizar_no_navegador(client_secrets_path: str, scopes: list[str], porta: int) -> Credentials:
    """Abre o login do Google no navegador e espera a volta na porta local."""
    flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, scopes)
    return flow.run_local_server(port=porta)


def titulo_do_canal(creds) -> str:
    """Título do canal da conta; vazio se ela não tiver canal. Falha de rede sobe."""
    resp = _cliente(creds).channels().list(part="snippet", mine=True, maxResults=1).execute()
    items = resp.get("items", [])
    if items:
        return items[0].get("snippet", {}).get("title", "")
    return ""


def enviar_video(creds, arquivo: Path, corpo: dict, ao_progredir: Callable[[int], None]) -> str:
    """Envia o vídeo em partes de 8 MB e devolve o id; `ao_progredir` recebe o %."""
    media = google_http.MediaFileUpload(
        str(arquivo), chunksize=_PARTE_DO_UPLOAD, resumable=True, mimetype="video/mp4"
    )
    requisicao = (
        _cliente(creds).videos().insert(part="snippet,status", body=corpo, media_body=media)
    )
    resposta = None
    while resposta is None:
        progresso, resposta = requisicao.next_chunk()
        if progresso:
            ao_progredir(int(progresso.progress() * 100))
    return resposta["id"]


def definir_capa(creds, video_id: str, dados: bytes, mimetype: str) -> None:
    _cliente(creds).thumbnails().set(
        videoId=video_id, media_body=google_http.MediaInMemoryUpload(dados, mimetype=mimetype)
    ).execute()


def _cliente(creds):
    return discovery.build("youtube", "v3", credentials=creds)
