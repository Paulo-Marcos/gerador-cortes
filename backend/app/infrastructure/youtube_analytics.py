"""D-305: cliente OAuth da YouTube Analytics API v2 + Data API v3 do canal próprio.

Distinto dos vizinhos:

- `services/youtube.py` — OAuth de ESCRITA (upload de vídeos/shorts, playlists).
- `infrastructure/youtube_data_api.py` — API key, dados PÚBLICOS de terceiros
  (ranking de lives). Não enxerga métricas privadas.

Aqui usamos o TOKEN do canal ATIVO (o mesmo `token.json` do upload) para LER:
1. a lista de uploads do próprio canal (Data API `videos.list` via playlist de
   uploads), com título e duração;
2. as métricas lifetime por vídeo (Analytics API `reports.query`).

O token de upload atual pode não ter o escopo de analytics
(`yt-analytics.readonly`) — nesse caso NÃO quebramos com 500: levantamos
`YoutubeAnalyticsError(precisa_reautorizar=True)` com a instrução de reautorizar.
As chamadas ao Google são bloqueantes (googleapiclient); o service as roda fora
do event loop com `asyncio.to_thread`.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from app.channel_paths import youtube_client_secrets_path, youtube_token_path
from app.core.logging import operational_error, operational_info
from app.domain.youtube_stats import parsear_duracao_iso8601
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# Escopo somente-leitura das métricas. O token de upload (escopos `youtube` +
# `youtube.upload`) NÃO o inclui por padrão — daí a checagem explícita e o
# passo de reautorização documentado em dev-utils/auth_youtube.py.
ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly"

# Métricas lifetime pedidas ao Analytics. Impressões/CTR ficam FORA: a YouTube
# Analytics API pública não as expõe (são exclusivas do Creator Studio) — ver o
# relatório do D-305. O levantamento de títulos usa views como proxy.
_METRICAS = (
    "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained"
)
_MAX_RESULTS = 200

_INSTRUCAO_REAUTORIZAR = (
    "O token do YouTube não tem o escopo de estatísticas (yt-analytics.readonly). "
    "Rode 'python dev-utils/auth_youtube.py' na pasta 'backend' (agora ele pede o "
    "escopo de analytics), autorize com a conta do canal e reinicie o backend."
)

# Instrução para quando a API está desabilitada no projeto do Google Cloud. Não é
# reautorização (o token está OK) — é uma configuração única no console. O
# `{projeto}` sai do próprio erro do Google (extendedHelp/reason accessNotConfigured).
_INSTRUCAO_HABILITAR_API = (
    "A YouTube Analytics API não está habilitada no projeto do Google Cloud. "
    "Abra https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview"
    "{projeto}, clique em 'Ativar' e aguarde alguns minutos para propagar; depois "
    "sincronize de novo."
)


class YoutubeAnalyticsError(RuntimeError):
    """Falha ao consultar as estatísticas do YouTube.

    `precisa_reautorizar=True` quando a causa é token ausente/sem escopo — o
    caller transforma isso numa instrução clara em vez de um 500 genérico.
    """

    def __init__(self, message: str, *, precisa_reautorizar: bool = False):
        super().__init__(message)
        self.precisa_reautorizar = precisa_reautorizar


@dataclass(frozen=True)
class VideoUpload:
    """Um upload do canal (Data API) — o esqueleto do levantamento."""

    video_id: str
    titulo: str
    duracao_seg: float
    publicado_em: datetime | None


@dataclass(frozen=True)
class VideoMetrica:
    """Métricas lifetime de um vídeo (Analytics API)."""

    video_id: str
    views: int
    estimated_minutes_watched: float
    average_view_duration_seg: float
    average_view_percentage: float
    subscribers_gained: int


def carregar_credenciais() -> Credentials:
    """Credenciais OAuth do canal ativo COM escopo de analytics garantido.

    Levanta `YoutubeAnalyticsError(precisa_reautorizar=True)` quando o token não
    existe, não pôde ser renovado, ou não tem o escopo `yt-analytics.readonly`.
    Bloqueante (lê arquivo e pode fazer refresh de rede) — chame via to_thread.
    """
    token_path = youtube_token_path()
    if not token_path.exists():
        raise YoutubeAnalyticsError(
            "YouTube não autenticado. " + _INSTRUCAO_REAUTORIZAR, precisa_reautorizar=True
        )
    if not youtube_client_secrets_path().exists():
        raise YoutubeAnalyticsError(
            "Faltam credenciais do Google Cloud (client_secrets.json).",
            precisa_reautorizar=True,
        )

    try:
        # Sem passar scopes: as credenciais herdam os escopos gravados no token.
        creds = Credentials.from_authorized_user_file(str(token_path))
    except Exception as exc:  # noqa: BLE001 — arquivo corrompido/legado
        raise YoutubeAnalyticsError(
            f"Não foi possível ler o token do YouTube: {exc}. " + _INSTRUCAO_REAUTORIZAR,
            precisa_reautorizar=True,
        ) from exc

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                token_path.write_text(creds.to_json(), encoding="utf-8")
            except Exception as exc:  # noqa: BLE001 — refresh_token revogado/expirado
                raise YoutubeAnalyticsError(
                    "A sessão do YouTube expirou. " + _INSTRUCAO_REAUTORIZAR,
                    precisa_reautorizar=True,
                ) from exc
        else:
            raise YoutubeAnalyticsError(
                "YouTube não autenticado. " + _INSTRUCAO_REAUTORIZAR, precisa_reautorizar=True
            )

    if not creds.scopes or ANALYTICS_SCOPE not in creds.scopes:
        raise YoutubeAnalyticsError(_INSTRUCAO_REAUTORIZAR, precisa_reautorizar=True)

    return creds


def listar_uploads(creds: Credentials) -> tuple[str, list[VideoUpload]]:
    """(canal_id, uploads) do canal autenticado via Data API v3.

    Percorre a playlist de uploads do canal (todos os vídeos publicados) e
    complementa com título/duração em lotes de 50 (`videos.list`).
    """
    youtube = build("youtube", "v3", credentials=creds, cache_discovery=False)

    try:
        canais = youtube.channels().list(part="id,contentDetails", mine=True).execute()
    except HttpError as exc:
        raise _traduzir_http_error(exc, contexto="identificar o canal no YouTube") from exc
    itens = canais.get("items", [])
    if not itens:
        raise YoutubeAnalyticsError("Não foi possível identificar o canal autenticado no YouTube.")
    canal_id = itens[0].get("id", "")
    playlist_uploads = ((itens[0].get("contentDetails") or {}).get("relatedPlaylists") or {}).get(
        "uploads"
    )
    if not playlist_uploads:
        raise YoutubeAnalyticsError("Canal sem playlist de uploads acessível.")

    video_ids = _coletar_ids_da_playlist(youtube, playlist_uploads)
    operational_info("YouTubeStats", f"{len(video_ids)} uploads encontrados no canal {canal_id}.")

    uploads: list[VideoUpload] = []
    for inicio in range(0, len(video_ids), 50):
        chunk = video_ids[inicio : inicio + 50]
        try:
            resp = (
                youtube.videos().list(part="snippet,contentDetails", id=",".join(chunk)).execute()
            )
        except HttpError as exc:
            raise _traduzir_http_error(exc, contexto="listar os vídeos do canal") from exc
        uploads.extend(_upload_de_item(item) for item in resp.get("items", []))
    return canal_id, uploads


def metricas_lifetime(
    creds: Credentials, *, video_ids: list[str], start_date: str, end_date: str
) -> dict[str, VideoMetrica]:
    """Métricas lifetime por vídeo via Analytics API v2 (uma linha por vídeo).

    Consulta em LOTES filtrando por `filters=video==id1,id2,...`, não pelo relatório
    "top videos" (`sort=-views`): esse último é limitado a 200 linhas e recusa
    `startIndex>200` com HTTP 400 (`badRequest`), quebrando em canais com mais de
    200 vídeos. Filtrar pela lista explícita de uploads contorna o teto e cobre o
    canal inteiro. `start_date`/`end_date` em `YYYY-MM-DD`. Erros de escopo já
    foram barrados em `carregar_credenciais`; aqui um erro é infra/rede e sobe
    como `YoutubeAnalyticsError`.
    """
    analytics = build("youtubeAnalytics", "v2", credentials=creds, cache_discovery=False)
    metricas: dict[str, VideoMetrica] = {}
    for inicio in range(0, len(video_ids), _MAX_RESULTS):
        lote = video_ids[inicio : inicio + _MAX_RESULTS]
        try:
            resp = (
                analytics.reports()
                .query(
                    ids="channel==MINE",
                    startDate=start_date,
                    endDate=end_date,
                    metrics=_METRICAS,
                    dimensions="video",
                    filters="video==" + ",".join(lote),
                    maxResults=_MAX_RESULTS,
                )
                .execute()
            )
        except HttpError as exc:
            raise _traduzir_http_error(
                exc, contexto="consultar as estatísticas do YouTube"
            ) from exc
        metricas.update(_metricas_de_report(resp))
    return metricas


def _traduzir_http_error(exc: HttpError, *, contexto: str) -> YoutubeAnalyticsError:
    """`HttpError` do googleapiclient → `YoutubeAnalyticsError` acionável.

    Distingue o 403 `accessNotConfigured` (API desabilitada no projeto do Google
    Cloud — configuração única no console) de qualquer outra falha de infra/rede,
    para que a background task não estoure com traceback cru e o operador receba a
    instrução certa. API desabilitada NÃO é caso de reautorizar (o token está OK).
    """
    if _e_api_desabilitada(exc):
        mensagem = _INSTRUCAO_HABILITAR_API.format(projeto=_sufixo_projeto(exc))
        operational_error("YouTubeStats", f"YouTube Analytics API desabilitada: {exc}")
        return YoutubeAnalyticsError(mensagem)
    operational_error("YouTubeStats", f"Falha ao {contexto}: {exc}")
    return YoutubeAnalyticsError(f"Falha ao {contexto}: {exc}")


def _e_api_desabilitada(exc: HttpError) -> bool:
    status = getattr(getattr(exc, "resp", None), "status", None)
    if status != 403:
        return False
    return "accessNotConfigured" in _texto_do_erro(exc)


def _sufixo_projeto(exc: HttpError) -> str:
    """`?project=NNN` extraído do erro, para o link já cair no projeto certo.

    O Google cita o número em duas formas na mesma mensagem — `project=747...`
    (na URL de ativação) e `project 747...` (no texto). Achamos "project",
    pulamos o separador (`=`/espaço) e coletamos o primeiro bloco de dígitos.
    """
    texto = _texto_do_erro(exc)
    marcador = "project"
    pos = texto.find(marcador)
    if pos == -1:
        return ""
    numero = ""
    for ch in texto[pos + len(marcador) :]:
        if ch.isdigit():
            numero += ch
        elif numero:
            break  # já pegamos o número; o bloco acabou
        # antes dos dígitos, ignora separadores (=, espaço) até o número começar
    return f"?project={numero}" if numero else ""


def _texto_do_erro(exc: HttpError) -> str:
    conteudo = getattr(exc, "content", b"")
    if isinstance(conteudo, bytes):
        conteudo = conteudo.decode("utf-8", errors="replace")
    return f"{conteudo} {exc}"


# ── parsing puro (testável com respostas fake, sem rede) ─────────────────────


def _upload_de_item(item: dict) -> VideoUpload:
    snippet = item.get("snippet", {}) or {}
    content = item.get("contentDetails", {}) or {}
    return VideoUpload(
        video_id=item.get("id", ""),
        titulo=snippet.get("title", ""),
        duracao_seg=parsear_duracao_iso8601(content.get("duration", "")),
        publicado_em=_parsear_iso_utc(snippet.get("publishedAt", "")),
    )


def _metricas_de_report(report: dict) -> dict[str, VideoMetrica]:
    """Report do Analytics → {video_id: VideoMetrica}, mapeando por columnHeaders.

    Robusto à ordem das colunas: casa cada métrica pelo nome do header, não pela
    posição fixa.
    """
    headers = [h.get("name") for h in report.get("columnHeaders", []) or []]
    indice = {nome: pos for pos, nome in enumerate(headers)}
    if "video" not in indice:
        return {}

    metricas: dict[str, VideoMetrica] = {}
    for linha in report.get("rows") or []:
        video_id = str(linha[indice["video"]])
        if not video_id:
            continue
        metricas[video_id] = VideoMetrica(
            video_id=video_id,
            views=int(_celula(linha, indice, "views") or 0),
            estimated_minutes_watched=float(
                _celula(linha, indice, "estimatedMinutesWatched") or 0.0
            ),
            average_view_duration_seg=float(_celula(linha, indice, "averageViewDuration") or 0.0),
            average_view_percentage=float(_celula(linha, indice, "averageViewPercentage") or 0.0),
            subscribers_gained=int(_celula(linha, indice, "subscribersGained") or 0),
        )
    return metricas


def _celula(linha: list, indice: dict[str, int], nome: str):
    pos = indice.get(nome)
    return linha[pos] if pos is not None and pos < len(linha) else None


def _coletar_ids_da_playlist(youtube, playlist_id: str) -> list[str]:
    video_ids: list[str] = []
    request = youtube.playlistItems().list(
        part="contentDetails", playlistId=playlist_id, maxResults=50
    )
    while request is not None:
        try:
            response = request.execute()
        except Exception as exc:  # noqa: BLE001
            operational_error("YouTubeStats", f"Falha ao paginar uploads: {exc}")
            raise YoutubeAnalyticsError(f"Falha ao listar uploads do canal: {exc}") from exc
        for item in response.get("items", []):
            video_id = (item.get("contentDetails") or {}).get("videoId")
            if video_id:
                video_ids.append(video_id)
        request = youtube.playlistItems().list_next(request, response)
    return video_ids


def _parsear_iso_utc(iso: str) -> datetime | None:
    """ISO8601 (`...Z`) → datetime NAIVE em UTC (consistente com o resto do banco)."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt
