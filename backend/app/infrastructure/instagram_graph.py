"""O cliente da API de publicação do Instagram (D-802).

Fala HTTP com a Meta e mais nada: nenhuma regra de quando publicar, nenhum
arquivo do projeto. Quem decide mora em `services/instagram_api.py`.

## O caminho de um Reel

1. `criar_container` — a Meta reserva um "container" e devolve o endereço de
   upload (upload retomável: o vídeo vai do disco, sem precisar de link público);
2. `enviar_video` — os bytes do MP4 para esse endereço;
3. `status_do_container` — a Meta processa; só se publica o que está FINISHED;
4. `publicar` — o container vira post;
5. `permalink` — o link do post, para a tela oferecer o "ver".

## Dois hosts, um contrato

O token do login do Instagram (`IGAA…`, o que o operador gerou em 28/09/2026)
fala com `graph.instagram.com`; o do login do Facebook (`EAA…`), com
`graph.facebook.com`. Os caminhos e campos são os mesmos.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

VERSAO_DA_API = "v23.0"
_TIMEOUT_S = 60.0
# Upload de vídeo: o tempo é o do arquivo inteiro atravessando a rede.
_TIMEOUT_DO_ENVIO_S = 900.0


class ErroDoInstagram(RuntimeError):
    """A Meta recusou; a mensagem é a dela, que costuma dizer o que fazer."""


@dataclass(frozen=True)
class Container:
    id: str
    endereco_de_envio: str


def _host(token: str) -> str:
    """O host da Graph API para este token (ver "Dois hosts")."""
    if token.startswith("EAA"):
        return "https://graph.facebook.com"
    return "https://graph.instagram.com"


def _api(token: str, caminho: str) -> str:
    return f"{_host(token)}/{VERSAO_DA_API}/{caminho}"


def _cliente(token: str, timeout: float = _TIMEOUT_S) -> httpx.Client:
    """O token vai no CABEÇALHO, nunca na URL: o `httpx` loga a URL de cada
    requisição em INFO, e um token na query acabaria nos arquivos de log."""
    return httpx.Client(timeout=timeout, headers={"Authorization": f"Bearer {token}"})


def _resposta(resposta: httpx.Response) -> dict:
    try:
        corpo = resposta.json()
    except ValueError:
        corpo = {}
    if resposta.is_error or "error" in corpo:
        erro = corpo.get("error") or {}
        mensagem = erro.get("error_user_msg") or erro.get("message") or resposta.text[:300]
        raise ErroDoInstagram(f"Instagram recusou ({resposta.status_code}): {mensagem}")
    return corpo


def quem_sou(token: str) -> tuple[str, str]:
    """`(id_da_conta, @usuario)` dono deste token."""
    with _cliente(token) as http:
        corpo = _resposta(http.get(_api(token, "me"), params={"fields": "user_id,username"}))
    return str(corpo.get("user_id") or corpo.get("id") or ""), str(corpo.get("username") or "")


def criar_container(
    token: str, conta: str, *, legenda: str, capa_url: str = "", no_feed: bool = True
) -> Container:
    """Reserva o Reel na Meta e devolve onde mandar o vídeo."""
    parametros = {
        "media_type": "REELS",
        "upload_type": "resumable",
        "caption": legenda,
        "share_to_feed": "true" if no_feed else "false",
    }
    if capa_url:
        parametros["cover_url"] = capa_url
    with _cliente(token) as http:
        corpo = _resposta(http.post(_api(token, f"{conta}/media"), data=parametros))
    container = str(corpo.get("id") or "")
    endereco = str(corpo.get("uri") or "")
    if not container or not endereco:
        raise ErroDoInstagram(f"Instagram nao devolveu o container do upload: {corpo}")
    return Container(id=container, endereco_de_envio=endereco)


def enviar_video(token: str, container: Container, video: Path) -> None:
    """Manda o MP4 inteiro para o endereço do container (upload retomável, do zero)."""
    tamanho = video.stat().st_size
    with video.open("rb") as arquivo, httpx.Client(timeout=_TIMEOUT_DO_ENVIO_S) as http:
        _resposta(
            http.post(
                container.endereco_de_envio,
                headers={
                    "Authorization": f"OAuth {token}",
                    "offset": "0",
                    "file_size": str(tamanho),
                },
                content=arquivo.read(),
            )
        )


def status_do_container(token: str, container_id: str) -> tuple[str, str]:
    """`(status_code, detalhe)`: IN_PROGRESS, FINISHED, ERROR, EXPIRED ou PUBLISHED."""
    with _cliente(token) as http:
        corpo = _resposta(
            http.get(_api(token, container_id), params={"fields": "status_code,status"})
        )
    return str(corpo.get("status_code") or ""), str(corpo.get("status") or "")


def publicar(token: str, conta: str, container_id: str) -> str:
    """Transforma o container pronto em post; devolve o id da mídia publicada."""
    with _cliente(token) as http:
        corpo = _resposta(
            http.post(_api(token, f"{conta}/media_publish"), data={"creation_id": container_id})
        )
    return str(corpo.get("id") or "")


def permalink(token: str, midia_id: str) -> str:
    """O link público do post, ou vazio quando a Meta não devolve."""
    try:
        with _cliente(token) as http:
            corpo = _resposta(http.get(_api(token, midia_id), params={"fields": "permalink"}))
    except (ErroDoInstagram, httpx.HTTPError) as exc:
        logger.info("[Instagram] sem permalink para %s: %s", midia_id, exc)
        return ""
    return str(corpo.get("permalink") or "")


def renovar_token(token: str) -> tuple[str, int]:
    """Troca o token de 60 dias por um novo de 60 dias: `(token, segundos_de_validade)`.

    A Meta só renova token com pelo menos 24 h de idade e ainda válido.
    """
    with _cliente(token) as http:
        corpo = _resposta(
            http.get(
                f"{_host(token)}/refresh_access_token",
                params={"grant_type": "ig_refresh_token"},
            )
        )
    return str(corpo.get("access_token") or ""), int(corpo.get("expires_in") or 0)


def hospedar_por_uma_hora(imagem: Path) -> str:
    """Sobe a imagem num hospedeiro anônimo que a apaga em 1 h; devolve o link.

    Existe porque o `cover_url` do Reel só aceita um endereço PÚBLICO (a Meta
    busca a imagem lá), e a capa mora no disco do operador. Decisão do operador
    em 28/09/2026: link temporário. A imagem fica pública no Reel minutos depois
    de qualquer jeito; o hospedeiro some com ela em uma hora.
    """
    with imagem.open("rb") as arquivo, httpx.Client(timeout=_TIMEOUT_S) as http:
        resposta = http.post(
            "https://litterbox.catbox.moe/resources/internals/api.php",
            data={"reqtype": "fileupload", "time": "1h"},
            files={"fileToUpload": (imagem.name, arquivo, "image/jpeg")},
        )
    link = resposta.text.strip()
    if resposta.is_error or not link.startswith("https://"):
        raise ErroDoInstagram(f"o hospedeiro temporario recusou a capa: {link[:200]}")
    return link
