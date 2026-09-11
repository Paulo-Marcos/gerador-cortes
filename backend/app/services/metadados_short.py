"""O post de publicacao de um short: contexto, leitura e gravacao (D-565, onda 3).

A tabela `metadados_shorts` existe desde a D-452 e nunca foi preenchida por
ninguem: ate aqui a publicacao montava o texto na hora, a partir de
`titulo_sugerido` e `gancho` — dois campos escritos pela skill de shorts para a
CURADORIA, e nao para o feed.

Este servico e o que falta entre os dois: monta o material que a skill le, grava
o que ela escreveu, e entrega para a publicacao o texto quando ele existe.

Divisao de trabalho igual a das demais etapas (D-447): aqui mora o que toca
banco; as regras de texto vivem no dominio puro (`domain/metadados_short`) e a
chamada ao Claude vive em `claude_ia`.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.cenas_short_ia import recortar_transcricao
from app.domain.metadados_short import PostDoShort, hashtags_gravadas, normalizar_hashtags
from app.domain.publicacao import LIMITES, Plataforma
from app.models import Corte, MetadadoShort, Short
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Quantos titulos recentes vao no prompt, para a skill nao repetir estrutura.
_TITULOS_NO_HISTORICO = 12

# A plataforma mais APERTADA define onde o peso do titulo cai. Escrever para a
# folgada e descobrir no feed que os 60 caracteres bons ficaram atras do "mais".
_PLATAFORMA_DE_REFERENCIA = Plataforma.YOUTUBE_SHORTS


@dataclass(frozen=True)
class ContextoDoPost:
    """O material que a skill do post le."""

    short_id: str
    corte_id: str
    projeto_id: str
    titulo: str
    tema_central: str
    duracao_seg: float
    texto_transcricao: str
    gancho_na_tela: str
    titulos_recentes: str
    titulo_visivel: int
    titulo_max: int


async def montar_contexto(short_id: str) -> ContextoDoPost:
    """Reune o trecho, o gancho e o historico de titulos do canal.

    O GANCHO vai junto para NAO ser repetido — quem le o titulo ja o viu dentro
    do video, e repetir gasta o unico espaco que havia para acrescentar algo.

    Levanta `LookupError` (short ou corte inexistente) e `ValueError` quando o
    trecho nao tem fala: sem transcricao a skill so teria o titulo do corte, e o
    post sairia falando do corte inteiro em vez deste trecho.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        inicio = float(short.inicio_seg)
        fim = float(short.fim_seg)
        janela = recortar_transcricao(_json_lista(corte.transcricao_final), inicio, fim)
        if not janela:
            raise ValueError(
                "Este trecho nao tem fala transcrita — sem ela o post falaria do corte, "
                "nao deste short."
            )

        recentes = (
            await db.scalars(
                select(MetadadoShort.titulo_youtube)
                .where(MetadadoShort.titulo_youtube != "")
                .where(MetadadoShort.short_id != short_id)
                .order_by(MetadadoShort.atualizado_em.desc())
                .limit(_TITULOS_NO_HISTORICO)
            )
        ).all()

        limites = LIMITES[_PLATAFORMA_DE_REFERENCIA]
        # Import tardio: `services.shorts` importa este modulo indiretamente pela
        # cadeia da publicacao, e o topo criaria ciclo.
        from app.services.shorts import montar_texto_transcricao

        return ContextoDoPost(
            short_id=short.id,
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            titulo=short.titulo_sugerido or corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            duracao_seg=round(fim - inicio, 2),
            texto_transcricao=montar_texto_transcricao(janela),
            gancho_na_tela=short.gancho_tela or "(este short nao tem gancho)",
            titulos_recentes="\n".join(f"- {t}" for t in recentes) or "(nenhum ainda)",
            titulo_visivel=limites.titulo_visivel,
            titulo_max=limites.titulo_max,
        )


async def gravar(short_id: str, post: PostDoShort) -> dict:
    """Grava o post no `MetadadoShort`, criando o registro se ele nao existir.

    Post VAZIO (sem titulo) nao grava nada e devolve o que ja havia: a skill
    devolver lixo nao pode apagar o texto que o operador escreveu a mao.

    Levanta `LookupError` quando o short nao existe.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        meta = await _obter_ou_criar(db, short_id)
        if not post.vazio:
            meta.titulo_youtube = post.titulo
            meta.descricao_youtube = post.descricao
            meta.tags_youtube = json.dumps(post.hashtags, ensure_ascii=False)
            await db.commit()

        return _serializar(meta)


async def atualizar(
    short_id: str,
    *,
    titulo: str | None = None,
    descricao: str | None = None,
    hashtags: list[str] | None = None,
) -> dict:
    """Aplica a edicao manual do operador. Todo campo e opcional.

    Diferente de `gravar`, aqui string vazia APAGA — e assim que o operador tira
    um texto que a IA escreveu e ele nao quer.

    Levanta `LookupError` quando o short nao existe.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")

        meta = await _obter_ou_criar(db, short_id)
        if titulo is not None:
            meta.titulo_youtube = titulo.strip()
        if descricao is not None:
            meta.descricao_youtube = descricao.strip()
        if hashtags is not None:
            meta.tags_youtube = json.dumps(normalizar_hashtags(hashtags), ensure_ascii=False)
        await db.commit()
        return _serializar(meta)


async def obter(short_id: str) -> dict:
    """O post gravado, ou os campos vazios quando ainda nao ha nenhum."""
    async with AsyncSessionLocal() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
        if not meta:
            return {"titulo": "", "descricao": "", "hashtags": [], "gerado": False}
        return _serializar(meta)


async def _obter_ou_criar(db, short_id: str) -> MetadadoShort:
    meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short_id))
    if meta:
        return meta
    meta = MetadadoShort(id=str(uuid.uuid4()), short_id=short_id)
    db.add(meta)
    await db.flush()
    return meta


def _serializar(meta: MetadadoShort) -> dict:
    return {
        "titulo": meta.titulo_youtube,
        "descricao": meta.descricao_youtube,
        "hashtags": hashtags_gravadas(meta.tags_youtube),
        # A tela usa isto para dizer "ainda nao escrevi" em vez de mostrar
        # tres campos vazios que parecem defeito.
        "gerado": bool(meta.titulo_youtube),
    }


def _json_lista(bruto: str) -> list:
    """A transcricao do corte, desserializada.

    Fica aqui, e nao no dominio, porque e o mesmo utilitario local que os outros
    cinco servicos deste projeto ja repetem para o mesmo fim — unifica-los todos
    seria um refactor a parte. As HASHTAGS, essas sim, vao pelo dominio: elas sao
    lidas em dois lugares que ja tinham comecado a divergir.
    """
    try:
        valor = json.loads(bruto or "[]")
    except (ValueError, TypeError):
        return []
    return valor if isinstance(valor, list) else []
