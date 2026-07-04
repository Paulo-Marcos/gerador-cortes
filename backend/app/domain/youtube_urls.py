import re
from urllib.parse import parse_qs, urlparse

_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YOUTUBE_PATH_PREFIXES = {"embed", "live", "shorts", "v"}


def extract_youtube_video_id(value: str) -> str:
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("URL ou ID do YouTube vazio; informe um video_id de 11 caracteres.")

    if _VIDEO_ID_RE.fullmatch(raw_value):
        return raw_value

    parsed = urlparse(_ensure_url_scheme(raw_value))
    host = _normalize_host(parsed.netloc)
    if host == "youtu.be":
        return _validate_video_id(_first_path_part(parsed.path), raw_value)

    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        query_video_id = parse_qs(parsed.query).get("v", [""])[0]
        if query_video_id:
            return _validate_video_id(query_video_id, raw_value)

        path_parts = [part for part in parsed.path.split("/") if part]
        if len(path_parts) >= 2 and path_parts[0] in _YOUTUBE_PATH_PREFIXES:
            return _validate_video_id(path_parts[1], raw_value)

    raise ValueError(f"URL do YouTube invalida para extrair video_id: {raw_value!r}.")


def _ensure_url_scheme(value: str) -> str:
    if "://" in value:
        return value
    return f"https://{value.lstrip('/')}"


def _normalize_host(host: str) -> str:
    normalized = host.lower()
    for prefix in ("www.", "m."):
        if normalized.startswith(prefix):
            return normalized[len(prefix) :]
    return normalized


def _first_path_part(path: str) -> str:
    return path.strip("/").split("/", 1)[0]


def _validate_video_id(video_id: str, original_value: str) -> str:
    candidate = video_id.strip()
    if _VIDEO_ID_RE.fullmatch(candidate):
        return candidate
    raise ValueError(f"video_id invalido em URL do YouTube {original_value!r}: {video_id!r}.")
