"""A lista de projetos com o estado de cada um (D-703).

O caso de uso morava no router `projetos`. Cada projeto sai com as contagens
que a tela mostra: cortes, aprovados, com bruto, com metadado, publicados, com
vídeo pronto, no ar, a próxima publicação agendada, os Fires pendentes e as
redes do horizontal (D-987). Cinco consultas agrupadas por projeto — nenhuma
por projeto, sem N+1.

D-992: quem entra nas contagens é `ciclo_corte.CONTAM_NA_PUBLICACAO`, e não
só `aprovado`. O render final move o corte para `processado`, e com o filtro
antigo a live acabada zerava todas as colunas — o corte saía da conta por ter
terminado. Os nomes públicos (`total_aprovados`) são contrato com a tela e
ficaram como estavam; os internos passaram a dizer "entregue".
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from app.core.channel_paths import projetos_dir
from app.database import AsyncSessionLocal
from app.domain.corte.ciclo_corte import CONTAM_NA_PUBLICACAO
from app.domain.projeto.redes_do_projeto import (
    TIKTOK_HORIZONTAL,
    YOUTUBE_HORIZONTAL,
    redes_do_projeto,
)
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
        com_meta = await _entregues_com_metadado(db, ids)
        fires = await _fires_pendentes(db, ids)
        entregues = await _cortes_entregues(db, ids)

    publicacao = _situacao_da_publicacao(entregues)
    lista = []
    for p in projetos:
        stats = cortes.get(p.id)
        situacao = publicacao.get(p.id) or _SituacaoDoProjeto()
        item = {c: getattr(p, c) for c in _COLUNAS_DA_LISTAGEM}
        item["total_cortes"] = stats.total if stats else 0
        item["total_publicados"] = stats.publicados if stats else 0
        item["total_aprovados"] = stats.aprovados if stats else 0
        item["total_com_raw"] = stats.com_raw if stats else 0
        item["total_com_meta"] = com_meta.get(p.id, 0)
        item["total_video_pronto"] = situacao.video_pronto
        item["total_publicos"] = situacao.no_ar
        item["proxima_publicacao"] = situacao.proxima
        item["fires_pendentes"] = fires.get(p.id, 0)
        item["redes_do_horizontal"] = redes_do_projeto(
            situacao.video_pronto, situacao.publicados_por_rede
        )
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
            func.count(case((Corte.status.in_(CONTAM_NA_PUBLICACAO), 1))).label("aprovados"),
            func.count(
                case(
                    (
                        and_(
                            Corte.status.in_(CONTAM_NA_PUBLICACAO),
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


async def _entregues_com_metadado(db: AsyncSession, ids: list[str]) -> dict[str, int]:
    res = await db.execute(
        select(Corte.projeto_id, func.count(MetadadoCorte.id).label("com_meta"))
        .join(MetadadoCorte, MetadadoCorte.corte_id == Corte.id)
        .where(
            Corte.projeto_id.in_(ids),
            Corte.status.in_(CONTAM_NA_PUBLICACAO),
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


async def _cortes_entregues(db: AsyncSession, ids: list[str]) -> list:
    res = await db.execute(
        select(
            Corte.projeto_id,
            Corte.id,
            Corte.youtube_video_id,
            Corte.youtube_scheduled_at,
            # D-987: a marca MANUAL do operador (D-512) é o único sinal de que o
            # 16:9 está no TikTok — e vem na mesma consulta, sem N+1.
            Corte.tiktok_publicado_em,
        ).where(Corte.projeto_id.in_(ids), Corte.status.in_(CONTAM_NA_PUBLICACAO))
    )
    return res.all()


@dataclass
class _SituacaoDoProjeto:
    """O que uma passada pelos cortes entregues rende por projeto."""

    video_pronto: int = 0
    no_ar: int = 0
    proxima: str = ""
    publicados_por_rede: dict[str, int] = field(default_factory=lambda: defaultdict(int))


def _situacao_da_publicacao(entregues: list) -> dict[str, _SituacaoDoProjeto]:
    """Por projeto: cortes com vídeo pronto, no ar, a próxima publicação e as redes.

    Vídeo pronto é o que já subiu ao YouTube ou tem o `video.mp4` final no disco.
    A próxima publicação é o agendamento futuro mais cedo, comparado como texto
    ISO, como sempre foi.

    D-987: as duas redes do horizontal contam DENTRO dessa população. Corte
    marcado no TikTok sem vídeo pronto não entra no denominador, e somá-lo
    acenderia a rede com mais publicados do que prontos.
    """
    pasta = projetos_dir()
    agora = datetime.now(UTC)
    por_projeto: dict[str, _SituacaoDoProjeto] = defaultdict(_SituacaoDoProjeto)
    for projeto_id, corte_id, youtube_id, agendado_para, tiktok_em in entregues:
        situacao = por_projeto[projeto_id]
        no_youtube = bool(youtube_id)
        if not (no_youtube or _video_no_disco(pasta, projeto_id, corte_id)):
            continue
        situacao.video_pronto += 1
        if no_youtube:
            situacao.publicados_por_rede[YOUTUBE_HORIZONTAL] += 1
            if ja_esta_no_ar(agendado_para, agora):
                situacao.no_ar += 1
            elif not situacao.proxima or agendado_para < situacao.proxima:
                situacao.proxima = agendado_para
        if tiktok_em:
            situacao.publicados_por_rede[TIKTOK_HORIZONTAL] += 1
    return por_projeto


def _video_no_disco(pasta: Path, projeto_id: str, corte_id: str) -> bool:
    return (pasta / projeto_id / "cortes" / corte_id / "upload_ready" / "video.mp4").exists()
