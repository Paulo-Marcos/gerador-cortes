"""
Router: YouTube Channel Browser
Busca as lives mais recentes de um canal e permite enfileirar downloads em lote.
"""

import logging
from datetime import UTC, datetime

import httpx
from app.config import settings
from app.database import get_db
from app.models import Projeto, StatusProjeto
from app.services import channels, youtube_auth
from app.services.ingestao import IngestaoService
from app.services.tasks import fire_and_forget
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)
router = APIRouter()


def _compactar_data_publicacao_iso(published_at: str) -> str:
    if not published_at:
        return ""

    try:
        dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except ValueError:
        return ""

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)

    return dt.astimezone(UTC).strftime("%Y%m%d%H%M%S")


def _published_after_from_data_live(data_live: str) -> str:
    value = (data_live or "").strip()
    if not value:
        return ""

    try:
        if len(value) >= 14 and value[:14].isdigit():
            dt = datetime(
                int(value[:4]),
                int(value[4:6]),
                int(value[6:8]),
                int(value[8:10]),
                int(value[10:12]),
                int(value[12:14]),
                tzinfo=UTC,
            )
        elif len(value) >= 8 and value[:8].isdigit():
            dt = datetime(int(value[:4]), int(value[4:6]), int(value[6:8]), tzinfo=UTC)
        else:
            return ""
    except ValueError:
        return ""

    return dt.isoformat().replace("+00:00", "Z")


async def _buscar_datas_publicacao(video_ids: list[str]) -> dict[str, str]:
    api_key = settings.youtube_api_key
    if not api_key or not video_ids:
        return {}

    datas: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(video_ids), 50):
            chunk = video_ids[i : i + 50]
            resp = await client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "id,snippet",
                    "id": ",".join(chunk),
                    "key": api_key,
                },
            )
            if resp.status_code != 200:
                logger.warning("Nao foi possivel buscar publishedAt dos videos: %s", resp.text)
                continue

            for item in resp.json().get("items", []):
                compacta = _compactar_data_publicacao_iso(
                    item.get("snippet", {}).get("publishedAt", "")
                )
                if compacta:
                    datas[item["id"]] = compacta

    return datas


# ─── Schemas ────────────────────────────────────────────────────────────────


class EnfileirarRequest(BaseModel):
    video_ids: list[str]
    canal_origem: str = ""


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/lives")
async def listar_lives_canal(
    after_date: str = "",  # YYYYMMDD — filtra lives após esta data
    max_results: int = 25,
    db: AsyncSession = Depends(get_db),
):
    """
    Busca lives publicadas no canal configurado (youtube_channel_id) após after_date.
    Se after_date estiver vazio, usa a data da live mais recente já cadastrada no banco.
    Retorna lista de {video_id, titulo, data_publicacao, thumbnail_url, duracao_iso}.
    """
    api_key = settings.youtube_api_key
    channel_id = channels.identidade_do_canal_ativo().youtube_channel_id

    if not api_key:
        raise HTTPException(status_code=500, detail="youtube_api_key não configurada no .env")
    if not channel_id:
        raise HTTPException(
            status_code=500, detail="youtube_channel_id não configurado no canal ativo"
        )

    # Se after_date não informado, usa a data da live mais recente no banco
    if not after_date:
        result = await db.execute(
            select(Projeto.data_live)
            .where(Projeto.data_live != "")
            .order_by(Projeto.data_live.desc())
            .limit(1)
        )
        data_live_mais_recente = result.scalar_one_or_none()
        after_date = data_live_mais_recente or ""

    published_after = _published_after_from_data_live(after_date)

    # Resolve handle (@canal) para channel_id real (UCxxxxxx) se necessário
    if channel_id.startswith("@"):
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://www.googleapis.com/youtube/v3/channels",
                params={"part": "id", "forHandle": channel_id, "key": api_key},
            )
            if r.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail=f"Não foi possível resolver o handle '{channel_id}': {r.text}",
                )
            data = r.json()
            items_ch = data.get("items", [])
            if not items_ch:
                raise HTTPException(
                    status_code=404, detail=f"Canal '{channel_id}' não encontrado na YouTube API"
                )
            channel_id = items_ch[0]["id"]

    # Busca IDs de vídeos do canal (tipo completed = live gravada)
    search_params: dict = {
        "part": "id,snippet",
        "channelId": channel_id,
        "type": "video",
        "eventType": "completed",
        "order": "date",
        "maxResults": max_results,
        "key": api_key,
    }
    if published_after:
        search_params["publishedAfter"] = published_after

    async with httpx.AsyncClient(timeout=30.0) as client:
        search_resp = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params=search_params,
        )
        if search_resp.status_code != 200:
            raise HTTPException(
                status_code=502, detail=f"Erro na YouTube API (search): {search_resp.text}"
            )
        search_data = search_resp.json()

    items = search_data.get("items", [])
    if not items:
        return {"lives": [], "after_date": after_date}

    video_ids_str = ",".join(item["id"]["videoId"] for item in items)

    # Busca detalhes (duração, etc.) via videos.list
    async with httpx.AsyncClient(timeout=30.0) as client:
        details_resp = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "id,snippet,contentDetails",
                "id": video_ids_str,
                "key": api_key,
            },
        )
        if details_resp.status_code != 200:
            raise HTTPException(
                status_code=502, detail=f"Erro na YouTube API (videos): {details_resp.text}"
            )
        details_data = details_resp.json()

    # Verifica quais video_ids já existem no banco para marcar como "já baixado"
    urls_existentes_res = await db.execute(select(Projeto.youtube_url))
    urls_existentes = set(urls_existentes_res.scalars().all())

    lives = []
    for item in details_data.get("items", []):
        vid_id = item["id"]
        snippet = item.get("snippet", {})
        content = item.get("contentDetails", {})

        pub_raw = snippet.get("publishedAt", "")
        data_pub_compacta = _compactar_data_publicacao_iso(pub_raw)
        data_pub_yyyymmdd = data_pub_compacta[:8]

        yt_url = f"https://www.youtube.com/watch?v={vid_id}"
        ja_baixado = yt_url in urls_existentes

        lives.append(
            {
                "video_id": vid_id,
                "titulo": snippet.get("title", ""),
                "data_publicacao": pub_raw,
                "data_publicacao_yyyymmdd": data_pub_yyyymmdd,
                "thumbnail_url": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
                "duracao_iso": content.get("duration", ""),
                "youtube_url": yt_url,
                "ja_baixado": ja_baixado,
            }
        )

    # Ordena por data mais recente primeiro
    lives.sort(key=lambda x: x["data_publicacao"], reverse=True)

    return {"lives": lives, "after_date": after_date, "channel_id": channel_id}


