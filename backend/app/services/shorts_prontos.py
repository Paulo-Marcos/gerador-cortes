"""D-611: a central de shorts prontos — tudo o que falta subir, de qualquer corte.

A prateleira do Fire (D-581) responde "o que deste corte eu despacho?". Esta
responde a mesma pergunta para a coleção inteira: o operador que senta para
publicar não pensa em corte, pensa em "o que ainda não foi".

Três consultas em lote (shorts, publicações, metadados) em vez de uma por
short: a central abre com dezenas de itens, e o N+1 apareceria já no primeiro
uso como lentidão.
"""

from __future__ import annotations

from app.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain import segmentos_short
from app.domain.metadados_short import hashtags_gravadas
from app.domain.shorts_prontos import plataformas_pendentes
from app.models import Corte, MetadadoShort, Projeto, PublicacaoShort, Short, StatusShort
from sqlalchemy import select


async def listar_prontos() -> list[dict]:
    """Os shorts renderizados que ainda faltam em alguma rede, do mais novo ao mais antigo."""
    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(Short, Corte, Projeto)
                .join(Corte, Corte.id == Short.corte_id)
                .join(Projeto, Projeto.id == Corte.projeto_id)
                .where(Short.status == StatusShort.RENDERIZADO)
                .where(Short.arquivo_short_path != "")
                .where(Corte.shorts_finalizados_em.is_(None))
                .order_by(Short.atualizado_em.desc())
            )
        ).all()
        if not linhas:
            return []

        ids = [short.id for short, _, _ in linhas]
        publicadas = await _publicadas_por_short(db, ids)
        metadados = {
            meta.short_id: meta
            for meta in (
                await db.execute(select(MetadadoShort).where(MetadadoShort.short_id.in_(ids)))
            ).scalars()
        }

    prontos = []
    for short, corte, projeto in linhas:
        ja_foi = publicadas.get(short.id, set())
        pendentes = plataformas_pendentes(ja_foi)
        arquivo = resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
        # Sem rede pendente o trabalho acabou; sem MP4 em disco (a limpeza pode
        # ter levado o arquivo por fora) não há o que subir.
        if not pendentes or not arquivo.is_file():
            continue
        prontos.append(
            _descrever(short, corte, projeto, metadados.get(short.id), ja_foi, pendentes)
        )
    return prontos


async def _publicadas_por_short(db, ids: list[str]) -> dict[str, set[str]]:
    """Por short, as redes onde ele JÁ está no ar (só conta `publicado_em`)."""
    linhas = (
        await db.execute(
            select(PublicacaoShort.alvo_id, PublicacaoShort.plataforma).where(
                PublicacaoShort.alvo_id.in_(ids),
                PublicacaoShort.publicado_em.is_not(None),
            )
        )
    ).all()
    mapa: dict[str, set[str]] = {}
    for alvo_id, plataforma in linhas:
        mapa.setdefault(alvo_id, set()).add(plataforma)
    return mapa


def _descrever(
    short: Short,
    corte: Corte,
    projeto: Projeto,
    meta: MetadadoShort | None,
    publicadas: set[str],
    pendentes: list[str],
) -> dict:
    tem_capa = bool(meta and meta.capa_path)
    return {
        "id": short.id,
        "corte_id": short.corte_id,
        "numero": short.numero,
        "titulo": short.titulo_sugerido,
        "status": short.status,
        "arquivo_short_path": short.arquivo_short_path,
        "inicio_seg": short.inicio_seg,
        # A LÍQUIDA, como no resto da fábrica (D-604): é o número que a rede vê.
        "duracao_seg": round(
            segmentos_short.duracao_liquida(
                segmentos_short.de_json(short.segmentos),
                inicio_seg=float(short.inicio_seg),
                fim_seg=float(short.fim_seg),
            ),
            2,
        ),
        "corte_numero": corte.numero,
        "corte_titulo": corte.titulo_proposto,
        "projeto_id": projeto.id,
        "projeto_titulo": projeto.titulo_live,
        "publicadas": sorted(publicadas),
        "pendentes": pendentes,
        # Post e capa viajam resumidos: é o que o cartão precisa para dizer
        # "falta" sem abrir uma requisição por short. O detalhe vem ao abrir.
        "post": {
            "gerado": bool(meta and meta.titulo_youtube),
            "titulo": meta.titulo_youtube if meta else "",
            "hashtags": len(hashtags_gravadas(meta.tags_youtube)) if meta else 0,
        },
        "capa": {
            "tem_capa": tem_capa,
            "instante_seg": meta.capa_instante_seg if tem_capa else 0.0,
        },
        "atualizado_em": short.atualizado_em.isoformat() if short.atualizado_em else "",
    }
