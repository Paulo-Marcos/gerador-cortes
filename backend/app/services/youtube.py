import asyncio
import json
import time
from pathlib import Path

from app.channel_paths import (
    projetos_dir,
    resolver_do_projeto,
    youtube_client_secrets_path,
    youtube_token_path,
)
from app.database import AsyncSessionLocal
from app.domain.youtube_urls import extract_youtube_video_id
from app.models import Corte, MetadadoCorte, MetadadoShort, Projeto, Short
from app.services.app_logging import operational_debug, operational_error, operational_info
from app.services.media_retention import MediaRetentionService
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload
from sqlalchemy import select

# Erros de cota/limite do YouTube que devem parar a fila de uploads.
QUOTA_REASONS = {"quotaExceeded", "rateLimitExceeded", "uploadLimitExceeded"}
UPLOAD_STATUSES_INVALIDOS = {"deleted", "failed", "rejected"}


def _is_quota_error(err: HttpError) -> bool:
    """True se o erro for esgotamento de cota diária de uploads ou rate limit."""
    if getattr(err, "resp", None) is None:
        return False
    if err.resp.status not in (403, 429):
        return False
    try:
        details = json.loads(err.content.decode("utf-8"))
    except Exception:
        return False
    for item in (details.get("error", {}) or {}).get("errors", []) or []:
        if item.get("reason") in QUOTA_REASONS:
            return True
    return False


def _quota_message(err: HttpError) -> str:
    """Mensagem amigável para erro de cota — reset acontece às 00h horário do Pacífico (≈ 04h Brasília)."""
    return (
        "Cota diária de uploads do YouTube esgotada. "
        "O contador zera às 00h horário do Pacífico (~04h Brasília). "
        f"Detalhe original: {err}"
    )


def _call_youtube_with_propagation_retry(
    label: str,
    fn,
    *,
    max_attempts: int = 5,
    initial_wait: float = 3.0,
):
    """
    Executa uma chamada que segue um upload recém-feito (thumbnail, playlistItems...).
    Em 404 (videoNotFound) faz backoff: a propagação interna do YouTube
    leva alguns segundos antes do vídeo aparecer em endpoints subsequentes.
    """
    wait = initial_wait
    last_err: HttpError | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return fn()
        except HttpError as err:
            last_err = err
            status = getattr(err.resp, "status", None) if getattr(err, "resp", None) else None
            if status == 404 and attempt < max_attempts:
                operational_info(
                    "YouTube",
                    f"{label}: 404 (vídeo ainda propagando). "
                    f"Tentativa {attempt}/{max_attempts}, aguardando {wait:.0f}s...",
                )
                time.sleep(wait)
                wait *= 2
                continue
            raise
    if last_err:
        raise last_err


def _publication_payload_from_youtube_item(video_id: str, item: dict) -> dict:
    snippet = item.get("snippet", {}) or {}
    status = item.get("status", {}) or {}
    upload_status = status.get("uploadStatus", "")
    if upload_status in UPLOAD_STATUSES_INVALIDOS:
        raise ValueError(
            f"Video {video_id} existe no YouTube, mas esta com uploadStatus={upload_status!r}."
        )

    scheduled_at = status.get("publishAt") or ""
    return {
        "status": "ok",
        "video_id": video_id,
        "url": f"https://youtu.be/{video_id}",
        "titulo": snippet.get("title", ""),
        "privacy_status": status.get("privacyStatus", ""),
        "upload_status": upload_status,
        "scheduled_at": scheduled_at,
        "mensagem": "Video confirmado no YouTube e marcado no banco.",
    }


# Escopo expandido para gerenciar playlists además do upload
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
]


