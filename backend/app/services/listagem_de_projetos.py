"""A lista de projetos com o estado de cada um (D-703).

O caso de uso morava no router `projetos`. Cada projeto sai com as contagens
que a tela mostra: cortes, aprovados, com bruto, com metadado, publicados, com
vídeo pronto, no ar, a próxima publicação agendada e os Fires pendentes. Cinco
consultas agrupadas por projeto — nenhuma por projeto, sem N+1.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain.publicacao.agendamento import ja_esta_no_ar
from app.models import Corte, MetadadoCorte, Projeto, StatusCorte
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

# D-431: `transcricao_raw` guarda a transcrição inteira da live (dezenas de MB
# somados no acervo) e não faz parte de `ProjetoResponse` — sem o defer, cada poll
# da lista lia e hidratava esse volume só para o Pydantic descartá-lo. As duas
# constantes andam juntas de propósito: ler aqui uma coluna deferida dispararia
# lazy load, que sob AsyncSession estoura em greenlet_spawn.
_COLUNAS_DIFERIDAS_NA_LISTAGEM = ("transcricao_raw",)
_DEFERS_DA_LISTAGEM = tuple(defer(getattr(Projeto, c)) for c in _COLUNAS_DIFERIDAS_NA_LISTAGEM)
_COLUNAS_DA_LISTAGEM = [
    c for c in Projeto.__table__.columns.keys() if c not in _COLUNAS_DIFERIDAS_NA_LISTAGEM
]


async def listar_projetos() -> list[dict]:
    """Os projetos do mais novo ao mais velho (pela data da live), com as contagens."""
    async with AsyncSessionLocal() as db, db.begin():
        projetos = (
            (
                await db.execute(
                    select(Projeto)
                    .options(*_DEFERS_DA_LISTAGEM)
                    .order_by(Projeto.data_live.desc(), Projeto.criado_em.desc())
                )
            )
            .scalars()
            .all()
        )
        if not projetos:
            return []
        ids = [p.id for p in projetos]
        cortes = await _contagens_dos_cortes(db, ids)
        com_meta = await _aprovados_com_metadado(db, ids)
        fires = await _fires_pendentes(db, ids)
        aprovados = await _aprovados(db, ids)

    video_pronto, no_ar, proxima = _situacao_da_publicacao(aprovados)
    lista = []
    for p in projetos:
        stats = cortes.get(p.id)
        item = {c: getattr(p, c) for c in _COLUNAS_DA_LISTAGEM}
        item["total_cortes"] = stats.total if stats else 0
        item["total_publicados"] = stats.publicados if stats else 0
        item["total_aprovados"] = stats.aprovados if stats else 0
        item["total_com_raw"] = stats.com_raw if stats else 0
        item["total_com_meta"] = com_meta.get(p.id, 0)
        item["total_video_pronto"] = video_pronto.get(p.id, 0)
        item["total_publicos"] = no_ar.get(p.id, 0)
        item["proxima_publicacao"] = proxima.get(p.id, "")
        item["fires_pendentes"] = fires.get(p.id, 0)
        lista.append(item)
    return lista


async def _contagens_dos_cortes(db: AsyncSession, ids: list[str]) -> dict:
    res = await db.execute(
        select(
            Corte.projeto_id,
            func.count(case((Corte.status != StatusCorte.REJEITADO, 1))).label("total"),
            func.count(
                case(
                    (
                        and_(
                            Corte.status != StatusCorte.REJEITADO,
                            Corte.youtube_video_id.is_not(None),
                            Corte.youtube_video_id != "",
                        ),
                        1,
                    )
                )
            ).label("publicados"),
            func.count(case((Corte.status == StatusCorte.APROVADO, 1))).label("aprovados"),
            func.count(
                case(
                    (
                        and_(
                            Corte.status == StatusCorte.APROVADO,
                            Corte.arquivo_clip_path.is_not(None),
                            Corte.arquivo_clip_path != "",
                        ),
                        1,
                    )
                )
            ).label("com_raw"),
        )
        .where(Corte.projeto_id.in_(ids))
        .group_by(Corte.projeto_id)
    )
    return {row.projeto_id: row for row in res.all()}


async def _aprovados_com_metadado(db: AsyncSession, ids: list[str]) -> dict[str, int]:
    res = await db.execute(
        select(Corte.projeto_id, func.count(MetadadoCorte.id).label("com_meta"))
        .join(MetadadoCorte, MetadadoCorte.corte_id == Corte.id)
        .where(
            Corte.projeto_id.in_(ids),
            Corte.status == StatusCorte.APROVADO,
            MetadadoCorte.titulo_youtube != "",
            MetadadoCorte.titulo_youtube.is_not(None),
        )
        .group_by(Corte.projeto_id)
    )
    return {row.projeto_id: row.com_meta for row in res.all()}


async def _fires_pendentes(db: AsyncSession, ids: list[str]) -> dict[str, int]:
    res = await db.execute(
        select(Corte.projeto_id, func.count(Corte.id).label("total"))
        .where(
            Corte.projeto_id.in_(ids),
            Corte.is_fire,
            Corte.arquivo_clip_path.is_not(None),
            Corte.arquivo_clip_path != "",
            Corte.shorts_finalizados_em.is_(None),
        )
        .group_by(Corte.projeto_id)
    )
    return {row.projeto_id: row.total for row in res.all()}


async def _aprovados(db: AsyncSession, ids: list[str]) -> list:
    res = await db.execute(
        select(
            Corte.projeto_id, Corte.id, Corte.youtube_video_id, Corte.youtube_scheduled_at
        ).where(Corte.projeto_id.in_(ids), Corte.status == StatusCorte.APROVADO)
    )
    return res.all()


def _situacao_da_publicacao(aprovados: list) -> tuple[dict, dict, dict]:
    """Por projeto: cortes com vídeo pronto, cortes no ar e a próxima publicação.

    Vídeo pronto é o que já subiu ao YouTube ou tem o `video.mp4` final no disco.
    A próxima publicação é o agendamento futuro mais cedo, comparado como texto
    ISO, como sempre foi.
    """
    pasta = projetos_dir()
    agora = datetime.now(UTC)
    video_pronto: dict[str, int] = {}
    no_ar: dict[str, int] = {}
    proxima: dict[str, str] = {}
    for projeto_id, corte_id, youtube_id, agendado_para in aprovados:
        video_pronto.setdefault(projeto_id, 0)
        no_ar.setdefault(projeto_id, 0)
        if youtube_id:
            video_pronto[projeto_id] += 1
            if ja_esta_no_ar(agendado_para, agora):
                no_ar[projeto_id] += 1
            elif not proxima.get(projeto_id) or agendado_para < proxima[projeto_id]:
                proxima[projeto_id] = agendado_para
        elif (pasta / projeto_id / "cortes" / corte_id / "upload_ready" / "video.mp4").exists():
            video_pronto[projeto_id] += 1
    return video_pronto, no_ar, proxima
