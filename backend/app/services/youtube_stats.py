"""D-305: sincroniza as estatísticas do YouTube dos vídeos do canal e as cruza
com os cortes locais.

Orquestra a infra (`infrastructure/youtube_analytics.py`, chamadas OAuth
bloqueantes rodadas em thread) e o domínio puro (`domain/publicacao/youtube_stats.py`,
agregações). Responsabilidades:

- **sync** (idempotente, upsert por `video_id`): lista uploads do canal + puxa
  métricas lifetime e grava/atualiza `YoutubeVideoStat`.
- **casamento** vídeo↔corte: por `Corte.youtube_video_id` e, na falta, por
  título normalizado (heurístico, marcado `match_por_titulo`).
- **staleness**: o status informa `sincronizado_em` e se está velho; como o sync
  é idempotente, pode ser redisparado à vontade (não há agendador embutido — o
  lifespan é território travado; ver o relatório do D-305).
- **levantamentos**: duração×retenção e título×desempenho (JSON/CSV), o insumo
  para calibrar os próximos cortes.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.publicacao import youtube_stats as dom
from app.infrastructure import youtube_analytics
from app.infrastructure.youtube_analytics import YoutubeAnalyticsError
from app.models import Corte, MetadadoCorte, YoutubeVideoStat
from app.services.app_logging import operational_error, operational_info
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Além de quantos dias sem sincronizar o levantamento é considerado "velho".
# Só um sinal para a UI/relatório: o sync pode ser refeito quando o operador
# quiser (upsert idempotente).
DIAS_STALE = 7

# Janela do relatório do Analytics: do começo do YouTube até hoje = lifetime.
_DATA_INICIO_LIFETIME = "2005-01-01"


class YoutubeStatsService:
    @staticmethod
    async def verificar_credenciais() -> dict:
        """Pré-checa o token/escopo SEM disparar o sync pesado.

        Usado pelo endpoint de sync para responder na hora com instrução clara
        quando falta o escopo de analytics, em vez de sumir com o erro dentro de
        uma task fire-and-forget.
        """
        try:
            await asyncio.to_thread(youtube_analytics.carregar_credenciais)
        except YoutubeAnalyticsError as exc:
            return {
                "status": "erro",
                "precisa_reautorizar": exc.precisa_reautorizar,
                "mensagem": str(exc),
            }
        return {"status": "ok"}

    @staticmethod
    async def sincronizar() -> dict:
        """Varre uploads do canal + métricas lifetime e faz upsert local.

        Erro de token/escopo NÃO levanta: devolve `{status: erro, ...}` para o
        chamador (ou para o log, quando roda em background)."""
        try:
            creds = await asyncio.to_thread(youtube_analytics.carregar_credenciais)
        except YoutubeAnalyticsError as exc:
            operational_error("YouTubeStats", f"Sync abortado: {exc}")
            return _erro(exc)

        start_date, end_date = _janela_lifetime()
        try:
            canal_id, uploads = await asyncio.to_thread(youtube_analytics.listar_uploads, creds)
            metricas = await asyncio.to_thread(
                youtube_analytics.metricas_lifetime,
                creds,
                video_ids=[u.video_id for u in uploads],
                start_date=start_date,
                end_date=end_date,
            )
        except YoutubeAnalyticsError as exc:
            operational_error("YouTubeStats", f"Sync falhou: {exc}")
            return _erro(exc)

        agora = datetime.utcnow()
        async with AsyncSessionLocal() as db:
            total = await _upsert(db, canal_id, uploads, metricas, sincronizado_em=agora)
            casamento = await _casar_com_cortes(db)
            await db.commit()

        operational_info(
            "YouTubeStats",
            f"Sync concluído: {total} vídeos "
            f"({casamento['por_video_id']} casados por id, "
            f"{casamento['por_titulo']} por título).",
        )
        return {
            "status": "ok",
            "total": total,
            "com_metricas": sum(1 for u in uploads if u.video_id in metricas),
            "casados_por_video_id": casamento["por_video_id"],
            "casados_por_titulo": casamento["por_titulo"],
            "sincronizado_em": agora.isoformat(),
        }

    @staticmethod
    async def status(db: AsyncSession) -> dict:
        """Panorama do último sync + a lista de vídeos (para a UI e o relatório)."""
        stats = await _todos(db)
        ultimo = max((s.sincronizado_em for s in stats if s.sincronizado_em), default=None)
        return {
            "total": len(stats),
            "com_corte": sum(1 for s in stats if s.corte_id),
            "casados_por_titulo": sum(1 for s in stats if s.match_por_titulo),
            "sincronizado_em": ultimo.isoformat() if ultimo else None,
            "stale": _esta_stale(ultimo),
            "dias_desde_sync": _dias_desde(ultimo),
            "videos": [_serializar(s) for s in stats],
        }

    @staticmethod
    async def levantamento_duracao_retencao(db: AsyncSession) -> list[dict]:
        return dom.levantamento_duracao_retencao(await _videos_como_dicts(db))

    @staticmethod
    async def levantamento_titulo_desempenho(db: AsyncSession) -> list[dict]:
        return dom.levantamento_titulo_desempenho(await _videos_como_dicts(db))

    @staticmethod
    def csv_duracao_retencao(linhas: list[dict]) -> str:
        return dom.csv_duracao_retencao(linhas)

    @staticmethod
    def csv_titulo_desempenho(linhas: list[dict]) -> str:
        return dom.csv_titulo_desempenho(linhas)


# ── internos ────────────────────────────────────────────────────────────────


def _erro(exc: YoutubeAnalyticsError) -> dict:
    return {"status": "erro", "precisa_reautorizar": exc.precisa_reautorizar, "mensagem": str(exc)}


def _janela_lifetime() -> tuple[str, str]:
    return _DATA_INICIO_LIFETIME, datetime.utcnow().strftime("%Y-%m-%d")


async def _todos(db: AsyncSession) -> list[YoutubeVideoStat]:
    result = await db.execute(select(YoutubeVideoStat).order_by(YoutubeVideoStat.views.desc()))
    return list(result.scalars().all())


async def _upsert(
    db: AsyncSession,
    canal_id: str,
    uploads: list[youtube_analytics.VideoUpload],
    metricas: dict[str, youtube_analytics.VideoMetrica],
    *,
    sincronizado_em: datetime,
) -> int:
    """Upsert por `video_id`. Métricas ausentes neste sync preservam o último
    valor conhecido (não zeram um vídeo que só não teve dados nesta janela)."""
    result = await db.execute(select(YoutubeVideoStat))
    existentes = {s.video_id: s for s in result.scalars().all()}

    for upload in uploads:
        stat = existentes.get(upload.video_id)
        if stat is None:
            stat = YoutubeVideoStat(id=str(uuid.uuid4()), video_id=upload.video_id)
            db.add(stat)
            existentes[upload.video_id] = stat

        stat.canal_id = canal_id
        stat.titulo = upload.titulo
        stat.duracao_seg = upload.duracao_seg
        stat.publicado_em = upload.publicado_em
        stat.sincronizado_em = sincronizado_em

        metrica = metricas.get(upload.video_id)
        if metrica is not None:
            stat.views = metrica.views
            stat.estimated_minutes_watched = metrica.estimated_minutes_watched
            stat.average_view_duration_seg = metrica.average_view_duration_seg
            stat.average_view_percentage = metrica.average_view_percentage
            stat.subscribers_gained = metrica.subscribers_gained

    await db.flush()
    return len(uploads)


async def _casar_com_cortes(db: AsyncSession) -> dict:
    """Liga cada `YoutubeVideoStat` a um corte local.

    Preferência absoluta ao vínculo por `Corte.youtube_video_id`
    (match_por_titulo=0). Só os cortes SEM video_id conhecido entram no índice de
    título; um vídeo órfão casa por título quando o título normalizado bate com
    exatamente UM desses cortes (match_por_titulo=1). Ambíguo → fica sem casar.
    """
    stats = await _todos(db)
    cortes = list((await db.execute(select(Corte))).scalars().all())
    metadados = {m.corte_id: m for m in (await db.execute(select(MetadadoCorte))).scalars().all()}

    corte_por_video_id = {c.youtube_video_id: c.id for c in cortes if c.youtube_video_id}
    cortes_por_titulo: dict[str, list[str]] = {}
    for corte in cortes:
        if corte.youtube_video_id:
            continue  # já casa por id — não vira alvo de casamento por título
        metadado = metadados.get(corte.id)
        bruto = (metadado.titulo_youtube if metadado and metadado.titulo_youtube else "") or (
            corte.titulo_proposto or ""
        )
        normalizado = dom.normalizar_titulo(bruto)
        if normalizado:
            cortes_por_titulo.setdefault(normalizado, []).append(corte.id)

    por_video_id = 0
    por_titulo = 0
    for stat in stats:
        corte_id = corte_por_video_id.get(stat.video_id)
        if corte_id is not None:
            stat.corte_id = corte_id
            stat.match_por_titulo = 0
            por_video_id += 1
            continue
        candidatos = cortes_por_titulo.get(dom.normalizar_titulo(stat.titulo), [])
        if len(candidatos) == 1:
            stat.corte_id = candidatos[0]
            stat.match_por_titulo = 1
            por_titulo += 1

    await db.flush()
    return {"por_video_id": por_video_id, "por_titulo": por_titulo}


async def _videos_como_dicts(db: AsyncSession) -> list[dict]:
    return [_serializar(s) for s in await _todos(db)]


def _serializar(stat: YoutubeVideoStat) -> dict:
    return {
        "video_id": stat.video_id,
        "canal_id": stat.canal_id,
        "titulo": stat.titulo,
        "duracao_seg": stat.duracao_seg,
        "publicado_em": stat.publicado_em.isoformat() if stat.publicado_em else None,
        "views": stat.views,
        "estimated_minutes_watched": stat.estimated_minutes_watched,
        "average_view_duration_seg": stat.average_view_duration_seg,
        "average_view_percentage": stat.average_view_percentage,
        "subscribers_gained": stat.subscribers_gained,
        "corte_id": stat.corte_id,
        "match_por_titulo": bool(stat.match_por_titulo),
        "sincronizado_em": stat.sincronizado_em.isoformat() if stat.sincronizado_em else None,
    }


def _esta_stale(ultimo: datetime | None) -> bool:
    if ultimo is None:
        return True
    return (datetime.utcnow() - ultimo).days >= DIAS_STALE


def _dias_desde(ultimo: datetime | None) -> int | None:
    if ultimo is None:
        return None
    return (datetime.utcnow() - ultimo).days
