"""As lives do canal próprio: listar as encerradas e enfileirar o download (D-696).

O caso de uso morava no router `youtube_browser`, que falava com a YouTube Data
API por httpx. As chamadas estão em `infrastructure/youtube_data_api`; aqui fica
a regra — de onde vem a data de corte, o que conta como "já baixado", que
projeto nasce. As falhas saem com significado, e o router escolhe o HTTP.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.config import settings
from app.infrastructure import youtube_data_api
from app.models import Projeto, StatusProjeto
from app.services import channels
from app.services.ingestao import IngestaoService
from app.services.tasks import fire_and_forget
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class ConfiguracaoAusente(RuntimeError):
    """Falta a chave da API ou o canal do YouTube no canal ativo."""


class CanalNaoEncontrado(RuntimeError):
    """A API não conhece o @handle configurado."""


class FalhaNaApi(RuntimeError):
    """A API respondeu com erro; a mensagem traz a etapa e o texto dela."""


async def listar_lives(db: AsyncSession, *, after_date: str, max_results: int) -> dict:
    """As lives publicadas no canal ativo depois de `after_date` (YYYYMMDD).

    Sem `after_date`, vale a data da live mais recente já cadastrada no banco.
    """
    api_key = settings.youtube_api_key
    channel_id = channels.identidade_do_canal_ativo().youtube_channel_id

    if not api_key:
        raise ConfiguracaoAusente("youtube_api_key não configurada no .env")
    if not channel_id:
        raise ConfiguracaoAusente("youtube_channel_id não configurado no canal ativo")

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
        try:
            resolvido = await youtube_data_api.canal_do_handle(channel_id, api_key)
        except youtube_data_api.RespostaNaoOk as exc:
            raise FalhaNaApi(
                f"Não foi possível resolver o handle '{channel_id}': {exc.texto}"
            ) from exc
        if resolvido is None:
            raise CanalNaoEncontrado(f"Canal '{channel_id}' não encontrado na YouTube API")
        channel_id = resolvido

    try:
        video_ids = await youtube_data_api.buscar_lives_encerradas(
            channel_id, api_key=api_key, max_results=max_results, published_after=published_after
        )
    except youtube_data_api.RespostaNaoOk as exc:
        raise FalhaNaApi(f"Erro na YouTube API (search): {exc.texto}") from exc
    if not video_ids:
        return {"lives": [], "after_date": after_date}

    try:
        detalhes = await youtube_data_api.detalhes_dos_videos(video_ids, api_key)
    except youtube_data_api.RespostaNaoOk as exc:
        raise FalhaNaApi(f"Erro na YouTube API (videos): {exc.texto}") from exc

    # Verifica quais video_ids já existem no banco para marcar como "já baixado"
    urls_existentes_res = await db.execute(select(Projeto.youtube_url))
    urls_existentes = set(urls_existentes_res.scalars().all())

    lives = []
    for item in detalhes:
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


async def enfileirar(db: AsyncSession, video_ids: list[str], canal_origem: str) -> dict:
    """Cria um Projeto para cada vídeo novo e dispara o pipeline completo
    (download → transcrição → análise → desvios → cortes brutos)."""
    criados = []
    ignorados = []
    datas_publicacao = await _datas_de_publicacao(video_ids)

    for vid_id in video_ids:
        yt_url = f"https://www.youtube.com/watch?v={vid_id}"

        # Evita duplicatas
        existing = await db.execute(select(Projeto).where(Projeto.youtube_url == yt_url).limit(1))
        if existing.scalar_one_or_none():
            ignorados.append(vid_id)
            continue

        projeto = Projeto(
            id=str(uuid.uuid4()),
            youtube_url=yt_url,
            canal_origem=canal_origem,
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


async def _datas_de_publicacao(video_ids: list[str]) -> dict[str, str]:
    api_key = settings.youtube_api_key
    if not api_key or not video_ids:
        return {}
    brutas = await youtube_data_api.datas_de_publicacao(video_ids, api_key)
    datas: dict[str, str] = {}
    for video_id, publicado in brutas.items():
        compacta = _compactar_data_publicacao_iso(publicado)
        if compacta:
            datas[video_id] = compacta
    return datas


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