class YouTubeService:
    @staticmethod
    def _get_credentials() -> tuple[Credentials | None, str | None]:
        """Obtém ou atualiza as credenciais OAuth do YouTube silenciosamente.

        As credenciais seguem o CANAL ATIVO (D-168): `client_secrets.json` e
        `token.json` são resolvidos por `channel_paths`, que aponta para
        `instance/channels/<ativo>/youtube/` quando presentes ali, com fallback ao
        local legado (raiz do backend).
        """
        creds = None
        token_path = youtube_token_path()
        client_secrets_path = youtube_client_secrets_path()

        if not client_secrets_path.exists():
            operational_error("YouTube", f"ERRO: {client_secrets_path} não encontrado.")
            return (
                None,
                "Faltam credenciais do Google Cloud (client_secrets.json). "
                "Coloque em instance/channels/<canal>/youtube/ (ou na raiz do backend, legado).",
            )

        if token_path.exists():
            try:
                creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
            except Exception as e:
                operational_error("YouTube", f"Erro ao ler token.json: {e}")

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                    with open(token_path, "w") as token:
                        token.write(creds.to_json())
                    return creds, None
                except Exception as e:
                    operational_error(
                        "YouTube",
                        f"Erro ao atualizar token: {e}. Excluindo e solicitando novo login.",
                    )
                    try:
                        token_path.unlink(missing_ok=True)
                    except OSError as unlink_err:
                        operational_error(
                            "YouTube",
                            f"Não foi possível remover token.json (somente leitura?): {unlink_err}",
                        )
                        # Mesmo sem deletar, o token inválido vai resultar em erro nas próximas tentativas
                    return None, (
                        "A sessão do YouTube expirou ou o escopo mudou. "
                        f"Delete o arquivo '{token_path}', execute "
                        "'python dev-utils/auth_youtube.py' (na pasta backend) e reinicie o backend."
                    )
            else:
                return (
                    None,
                    "Youtube não autenticado. Execute 'python dev-utils/auth_youtube.py' "
                    "na pasta 'backend' e reinicie o backend.",
                )

        return creds, None

    @staticmethod
    def _obter_ou_criar_playlist(youtube, titulo_live: str) -> str | None:
        """Busca ou cria a playlist 'CORTES LIVE - <titulo>'."""
        nome_playlist = f"CORTES LIVE - {titulo_live}"
        operational_info("YouTube", f"Buscando playlist: '{nome_playlist}'...")

        # Lista playlists do canal
        request = youtube.playlists().list(part="snippet", mine=True, maxResults=50)
        while request:
            response = request.execute()
            for item in response.get("items", []):
                if item["snippet"]["title"].strip().lower() == nome_playlist.strip().lower():
                    playlist_id = item["id"]
                    operational_info("YouTube", f"Playlist encontrada: {playlist_id}")
                    return playlist_id
            request = youtube.playlists().list_next(request, response)

        # Não encontrou — cria nova
        operational_info("YouTube", f"Criando nova playlist: '{nome_playlist}'")
        created = (
            youtube.playlists()
            .insert(
                part="snippet,status",
                body={
                    "snippet": {
                        "title": nome_playlist,
                        "description": f"Cortes da live: {titulo_live}",
                    },
                    "status": {"privacyStatus": "public"},
                },
            )
            .execute()
        )
        playlist_id = created["id"]
        operational_info("YouTube", f"Playlist criada: {playlist_id}")
        return playlist_id

    @staticmethod
    def _adicionar_a_playlist(youtube, playlist_id: str, video_id: str, position: int):
        """Insere um vídeo em uma playlist (o YouTube irá apend automaticamente ao final)."""
        operational_info("YouTube", f"Adicionando vídeo {video_id} na playlist {playlist_id}...")
        # Nota: não enviamos 'position' pois a API retorna 400 se a posição
        # for maior que o tamanho atual da playlist (ex: vídeo em posição 10 de uma lista com 3).
        youtube.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id,
                    },
                }
            },
        ).execute()
        operational_info("YouTube", "Vídeo adicionado à playlist.")

    @staticmethod
    async def marcar_corte_publicado(corte_id: str, youtube_url: str) -> dict:
        """Confirma um video no canal autenticado e grava o ID no corte."""
        try:
            video_id = extract_youtube_video_id(youtube_url)
        except ValueError as exc:
            return {"status": "erro", "mensagem": str(exc)}

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, YouTubeService._verificar_video_do_canal, video_id
        )
        if result.get("status") == "erro":
            return result

        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}

            corte.youtube_video_id = result["video_id"]
            corte.youtube_url_publicado = result["url"]
            corte.youtube_scheduled_at = result.get("scheduled_at") or ""
            await db.commit()

        return result

    @staticmethod
    def _verificar_video_do_canal(video_id: str) -> dict:
        creds, err_msg = YouTubeService._get_credentials()
        if not creds:
            return {"status": "erro", "mensagem": err_msg}

        youtube = build("youtube", "v3", credentials=creds)
        own_channel_id = YouTubeService._obter_canal_autenticado_id(youtube)
        if not own_channel_id:
            return {
                "status": "erro",
                "mensagem": "Não foi possível confirmar o canal autenticado do YouTube.",
            }

        response = (
            youtube.videos()
            .list(
                part="snippet,status,contentDetails",
                id=video_id,
            )
            .execute()
        )
        items = response.get("items", [])
        if not items:
            return {"status": "erro", "mensagem": f"Vídeo {video_id} não encontrado no YouTube."}

        item = items[0]
        video_channel_id = (item.get("snippet", {}) or {}).get("channelId")
        if video_channel_id != own_channel_id:
            return {
                "status": "erro",
                "mensagem": f"Vídeo {video_id} existe, mas não pertence ao canal autenticado.",
            }

        try:
            return _publication_payload_from_youtube_item(video_id, item)
        except ValueError as exc:
            return {"status": "erro", "mensagem": str(exc)}

    @staticmethod
    def _obter_canal_autenticado_id(youtube) -> str | None:
        response = youtube.channels().list(part="id", mine=True, maxResults=1).execute()
        items = response.get("items", [])
        if not items:
            return None
        return items[0].get("id")

    @staticmethod
    async def upload_video(corte_id: str, scheduled_at: str | None = None) -> dict:
        """
        Lê os metadados do banco e o vídeo de upload_ready e envia pro YT.
        - scheduled_at: string ISO8601 (ex: '2024-03-20T15:00:00Z') para publicação agendada.
          Se None, o vídeo sobe como 'unlisted' imediatamente.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}
            if corte.youtube_video_id:
                url = corte.youtube_url_publicado or f"https://youtu.be/{corte.youtube_video_id}"
                retention = MediaRetentionService.aplicar_apos_upload(corte)
                await db.commit()
                return {
                    "status": "ok",
                    "video_id": corte.youtube_video_id,
                    "url": url,
                    "scheduled_at": corte.youtube_scheduled_at,
                    "mensagem": "Corte já publicado; upload ignorado.",
                    "retencao_arquivos": retention.to_dict(),
                }

            titulo_live = projeto.titulo_live or "Live"
            numero_corte = corte.numero

            meta_result = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta_db = meta_result.scalar_one_or_none()

        base_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id / "upload_ready"
        video_path = base_dir / "video.mp4"

        if not video_path.exists():
            return {
                "status": "erro",
                "mensagem": "Arquivo de vídeo não encontrado em upload_ready.",
            }

        # Obtém título, descrição e tags do banco (fonte de verdade)
        if meta_db:
            # Remove o 🔥 do título antes de enviar para o YouTube
            titulo_raw = meta_db.titulo_youtube or ""
            titulo = (
                titulo_raw.lstrip("🔥 ").strip() if titulo_raw.startswith("🔥 ") else titulo_raw
            )
            descricao = meta_db.descricao_youtube or ""
            tags = json.loads(meta_db.tags_youtube or "[]")
        else:
            # Fallback: tenta ler do metadados.txt se existir
            meta_path = base_dir / "metadados.txt"
            if not meta_path.exists():
                return {
                    "status": "erro",
                    "mensagem": "Metadados não encontrados (banco e arquivo).",
                }
            titulo = ""
            descricao = ""
            tags = []
            current_section = None
            for line in meta_path.read_text(encoding="utf-8").splitlines():
                line_str = line.strip()
                if line_str == "=== TÍTULO ===":
                    current_section = "titulo"
                elif line_str == "=== DESCRIÇÃO ===":
                    current_section = "descricao"
                elif line_str == "=== TAGS ===":
                    current_section = "tags"
                elif line_str and not line_str.startswith("==="):
                    if current_section == "titulo":
                        if not titulo:
                            titulo = line_str
                    elif current_section == "descricao":
                        descricao += line + "\n"
                    elif current_section == "tags":
                        tags.extend([t.strip() for t in line_str.split(",") if t.strip()])
            descricao = descricao.strip()

        operational_info("YouTube", f"Título que será enviado: {titulo!r}")
        operational_info("YouTube", "Logando como API do Google...")
        creds, err_msg = YouTubeService._get_credentials()
        if not creds:
            return {"status": "erro", "mensagem": err_msg}

        try:

            def _run_upload():
                youtube = build("youtube", "v3", credentials=creds)

                # Determina status e agendamento
                if scheduled_at:
                    privacy_status = "private"
                    scheduling = {"publishAt": scheduled_at}
                else:
                    privacy_status = "unlisted"
                    scheduling = {}

                body = {
                    "snippet": {
                        "title": titulo[:100],
                        "description": descricao[:5000],
                        "tags": tags[:15],
                        "categoryId": "22",
                    },
                    "status": {
                        "privacyStatus": privacy_status,
                        "madeForKids": False,  # sempre não é para crianças
                        "selfDeclaredMadeForKids": False,
                        **scheduling,
                    },
                }

                operational_info(
                    "YouTube",
                    f"Enviando {video_path.name} ({video_path.stat().st_size} bytes)...",
                )

                chunk_size = 8 * 1024 * 1024
                media_body = MediaFileUpload(
                    str(video_path), chunksize=chunk_size, resumable=True, mimetype="video/mp4"
                )

                request = youtube.videos().insert(
                    part="snippet,status", body=body, media_body=media_body
                )

                response = None
                while response is None:
                    status, response = request.next_chunk()
                    if status:
                        operational_info(
                            "YouTube", f"Upload progresso: {int(status.progress() * 100)}%"
                        )

                video_id = response.get("id")
                operational_info("YouTube", f"Sucesso! Vídeo ID: {video_id}")

                # Upload Thumbnail — busca em múltiplos caminhos possíveis
                _thumb_found: Path | None = None
                for _ext in ("thumbnail.jpg", "thumbnail.png", "thumbnail.webp"):
                    _cand = base_dir / _ext
                    if _cand.exists() and _cand.stat().st_size > 0:
                        _thumb_found = _cand
                        operational_debug(
                            "YouTube",
                            f"Thumbnail (upload_ready): {_cand} ({_cand.stat().st_size} bytes)",
                        )
                        break

                # Fallback: usa thumbnail_path do banco (já disponível em meta_db)
                if not _thumb_found and meta_db and meta_db.thumbnail_path:
                    _db_thumb = resolver_do_projeto(meta_db.thumbnail_path, corte.projeto_id)
                    if _db_thumb.exists() and _db_thumb.stat().st_size > 0:
                        _thumb_found = _db_thumb
                        operational_debug(
                            "YouTube",
                            f"Thumbnail (banco): {_db_thumb} ({_db_thumb.stat().st_size} bytes)",
                        )
                    else:
                        operational_info(
                            "YouTube", f"Thumbnail do banco não encontrada em disco: {_db_thumb}"
                        )

                if not _thumb_found:
                    operational_info(
                        "YouTube",
                        "Thumbnail não disponível para este corte — upload prossegue sem ela.",
                    )

                if _thumb_found and video_id:
                    _actual = str(_thumb_found)
                    if _thumb_found.stat().st_size > 2_000_000:
                        operational_info("YouTube", "Thumbnail > 2MB. Comprimindo...")
                        from PIL import Image

                        _img = Image.open(_thumb_found)
                        if _img.mode != "RGB":
                            _img = _img.convert("RGB")
                        _tmp = _thumb_found.with_name("temp_thumb_upload.jpg")
                        _q = 92
                        while _q > 20:
                            _img.save(_tmp, "JPEG", quality=_q, optimize=True)
                            if _tmp.stat().st_size <= 2_000_000:
                                break
                            _q -= 5
                        _actual = str(_tmp)
                        operational_debug(
                            "YouTube",
                            f"Thumbnail comprimida -> qualidade {_q} ({_tmp.stat().st_size} bytes)",
                        )

                    operational_info("YouTube", f"Enviando thumbnail: {_actual}")
                    try:
                        youtube.thumbnails().set(
                            videoId=video_id,
                            media_body=MediaFileUpload(_actual, mimetype="image/jpeg"),
                        ).execute()
                        operational_info("YouTube", "Thumbnail enviada!")
                    except Exception as _te:
                        operational_error("YouTube", f"AVISO: falha ao enviar thumbnail: {_te}")
                    finally:
                        if _actual != str(_thumb_found) and Path(_actual).exists():
                            Path(_actual).unlink(missing_ok=True)

                # Adicionar à Playlist
                playlist_id = YouTubeService._obter_ou_criar_playlist(youtube, titulo_live)
                if playlist_id:
                    YouTubeService._adicionar_a_playlist(
                        youtube,
                        playlist_id,
                        video_id,
                        position=max(0, numero_corte - 1),  # 0-indexed
                    )

                # Criar marcador da pasta para identificação rápida
                marker_path = base_dir.parent / f"_corte_{numero_corte:03d}.txt"
                marker_path.write_text(
                    f"Corte #{numero_corte}\nVideo ID: {video_id}\n", encoding="utf-8"
                )

                url = f"https://youtu.be/{video_id}"
                return {
                    "status": "ok",
                    "video_id": video_id,
                    "url": url,
                    "scheduled_at": scheduled_at,
                }

            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, _run_upload)

            # Salva video_id e scheduled_at no banco
            if result.get("status") == "ok":
                async with AsyncSessionLocal() as db:
                    corte = await db.get(Corte, corte_id)
                    if corte:
                        corte.youtube_video_id = result["video_id"]
                        corte.youtube_url_publicado = result["url"]
                        if scheduled_at:
                            corte.youtube_scheduled_at = scheduled_at
                        retention = MediaRetentionService.aplicar_apos_upload(corte)
                        result["retencao_arquivos"] = retention.to_dict()
                        await db.commit()

            return result

        except HttpError as e:
            is_quota = _is_quota_error(e)
            msg = _quota_message(e) if is_quota else str(e)
            operational_error("YouTube", f"Erro fatal durante upload: {e}")
            result = {"status": "erro", "mensagem": msg}
            if is_quota:
                result["cota_excedida"] = True
            return result
        except Exception as e:
            operational_error("YouTube", f"Erro fatal durante upload: {e}")
            return {"status": "erro", "mensagem": str(e)}

    @staticmethod
    async def upload_short(short_id: str, scheduled_at: str | None = None) -> dict:
        """Envia o short gerado para o YouTube Shorts."""
        async with AsyncSessionLocal() as db:
            short = await db.get(Short, short_id)
            if not short:
                return {"status": "erro", "mensagem": "Short não encontrado"}
            corte = await db.get(Corte, short.corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte do short não encontrado"}
            projeto = await db.get(Projeto, corte.projeto_id)
            if not projeto:
                return {"status": "erro", "mensagem": "Projeto não encontrado"}

            meta_result = await db.execute(
                select(MetadadoShort).where(MetadadoShort.short_id == short_id)
            )
            meta_db = meta_result.scalar_one_or_none()

        # Re-ancora no canal ATIVO (D-172): tolera path stale gravado no banco.
        video_path = (
            resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
            if short.arquivo_short_path
            else None
        )
        if not video_path or not video_path.exists():
            return {
                "status": "erro",
                "mensagem": "Arquivo do short não encontrado. Renderize-o primeiro.",
            }

        if meta_db:
            titulo = meta_db.titulo_youtube or f"Short #{short.numero}"
            descricao = meta_db.descricao_youtube or ""
            tags = json.loads(meta_db.tags_youtube or "[]")
        else:
            titulo = f"Short #{short.numero}"
            descricao = ""
            tags = []

        # Adiciona hashtag Shorts se não existir
        if "#shorts" not in [t.lower() for t in tags]:
            tags.append("shorts")
        if "#shorts" not in descricao.lower() and "#shorts" not in titulo.lower():
            titulo = f"{titulo} #shorts"

        operational_info("YouTube", f"Título do Short que será enviado: {titulo!r}")
        creds, err_msg = YouTubeService._get_credentials()
        if not creds:
            return {"status": "erro", "mensagem": err_msg}

        try:

            def _run_upload():
                youtube = build("youtube", "v3", credentials=creds)

                if scheduled_at:
                    privacy_status = "private"
                    scheduling = {"publishAt": scheduled_at}
                else:
                    privacy_status = "public"  # Shorts geralmente vão como publicos logo
                    scheduling = {}

                body = {
                    "snippet": {
                        "title": titulo[:100],
                        "description": descricao[:5000],
                        "tags": tags[:15],
                        "categoryId": "22",
                    },
                    "status": {
                        "privacyStatus": privacy_status,
                        "madeForKids": False,
                        "selfDeclaredMadeForKids": False,
                        **scheduling,
                    },
                }

                operational_info(
                    "YouTube",
                    f"Enviando Short {video_path.name} ({video_path.stat().st_size} bytes)...",
                )

                chunk_size = 8 * 1024 * 1024
                media_body = MediaFileUpload(
                    str(video_path), chunksize=chunk_size, resumable=True, mimetype="video/mp4"
                )

                request = youtube.videos().insert(
                    part="snippet,status", body=body, media_body=media_body
                )

                response = None
                while response is None:
                    status, response = request.next_chunk()
                    if status:
                        operational_info(
                            "YouTube", f"Upload progresso: {int(status.progress() * 100)}%"
                        )

                video_id = response.get("id")
                operational_info("YouTube", f"Sucesso! Short Video ID: {video_id}")
                url = f"https://youtu.be/{video_id}"
                return {
                    "status": "ok",
                    "video_id": video_id,
                    "url": url,
                    "scheduled_at": scheduled_at,
                }

            loop = asyncio.get_running_loop()
            result = await loop.run_in_executor(None, _run_upload)

            if result.get("status") == "ok":
                async with AsyncSessionLocal() as db_update:
                    meta_res = await db_update.execute(
                        select(MetadadoShort).where(MetadadoShort.short_id == short_id)
                    )
                    meta_to_update = meta_res.scalar_one_or_none()
                    if meta_to_update:
                        meta_to_update.youtube_video_id = result["video_id"]
                        meta_to_update.youtube_url_publicado = result["url"]
                        await db_update.commit()

            return result

        except Exception as e:
            operational_error("YouTube", f"Erro fatal durante upload de short: {e}")
            return {"status": "erro", "mensagem": str(e)}