# ─── Autenticação OAuth por canal (D-169) ─────────────────────────────────────


@router.get("/auth/status")
async def youtube_auth_status():
    """Estado da conexão do YouTube (login OAuth) para o canal ativo."""
    return youtube_auth.status()


@router.post("/auth/conectar")
async def youtube_auth_conectar():
    """Dispara o login OAuth do canal ativo (abre o navegador; grava o token)."""
    resultado = youtube_auth.iniciar_conexao()
    if resultado.get("status") == "erro":
        raise HTTPException(status_code=400, detail=resultado.get("mensagem"))
    return resultado


@router.post("/auth/desconectar")
async def youtube_auth_desconectar():
    """Remove o token do canal ativo (desconecta a conta do YouTube)."""
    resultado = youtube_auth.desconectar()
    if resultado.get("status") == "erro":
        raise HTTPException(status_code=500, detail=resultado.get("mensagem"))
    return resultado


@router.post("/enfileirar")
async def enfileirar_downloads(body: EnfileirarRequest, db: AsyncSession = Depends(get_db)):
    """
    Cria um Projeto para cada video_id informado e dispara o pipeline completo
    (download -> transcrição -> análise -> desvios -> cortes brutos).
    """
    import uuid

    criados = []
    ignorados = []
    datas_publicacao = await _buscar_datas_publicacao(body.video_ids)

    for vid_id in body.video_ids:
        yt_url = f"https://www.youtube.com/watch?v={vid_id}"

        # Evita duplicatas
        existing = await db.execute(select(Projeto).where(Projeto.youtube_url == yt_url).limit(1))
        if existing.scalar_one_or_none():
            ignorados.append(vid_id)
            continue

        projeto = Projeto(
            id=str(uuid.uuid4()),
            youtube_url=yt_url,
            canal_origem=body.canal_origem,
            data_live=datas_publicacao.get(vid_id, ""),
            status=StatusProjeto.PENDENTE,
        )
        db.add(projeto)
        await db.commit()
        await db.refresh(projeto)

        fire_and_forget(
            IngestaoService.processar_projeto(projeto.id, yt_url),
            name=f"ingestao-{projeto.id[:8]}",
        )
        criados.append({"projeto_id": projeto.id, "video_id": vid_id, "youtube_url": yt_url})

    return {
        "message": f"{len(criados)} projeto(s) criado(s), {len(ignorados)} ignorado(s) (já existem).",
        "criados": criados,
        "ignorados": ignorados,
    }
