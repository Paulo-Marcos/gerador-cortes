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

import logging
import socket
import threading
from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.core.channel_paths import youtube_client_secrets_path, youtube_token_path
from app.infrastructure import youtube_api
from app.infrastructure.youtube_api import Credenciais

# Mesmos escopos do upload (services/youtube.py) — upload + gestão de playlists.
logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
]


def _porta_em_uso(porta: int) -> bool:
    """O `run_local_server` sobe um servidor nessa porta; se outro programa a
    ocupa, o login falha com um OSError genérico. Testar antes dá uma mensagem útil."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("localhost", porta))
        except OSError:
            return True
    return False


@dataclass
class _EstadoFluxo:
    """Estado, em memória, do fluxo de login em andamento (para a UI pollar)."""

    em_andamento: bool = False
    erro: str | None = None


_estado = _EstadoFluxo()
_lock = threading.Lock()


def _carregar_credenciais_validas() -> Credenciais | None:
    """Lê o `token.json` do canal ativo e o renova se expirado; None se ausente/ruim."""
    token_path = youtube_token_path()
    if not token_path.exists():
        return None
    try:
        creds = youtube_api.credenciais_do_arquivo(token_path, SCOPES)
    except Exception:
        return None

    if creds.valid:
        return creds
    if creds.expired and creds.refresh_token:
        try:
            youtube_api.renovar(creds)
            token_path.write_text(creds.to_json(), encoding="utf-8")
            return creds
        except Exception:
            return None
    return None


# D-646: o título do canal é a ÚNICA parte do status que custa uma chamada de
# rede, e é a que menos muda — o nome do canal não muda entre dois polls de 2s.
# A chave é o token: enquanto ele for o mesmo arquivo com a mesma data, a conta
# é a mesma. Renovar o token reescreve o arquivo e invalida o cache sozinho.
_TituloEmCache = tuple[str, float, str]
_titulo_em_cache: _TituloEmCache | None = None


def _assinatura_do_token() -> tuple[str, float]:
    token_path = youtube_token_path()
    try:
        return (str(token_path), token_path.stat().st_mtime)
    except OSError:
        return (str(token_path), 0.0)


def _titulo_do_canal(creds: Credenciais) -> str:
    """Título do canal, reaproveitando o da última consulta ao mesmo token."""
    global _titulo_em_cache
    caminho, mtime = _assinatura_do_token()
    if _titulo_em_cache and _titulo_em_cache[:2] == (caminho, mtime):
        return _titulo_em_cache[2]

    titulo = _titulo_canal_autenticado(creds)
    # Falha de rede não vira cache: senão um título vazio ficaria grudado.
    if titulo:
        _titulo_em_cache = (caminho, mtime, titulo)
    return titulo


def _esquecer_titulo_em_cache() -> None:
    global _titulo_em_cache
    _titulo_em_cache = None


def _titulo_canal_autenticado(creds: Credenciais) -> str:
    """Título do canal do YouTube autenticado (best-effort; vazio em qualquer falha)."""
    try:
        return youtube_api.titulo_do_canal(creds)
    except Exception as erro:  # noqa: BLE001 — o selo é acessório; o log não é
        # D-654: sem isto, um token expirado ou uma cota estourada apareciam
        # apenas como "o nome do canal sumiu da tela", sem pista nenhuma.
        logger.warning("[YouTubeAuth] não consegui ler o nome do canal: %s", erro)
    return ""


def status() -> dict:
    """Estado da conexão do YouTube para o canal ativo.

    Retorna se há um token válido, o título do canal autenticado (quando conectado)
    e se um fluxo de login está em andamento (para a UI parar/continuar o poll).
    """
    creds = _carregar_credenciais_validas()
    conectado = creds is not None
    client_secrets = youtube_client_secrets_path()
    return {
        "conectado": conectado,
        "canal_titulo": _titulo_do_canal(creds) if creds else "",
        "cliente_configurado": client_secrets.exists(),
        # D-628: o tutorial mostra ONDE salvar o arquivo, e não "na raiz do backend"
        # — quem instalou o app não sabe qual é a raiz, e o canal pode ter a sua.
        "client_secrets_destino": str(client_secrets),
        "fluxo_em_andamento": _estado.em_andamento,
        "erro": _estado.erro,
    }


def _executar_fluxo(client_secrets_path: str, token_path_str: str) -> None:
    """Roda o fluxo OAuth bloqueante e grava o token — alvo da thread daemon."""
    try:
        creds = youtube_api.autorizar_no_navegador(
            client_secrets_path, SCOPES, settings.youtube_oauth_port
        )
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
                f"(App para computador) do Google Cloud e salve em {client_secrets_path}. "
                "O passo a passo está em Canais, no cartão do canal ativo."
            ),
        }

    porta = settings.youtube_oauth_port
    if _porta_em_uso(porta):
        return {
            "status": "erro",
            "mensagem": (
                f"A porta {porta} do login do YouTube está em uso por outro programa. "
                "Feche-o ou defina YOUTUBE_OAUTH_PORT com outra porta no .env do backend."
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
    # Conta trocada: o título da anterior não pode sobreviver ao logout (D-646).
    _esquecer_titulo_em_cache()
    with _lock:
        _estado.erro = None
    return {"status": "ok", "mensagem": "YouTube desconectado."}
