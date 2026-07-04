"""Orquestra o ranking de lives candidatas (F-052).

Combina três fontes:
  1. YouTube Data API (search + statistics + commentThreads).
  2. Claude CLI para análise de sentimento dos comentários.
  3. Domain puro `ranking_lives` para a pontuação final.

Cache: o serviço regenera o ranking quando o `fetched_at` mais recente em
`live_candidatas` for mais antigo que `settings.ranking_cache_horas` (ou
quando o GET pedir `forcar_refresh=True`).
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import UTC, datetime, timedelta

from app.config import settings
from app.database import AsyncSessionLocal
from app.domain.ranking_lives import (
    PesosRanking,
    SinaisLive,
    pontuar_lote,
)
from app.infrastructure import claude_cli_client
from app.infrastructure.youtube_data_api import (
    ComentarioTopo,
    VideoResumo,
    VideoStats,
    YoutubeDataApiError,
    buscar_stats_videos,
    buscar_top_comentarios,
    buscar_videos_do_canal,
    resolver_canal_id,
)
from app.models import LiveCandidata, Projeto, StatusLiveCandidata
from app.services import channels
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# Janelas de fallback quando o lote inicial não fecha 20 candidatas elegíveis.
# Começa em 3m (regra do operador) e expande até 24m antes de desistir.
_JANELAS_FALLBACK_MESES = [3, 6, 12, 24]


def _pesos_atuais() -> PesosRanking:
    return PesosRanking(
        views=settings.ranking_peso_views,
        likes_por_view=settings.ranking_peso_likes_por_view,
        comentarios_por_view=settings.ranking_peso_comentarios_por_view,
        sentimento=settings.ranking_peso_sentimento,
        recencia=settings.ranking_peso_recencia,
    )


async def _video_ids_indisponiveis(db: AsyncSession) -> set[str]:
    """video_ids que NÃO podem mais aparecer no ranking.

    Inclui:
      - projetos já criados (qualquer status), porque o vídeo já entrou na
        pipeline pelo botão "Baixar e cortar" ou pelo browser legado;
      - candidatas marcadas como REJEITADA.
    """
    indisponiveis: set[str] = set()
    res = await db.execute(select(Projeto.youtube_url))
    for url in res.scalars().all():
        vid = _extrair_video_id_de_url(url)
        if vid:
            indisponiveis.add(vid)
    res = await db.execute(
        select(LiveCandidata.video_id).where(LiveCandidata.status == StatusLiveCandidata.REJEITADA)
    )
    indisponiveis.update(res.scalars().all())
    return indisponiveis


def _extrair_video_id_de_url(url: str) -> str | None:
    """Aceita as duas formas que o projeto persiste: `watch?v=` e `youtu.be/`."""
    if not url:
        return None
    if "watch?v=" in url:
        return url.split("watch?v=", 1)[1].split("&", 1)[0]
    if "youtu.be/" in url:
        return url.split("youtu.be/", 1)[1].split("?", 1)[0]
    return None


def _ranking_esta_atualizado(mais_recente: datetime | None) -> bool:
    if not mais_recente:
        return False
    if mais_recente.tzinfo is None:
        mais_recente = mais_recente.replace(tzinfo=UTC)
    agora = datetime.now(UTC)
    return (agora - mais_recente) < timedelta(hours=settings.ranking_cache_horas)


# ─── Sentimento via Claude CLI ────────────────────────────────────────────────


async def avaliar_sentimento_dos_comentarios(
    comentarios: list[ComentarioTopo],
) -> tuple[float, list[str]]:
    """Manda os comentários para o Claude e devolve (score 0-10, destaques).

    Score 5 é o ponto neutro (nenhum sinal). Sem comentários, devolve 5 e [].
    """
    if not comentarios:
        return 5.0, []

    linhas = []
    for idx, c in enumerate(comentarios, start=1):
        texto = (c.texto or "").replace("\n", " ").strip()
        if not texto:
            continue
        linhas.append(f"[{idx}] (👍 {c.likes}) {texto[:280]}")
    if not linhas:
        return 5.0, []

    prompt = (
        "Você analisa o tom dos comentários do público de uma LIVE de "
        "política/filosofia/cultura. Devolva JSON puro nesse formato:\n"
        '{"score": <inteiro 0-10>, "destaques": ["frase curta", ...]}\n\n'
        "Regras:\n"
        '- 10 = entusiasmo claro ("melhor live", "obrigado", '
        '"esclarecedor"). 0 = rejeição/repulsa.\n'
        "- 5 = neutro/genérico.\n"
        "- destaques: até 3 frases curtas (≤80 chars) que justifiquem a nota; "
        "extraia trechos reais dos comentários abaixo, sem inventar.\n"
        "- Likes em (👍 N) indicam quão amplificado o comentário é — pese mais.\n"
        "- Ignore ironia óbvia.\n\n"
        "COMENTÁRIOS:\n" + "\n".join(linhas) + "\n\n"
        "Responda APENAS o JSON, sem comentário em volta."
    )

    try:
        bruto = await claude_cli_client.generate_json(
            prompt, model=settings.claude_model_ranking_sentimento
        )
    except claude_cli_client.ClaudeCliError as exc:
        logger.warning("[Ranking] Sentimento via Claude falhou (%s) — uso neutro", exc)
        return 5.0, []

    score = float(bruto.get("score") or 5)
    score = max(0.0, min(10.0, score))
    destaques = [str(d).strip() for d in (bruto.get("destaques") or []) if str(d).strip()]
    return score, destaques[:3]


# ─── Geração do ranking ───────────────────────────────────────────────────────


async def gerar_ranking(*, forcar_refresh: bool = False) -> dict:
    """Gera ou atualiza o ranking e devolve os top-N candidatos PENDENTES.

    Quando o cache (`live_candidatas.fetched_at`) ainda está válido e não
    foi pedido refresh, lê só do banco. Caso contrário, busca lives do
    canal-fonte (`channels.identidade_do_canal_ativo().youtube_channel_id`) e
    refaz o batch.

    Retorno: `{"lives": [...], "atualizado_em": <ISO>, "janela_meses": N}`.
    """
    canal_fonte = channels.identidade_do_canal_ativo().youtube_channel_id
    if not canal_fonte:
        raise YoutubeDataApiError("youtube_channel_id não configurado no canal ativo")

    async with AsyncSessionLocal() as db:
        if not forcar_refresh:
            res = await db.execute(
                select(LiveCandidata)
                .where(LiveCandidata.status == StatusLiveCandidata.PENDENTE)
                .order_by(LiveCandidata.pontuacao_total.desc())
            )
            cache = list(res.scalars().all())
            if cache:
                mais_recente = max(c.fetched_at for c in cache if c.fetched_at)
                if _ranking_esta_atualizado(mais_recente):
                    return _empacotar_resposta(cache[: settings.ranking_top])

    canal_id_resolvido = await resolver_canal_id(canal_fonte)

    # Tenta janelas crescentes até fechar `ranking_top` candidatos elegíveis.
    candidatas_persistidas: list[LiveCandidata] = []
    janela_usada = settings.ranking_janela_meses_inicial
    for janela in _janelas_a_tentar():
        videos = await _coletar_videos(canal_id_resolvido, janela_meses=janela)
        async with AsyncSessionLocal() as db:
            indisponiveis = await _video_ids_indisponiveis(db)
        elegiveis = [v for v in videos if v.video_id not in indisponiveis]
        if not elegiveis:
            continue

        candidatas_persistidas = await _avaliar_e_persistir(elegiveis)
        janela_usada = janela
        if len(candidatas_persistidas) >= settings.ranking_top:
            break

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(LiveCandidata)
            .where(LiveCandidata.status == StatusLiveCandidata.PENDENTE)
            .order_by(LiveCandidata.pontuacao_total.desc())
        )
        top = list(res.scalars().all())[: settings.ranking_top]

    resposta = _empacotar_resposta(top)
    resposta["janela_meses"] = janela_usada
    return resposta


def _janelas_a_tentar() -> list[int]:
    """Sequência crescente de janelas começando pela inicial configurada."""
    inicio = settings.ranking_janela_meses_inicial
    teto = settings.ranking_janela_meses_max
    janelas = [m for m in _JANELAS_FALLBACK_MESES if inicio <= m <= teto]
    if not janelas:
        janelas = [teto]
    return janelas


async def _coletar_videos(channel_id: str, *, janela_meses: int) -> list[VideoResumo]:
    """search.list janela X meses → resumo dos vídeos (sem stats ainda)."""
    publicado_apos = datetime.now(UTC) - timedelta(days=janela_meses * 30)
    # Pega um overshoot razoável: para top 20, buscar até 80 lives para sobrar
    # margem após filtros (já-baixadas, comentários off, etc.).
    teto = max(settings.ranking_top * 4, 60)
    return await buscar_videos_do_canal(
        channel_id,
        published_after=publicado_apos,
        max_results=teto,
        event_type="completed",
    )


async def _avaliar_e_persistir(videos: list[VideoResumo]) -> list[LiveCandidata]:
    """Pipeline completo de uma rodada de avaliação."""
    if not videos:
        return []

    video_ids = [v.video_id for v in videos]
    stats_map = await buscar_stats_videos(video_ids)

    # Comentários + sentimento em paralelo (respeita o semáforo interno do CLI).
    sentimentos = await _avaliar_sentimentos_em_paralelo(video_ids)

    sinais: list[SinaisLive] = []
    for video in videos:
        stats = stats_map.get(video.video_id) or VideoStats(video.video_id, 0, 0, 0)
        score_sent, _ = sentimentos.get(video.video_id, (5.0, []))
        sinais.append(
            SinaisLive(
                video_id=video.video_id,
                views=stats.views,
                likes=stats.likes,
                comentarios=stats.comentarios,
                sentimento_0a10=score_sent,
                data_publicacao=video.publicado_em,
            )
        )

    pontuadas = pontuar_lote(sinais, _pesos_atuais())
    pontuadas_map = {p.video_id: p for p in pontuadas}

    agora = datetime.utcnow()
    persistidas: list[LiveCandidata] = []
    async with AsyncSessionLocal() as db:
        for video in videos:
            ponto = pontuadas_map.get(video.video_id)
            stats = stats_map.get(video.video_id) or VideoStats(video.video_id, 0, 0, 0)
            score_sent, destaques = sentimentos.get(video.video_id, (5.0, []))

            existente = await _carregar_por_video_id(db, video.video_id)
            if existente and existente.status != StatusLiveCandidata.PENDENTE:
                # Já foi promovida ou rejeitada — preserva, não sobrescreve.
                continue

            destino = existente or LiveCandidata(
                id=str(uuid.uuid4()),
                video_id=video.video_id,
                status=StatusLiveCandidata.PENDENTE,
            )
            destino.canal_id = video.canal_id
            destino.canal_origem = video.canal_titulo
            destino.titulo = video.titulo
            destino.thumbnail_url = video.thumbnail_url
            destino.duracao_iso = video.duracao_iso
            destino.data_publicacao = video.publicado_em.replace(tzinfo=None)
            destino.views = stats.views
            destino.likes = stats.likes
            destino.comentarios = stats.comentarios
            destino.sentimento_score = score_sent
            destino.sentimento_destaques = json.dumps(destaques, ensure_ascii=False)
            destino.pontuacao_total = ponto.pontuacao_total if ponto else 0.0
            destino.componentes_pontuacao = json.dumps(
                ponto.componentes if ponto else {}, ensure_ascii=False
            )
            destino.fetched_at = agora

            if not existente:
                db.add(destino)
            persistidas.append(destino)
        await db.commit()
    return persistidas


async def _avaliar_sentimentos_em_paralelo(
    video_ids: list[str],
) -> dict[str, tuple[float, list[str]]]:
    async def _avaliar(vid: str) -> tuple[str, tuple[float, list[str]]]:
        try:
            comentarios = await buscar_top_comentarios(
                vid, max_comentarios=settings.ranking_max_comentarios_por_live
            )
        except YoutubeDataApiError as exc:
            logger.warning("[Ranking] falha ao buscar comentários de %s: %s", vid, exc)
            return vid, (5.0, [])
        score, destaques = await avaliar_sentimento_dos_comentarios(comentarios)
        return vid, (score, destaques)

    resultados = await asyncio.gather(*(_avaliar(v) for v in video_ids))
    return dict(resultados)


async def _carregar_por_video_id(db: AsyncSession, video_id: str) -> LiveCandidata | None:
    res = await db.execute(select(LiveCandidata).where(LiveCandidata.video_id == video_id).limit(1))
    return res.scalar_one_or_none()


# ─── Operações ponto-a-ponto ──────────────────────────────────────────────────


async def rejeitar_candidata(video_id: str) -> dict:
    """Marca uma candidata como REJEITADA. A próxima da fila assume a 20ª vaga."""
    async with AsyncSessionLocal() as db:
        candidata = await _carregar_por_video_id(db, video_id)
        if not candidata:
            raise LookupError(f"Candidata {video_id!r} não encontrada")
        if candidata.status == StatusLiveCandidata.PROMOVIDA:
            raise ValueError(f"Candidata {video_id!r} já foi promovida a projeto; não é rejeitável")
        candidata.status = StatusLiveCandidata.REJEITADA
        await db.commit()
        return {"video_id": video_id, "status": candidata.status}


async def marcar_promovida(video_id: str, projeto_id: str) -> None:
    """Liga uma candidata a um projeto recém-criado e tira do ranking."""
    async with AsyncSessionLocal() as db:
        candidata = await _carregar_por_video_id(db, video_id)
        if not candidata:
            return
        candidata.status = StatusLiveCandidata.PROMOVIDA
        candidata.projeto_id = projeto_id
        await db.commit()


# ─── Empacotamento de resposta ────────────────────────────────────────────────


def _empacotar_resposta(candidatas: list[LiveCandidata]) -> dict:
    return {
        "lives": [_serializar(c) for c in candidatas],
        "atualizado_em": _iso_or_empty(
            max((c.fetched_at for c in candidatas if c.fetched_at), default=None)
        ),
    }


def _serializar(c: LiveCandidata) -> dict:
    return {
        "id": c.id,
        "video_id": c.video_id,
        "titulo": c.titulo,
        "canal_origem": c.canal_origem,
        "youtube_url": f"https://www.youtube.com/watch?v={c.video_id}",
        "thumbnail_url": c.thumbnail_url,
        "duracao_iso": c.duracao_iso,
        "data_publicacao": _iso_or_empty(c.data_publicacao),
        "views": c.views,
        "likes": c.likes,
        "comentarios": c.comentarios,
        "sentimento_score": round(c.sentimento_score, 2),
        "sentimento_destaques": json.loads(c.sentimento_destaques or "[]"),
        "pontuacao_total": round(c.pontuacao_total, 2),
        "componentes_pontuacao": json.loads(c.componentes_pontuacao or "{}"),
        "status": c.status,
        "fetched_at": _iso_or_empty(c.fetched_at),
    }


def _iso_or_empty(dt: datetime | None) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
