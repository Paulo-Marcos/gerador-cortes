"""Conexão OAuth do YouTube por canal (D-169).

Login sob demanda pela UI, em vez do script de terminal `dev-utils/auth_youtube.py`:
dispara o fluxo `InstalledAppFlow` (abre o navegador do usuário — o app roda em
localhost) numa thread e grava o `token.json` na pasta do canal ATIVO, resolvido
por `channel_paths.youtube_token_path()` (D-168). O `client_secrets.json` (crachá
do app) é compartilhado na raiz do backend.

O fluxo `run_local_server` BLOQUEIA até o usuário consentir, então roda numa thread
daemon e o estado (`em_andamento`/`erro`) fica em memória para a UI pollar via
`GET /auth/status`. Apenas UM fluxo por vez (a porta local do OAuth é única).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path

from app.channel_paths import youtube_client_secrets_path, youtube_token_path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Mesmos escopos do upload (services/youtube.py) — upload + gestão de playlists.
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
]

# Porta local onde o fluxo OAuth captura o redirect (mesma do auth_youtube.py).
_OAUTH_PORT = 8080


@dataclass
class _EstadoFluxo:
    """Estado, em memória, do fluxo de login em andamento (para a UI pollar)."""

    em_andamento: bool = False
    erro: str | None = None


_estado = _EstadoFluxo()
_lock = threading.Lock()


def _carregar_credenciais_validas() -> Credentials | None:
    """Lê o `token.json` do canal ativo e o renova se expirado; None se ausente/ruim."""
    token_path = youtube_token_path()
    if not token_path.exists():
        return None
    try:
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
    except Exception:
        return None

    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            token_path.write_text(creds.to_json(), encoding="utf-8")
            return creds
        except Exception:
            return None
    return None


def _titulo_canal_autenticado(creds: Credentials) -> str:
    """Título do canal do YouTube autenticado (best-effort; vazio em qualquer falha)."""
    try:
        youtube = build("youtube", "v3", credentials=creds)
        resp = youtube.channels().list(part="snippet", mine=True, maxResults=1).execute()
        items = resp.get("items", [])
        if items:
            return items[0].get("snippet", {}).get("title", "")
    except Exception:
        pass
    return ""


def status() -> dict:
    """Estado da conexão do YouTube para o canal ativo.

    Retorna se há um token válido, o título do canal autenticado (quando conectado)
    e se um fluxo de login está em andamento (para a UI parar/continuar o poll).
    """
    creds = _carregar_credenciais_validas()
    conectado = creds is not None
    return {
        "conectado": conectado,
        "canal_titulo": _titulo_canal_autenticado(creds) if creds else "",
        "cliente_configurado": youtube_client_secrets_path().exists(),
        "fluxo_em_andamento": _estado.em_andamento,
        "erro": _estado.erro,
    }


def _executar_fluxo(client_secrets_path: str, token_path_str: str) -> None:
    """Roda o fluxo OAuth bloqueante e grava o token — alvo da thread daemon."""
    try:
        flow = InstalledAppFlow.from_client_secrets_file(client_secrets_path, SCOPES)
        creds = flow.run_local_server(port=_OAUTH_PORT)
        token_path = Path(token_path_str)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")
        with _lock:
            _estado.erro = None
    except Exception as exc:  # noqa: BLE001 — qualquer falha vira estado de erro p/ UI
        with _lock:
            _estado.erro = str(exc)
    finally:
        with _lock:
            _estado.em_andamento = False


def iniciar_conexao() -> dict:
    """Dispara o login OAuth do canal ativo numa thread daemon (single-flight).

    Retorna imediatamente: a UI acompanha o progresso via `status()`. Falha cedo
    se o `client_secrets.json` não existir ou se já houver um fluxo em andamento.
    """
    client_secrets_path = youtube_client_secrets_path()
    if not client_secrets_path.exists():
        return {
            "status": "erro",
            "mensagem": (
                "client_secrets.json não encontrado. Baixe as credenciais OAuth "
                "(Desktop app) do Google Cloud e salve na raiz do backend."
            ),
        }

    with _lock:
        if _estado.em_andamento:
            return {"status": "em_andamento", "mensagem": "Já existe um login em andamento."}
        _estado.em_andamento = True
        _estado.erro = None

    thread = threading.Thread(
        target=_executar_fluxo,
        args=(str(client_secrets_path), str(youtube_token_path())),
        name="youtube-oauth-flow",
        daemon=True,
    )
    thread.start()
    return {"status": "iniciado", "mensagem": "Login iniciado — conclua no navegador."}


def desconectar() -> dict:
    """Remove o `token.json` do canal ativo (desconecta a conta)."""
    token_path = youtube_token_path()
    if token_path.exists():
        try:
            token_path.unlink()
        except OSError as exc:
            return {"status": "erro", "mensagem": f"Não foi possível remover o token: {exc}"}
    with _lock:
        _estado.erro = None
    return {"status": "ok", "mensagem": "YouTube desconectado."}
