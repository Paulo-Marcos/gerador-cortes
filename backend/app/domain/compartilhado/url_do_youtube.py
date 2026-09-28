"""A URL de um vídeo do YouTube, reconstruída a partir do id (D-807).

O que vai para uma linha de comando (yt-dlp) nunca é o texto que alguém colou:
é `https://www.youtube.com/watch?v=<id>`, montado aqui depois de conferir que o
texto é, de fato, um endereço do YouTube e que o id tem a forma de um id. Um
"URL" como `--exec=...` virava opção do yt-dlp — e `--exec` executa comando.

O host é conferido por igualdade, não por sufixo: `evilyoutube.com` termina em
`youtube.com` e não é o YouTube.
"""

import re
from urllib.parse import parse_qs, urlsplit

from app.domain.compartilhado.erros import PedidoInvalido

_ID = re.compile(r"[A-Za-z0-9_-]{11}")
_HOSTS_DO_SITE = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
_HOST_CURTO = "youtu.be"
_PREFIXOS_COM_ID = {"live", "shorts", "embed", "v"}
# /live/<id>, /shorts/<id>: o prefixo e o id.
_PARTES_DO_CAMINHO_COM_ID = 2


def url_canonica_do_video(valor: str) -> str:
    """`https://www.youtube.com/watch?v=<id>` do vídeo, ou `PedidoInvalido`."""
    video_id = _id_do_video(valor.strip())
    if video_id is None or not _ID.fullmatch(video_id):
        raise PedidoInvalido(
            f"Isto não é o endereço de um vídeo do YouTube: {valor.strip()[:120]!r}."
        )
    return f"https://www.youtube.com/watch?v={video_id}"


def _id_do_video(texto: str) -> str | None:
    # Id solto e URL sem esquema eram aceitos antes; projeto gravado assim
    # continua baixando. "--exec=..." não tem host do YouTube e segue recusado.
    if _ID.fullmatch(texto):
        return texto
    if "://" not in texto:
        texto = f"https://{texto}"
    partes = urlsplit(texto)
    if partes.scheme not in ("http", "https"):
        return None
    host = (partes.hostname or "").lower()
    caminho = [trecho for trecho in partes.path.split("/") if trecho]
    if host == _HOST_CURTO:
        return caminho[0] if caminho else None
    if host not in _HOSTS_DO_SITE:
        return None
    if caminho[:1] == ["watch"]:
        return parse_qs(partes.query).get("v", [None])[0]
    if len(caminho) >= _PARTES_DO_CAMINHO_COM_ID and caminho[0] in _PREFIXOS_COM_ID:
        return caminho[1]
    return None
