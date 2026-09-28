"""Guarda de origem local: a API só atende quem está nesta máquina (D-745).

O app não tem login — quem alcança a API faz tudo que a tela faz, inclusive
publicar na conta do YouTube conectada. Escutar só em 127.0.0.1 tira a rede da
jogada, mas sobra o navegador do próprio usuário: qualquer página aberta nele
pode mandar requisições para `localhost`. O CORS só impede a página de LER a
resposta; três portas continuam abertas sem esta guarda:

- o POST "simples" (sem corpo JSON), que o navegador envia sem pré-checagem;
- o WebSocket, que o navegador não protege com CORS;
- o DNS rebinding: um domínio do atacante que resolve para 127.0.0.1 faz a
  página parecer "da mesma origem" — e aí até o GET é lido.

A guarda recusa Host que não seja local (fecha o rebinding), método que muda
dados vindo de origem não local, e WebSocket de origem não local. Leitura (GET)
que o navegador marca como vinda de outro site (`Sec-Fetch-Site: cross-site`,
sem Origin local) também é recusada (D-814): o CORS impede o site de ver a
resposta, mas não impede a GET de rodar — e há GET que dispara ffmpeg.
"""

import json
from urllib.parse import urlsplit

HOSTS_LOCAIS = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "::1",
        # Host fixo do TestClient do Starlette. Não é um nome que se registra em
        # DNS público, então não abre o rebinding.
        "testserver",
    }
)
_METODOS_DE_LEITURA = frozenset({"GET", "HEAD", "OPTIONS"})

# Qualquer porta: o renderer do Remotion serve o bundle numa porta sorteada
# entre 3000 e 3100, e o frontend e o Studio têm as suas.
ORIGEM_LOCAL_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"


def _sem_porta(host: str) -> str:
    if host.startswith("["):
        return host[1 : host.find("]")] if "]" in host else host
    return host.rsplit(":", 1)[0] if host.count(":") == 1 else host


def host_e_local(host: str) -> bool:
    return _sem_porta(host.strip().lower()) in HOSTS_LOCAIS


def origem_e_local(origem: str) -> bool:
    partes = urlsplit(origem.strip().lower())
    return partes.scheme in ("http", "https") and (partes.hostname or "") in HOSTS_LOCAIS


def motivo_da_recusa(
    tipo: str,
    metodo: str,
    host: str,
    origem: str | None,
    sec_fetch_site: str | None = None,
    referer: str | None = None,
) -> str | None:
    """Por que recusar esta requisição, ou None se ela pode seguir."""
    if not host_e_local(host):
        return f"host não local: {host!r}"
    if origem is not None and origem_e_local(origem):
        return None
    # D-814: `<img>`/`<audio>` de um site qualquer manda GET SEM Origin — e há
    # GET que roda ffmpeg. O navegador marca essas requisições com
    # Sec-Fetch-Site: cross-site (o JavaScript não forja). O app chega por /api
    # no mesmo servidor do Vite (same-origin); curl, worker e testes não mandam
    # a marca.
    # O Referer local salva a tela aberta em 127.0.0.1 com a API em localhost
    # (o <video> dela não manda Origin); um site pode suprimir o Referer, não
    # fazê-lo parecer local.
    if (sec_fetch_site or "").lower() == "cross-site" and not origem_e_local(referer or ""):
        return "requisição disparada por outro site"
    if origem is None:
        return None
    if tipo == "websocket" or metodo.upper() not in _METODOS_DE_LEITURA:
        return f"origem não local: {origem!r}"
    return None


class GuardaDeOrigemLocal:
    """Middleware ASGI puro: não bufferiza corpo, então não atrapalha streaming."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        cabecalhos = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
        motivo = motivo_da_recusa(
            scope["type"],
            scope.get("method", "GET"),
            cabecalhos.get("host", ""),
            cabecalhos.get("origin"),
            cabecalhos.get("sec-fetch-site"),
            cabecalhos.get("referer"),
        )
        if motivo is None:
            await self.app(scope, receive, send)
            return

        if scope["type"] == "websocket":
            await receive()  # o websocket.connect precisa ser lido antes do close
            await send({"type": "websocket.close", "code": 1008})
            return

        status = 400 if motivo.startswith("host") else 403
        corpo = json.dumps({"detail": f"Recusado pela guarda local: {motivo}"}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": corpo})
