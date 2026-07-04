"""Cliente fino da YouTube Data API v3 via API key (sem OAuth).

Separado do `services/youtube.py` — que cuida do canal próprio do operador via
OAuth (upload, playlists). Aqui só lemos dados públicos de qualquer canal,
para o ranking F-052. Falhas comuns (comentários desabilitados, vídeo
removido) são marcadas no retorno e não derrubam o fluxo.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

import httpx
from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://www.googleapis.com/youtube/v3"
_TIMEOUT = 30.0


class YoutubeDataApiError(RuntimeError):
    """Falha em chamada à YouTube Data API. `quota_excedida=True` quando o erro
    é cota — caller pode parar tudo em vez de tentar de novo."""

    def __init__(self, message: str, *, quota_excedida: bool = False):
        super().__init__(message)
        self.quota_excedida = quota_excedida


@dataclass(frozen=True)
class VideoResumo:
    """Item de search resolvido (ainda sem statistics)."""

    video_id: str
    titulo: str
    canal_id: str
    canal_titulo: str
    publicado_em: datetime  # tz-aware
    thumbnail_url: str
    duracao_iso: str


@dataclass(frozen=True)
class VideoStats:
    video_id: str
    views: int
    likes: int
    comentarios: int


@dataclass(frozen=True)
class ComentarioTopo:
    autor: str
    texto: str
    likes: int
    publicado_em: datetime


def _exigir_api_key() -> str:
    api_key = settings.youtube_api_key
    if not api_key:
        raise YoutubeDataApiError("youtube_api_key não configurada no .env")
    return api_key


def _parsear_iso_utc(iso: str) -> datetime:
    if not iso:
        return datetime(1970, 1, 1, tzinfo=UTC)
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _raise_se_quota(resp: httpx.Response, contexto: str) -> None:
    """Levanta com `quota_excedida=True` quando o YouTube responde 403/quotaExceeded."""
    if resp.status_code == 200:
        return
    is_quota = False
    try:
        payload = resp.json()
        for item in (payload.get("error", {}) or {}).get("errors", []) or []:
            if item.get("reason") in {"quotaExceeded", "rateLimitExceeded"}:
                is_quota = True
                break
    except Exception:  # noqa: BLE001
        pass
    msg = f"YouTube Data API {contexto}: HTTP {resp.status_code} — {resp.text[:300]}"
    logger.warning(msg)
    raise YoutubeDataApiError(msg, quota_excedida=is_quota)


async def resolver_canal_id(canal_handle_ou_id: str) -> str:
    """Aceita @handle, channel_id (UCxxx) ou nome; devolve o channel_id real."""
    valor = (canal_handle_ou_id or "").strip()
    if not valor:
        raise YoutubeDataApiError("canal vazio para resolver")
    if valor.startswith("UC") and not valor.startswith("@"):
        return valor

    api_key = _exigir_api_key()
    params = {"part": "id", "key": api_key}
    if valor.startswith("@"):
        params["forHandle"] = valor
    else:
        params["forUsername"] = valor.lstrip("@")

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/channels", params=params)
    _raise_se_quota(resp, f"resolver canal {valor!r}")
    itens = resp.json().get("items", [])
    if not itens:
        raise YoutubeDataApiError(f"Canal {valor!r} não encontrado no YouTube")
    return itens[0]["id"]


async def buscar_videos_do_canal(
    channel_id: str,
    *,
    published_after: datetime | None = None,
    max_results: int = 50,
    event_type: str = "completed",
) -> list[VideoResumo]:
    """Search.list por canal. `event_type='completed'` traz só lives já gravadas.

    `max_results` é o teto desejado; a API pagina em janelas de 50.
    """
    api_key = _exigir_api_key()
    coletadas: list[dict] = []
    page_token: str | None = None

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        while len(coletadas) < max_results:
            params: dict = {
                "part": "id,snippet",
                "channelId": channel_id,
                "type": "video",
                "eventType": event_type,
                "order": "date",
                "maxResults": min(50, max_results - len(coletadas)),
                "key": api_key,
            }
            if published_after:
                params["publishedAfter"] = published_after.astimezone(UTC).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
            if page_token:
                params["pageToken"] = page_token
            resp = await client.get(f"{BASE_URL}/search", params=params)
            _raise_se_quota(resp, "search.list")
            body = resp.json()
            coletadas.extend(body.get("items", []))
            page_token = body.get("nextPageToken")
            if not page_token:
                break

    # IDs vêm sem duração; complementa com videos.list para pegar contentDetails.
    video_ids = [item["id"]["videoId"] for item in coletadas if item.get("id", {}).get("videoId")]
    duracoes = await _buscar_duracoes(video_ids) if video_ids else {}

    resumos: list[VideoResumo] = []
    for item in coletadas:
        vid = item.get("id", {}).get("videoId")
        if not vid:
            continue
        snippet = item.get("snippet", {}) or {}
        thumbs = snippet.get("thumbnails", {}) or {}
        thumb = thumbs.get("medium", {}).get("url") or thumbs.get("default", {}).get("url") or ""
        resumos.append(
            VideoResumo(
                video_id=vid,
                titulo=snippet.get("title", ""),
                canal_id=snippet.get("channelId", ""),
                canal_titulo=snippet.get("channelTitle", ""),
                publicado_em=_parsear_iso_utc(snippet.get("publishedAt", "")),
                thumbnail_url=thumb,
                duracao_iso=duracoes.get(vid, ""),
            )
        )
    return resumos


async def _buscar_duracoes(video_ids: list[str]) -> dict[str, str]:
    api_key = _exigir_api_key()
    mapa: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for inicio in range(0, len(video_ids), 50):
            chunk = video_ids[inicio : inicio + 50]
            resp = await client.get(
                f"{BASE_URL}/videos",
                params={
                    "part": "contentDetails",
                    "id": ",".join(chunk),
                    "key": api_key,
                },
            )
            _raise_se_quota(resp, "videos.list duracoes")
            for item in resp.json().get("items", []):
                mapa[item["id"]] = (item.get("contentDetails", {}) or {}).get("duration", "")
    return mapa


async def buscar_stats_videos(video_ids: list[str]) -> dict[str, VideoStats]:
    """videos.list?part=statistics em batch de 50. `commentCount` pode vir vazio
    quando comentários estão desabilitados — tratamos como 0."""
    if not video_ids:
        return {}
    api_key = _exigir_api_key()
    stats: dict[str, VideoStats] = {}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for inicio in range(0, len(video_ids), 50):
            chunk = video_ids[inicio : inicio + 50]
            resp = await client.get(
                f"{BASE_URL}/videos",
                params={
                    "part": "statistics",
                    "id": ",".join(chunk),
                    "key": api_key,
                },
            )
            _raise_se_quota(resp, "videos.list stats")
            for item in resp.json().get("items", []):
                s = item.get("statistics", {}) or {}
                stats[item["id"]] = VideoStats(
                    video_id=item["id"],
                    views=int(s.get("viewCount") or 0),
                    likes=int(s.get("likeCount") or 0),
                    comentarios=int(s.get("commentCount") or 0),
                )
    return stats


async def buscar_top_comentarios(
    video_id: str, *, max_comentarios: int = 30
) -> list[ComentarioTopo]:
    """commentThreads.list?order=relevance.

    Retorna lista vazia quando comentários estão desabilitados (HTTP 403
    `commentsDisabled`). Esse não é erro do nosso lado — só significa que
    o sinal de sentimento dessa live é neutro.
    """
    api_key = _exigir_api_key()
    params = {
        "part": "snippet",
        "videoId": video_id,
        "order": "relevance",
        "maxResults": min(100, max(1, max_comentarios)),
        "textFormat": "plainText",
        "key": api_key,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.get(f"{BASE_URL}/commentThreads", params=params)

    if resp.status_code == 403:
        try:
            payload = resp.json()
        except Exception:  # noqa: BLE001
            payload = {}
        razoes = {
            item.get("reason") for item in (payload.get("error", {}) or {}).get("errors", []) or []
        }
        if razoes & {"commentsDisabled", "videoNotFound"}:
            logger.info("[YT] comentários indisponíveis para %s (%s)", video_id, razoes)
            return []
    _raise_se_quota(resp, f"commentThreads.list {video_id}")

    comentarios: list[ComentarioTopo] = []
    for item in resp.json().get("items", []):
        top = ((item.get("snippet", {}) or {}).get("topLevelComment", {}) or {}).get(
            "snippet", {}
        ) or {}
        comentarios.append(
            ComentarioTopo(
                autor=top.get("authorDisplayName", ""),
                texto=top.get("textOriginal", "") or top.get("textDisplay", ""),
                likes=int(top.get("likeCount") or 0),
                publicado_em=_parsear_iso_utc(top.get("publishedAt", "")),
            )
        )
    return comentarios
