"""Destinos de publicação — a camada plugável (D-467).

A decisão do dev foi "manual agora, API depois, sem reescrita". Isso só se
sustenta se os dois modos forem o MESMO contrato com transportes diferentes:

    preparar(short) → PacotePublicacao → publicar(pacote)

`preparar` é comum a todos: pega o MP4, adapta o texto aos limites da plataforma
e junta os avisos. `publicar` é o que muda — no destino de API vira chamada HTTP;
no manual vira uma pasta pronta que o operador sobe do celular.

Quando o app review do Instagram e do TikTok sair, o destino novo entra no
registro e nada mais muda: nem a tela, nem o preparo, nem os metadados.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.publicacao import (
    LIMITES,
    MetadadosBase,
    MetadadosPublicacao,
    ModoPublicacao,
    Plataforma,
    adaptar,
    validar,
)
from app.models import Corte, MetadadoCorte, MetadadoShort, Short

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContextoPublicacao:
    """O vídeo pronto + o que se sabe dele, antes de virar publicação."""

    short_id: str
    arquivo: Path
    duracao_seg: float
    vertical: bool
    base: MetadadosBase
    # D-518: a imagem de capa, quando existe. O TikTok deixa escolher a capa no
    # upload, e sem ela ele congela um frame qualquer do video — normalmente um
    # meio-piscar. `None` e um estado legitimo: nem todo corte tem thumbnail
    # gerada ainda, e o pacote precisa dizer isso em vez de omitir.
    capa: Path | None = None


@dataclass(frozen=True)
class PacotePublicacao:
    """Tudo que uma plataforma precisa receber, já adaptado.

    `avisos` não bloqueia: um Reels de 95 segundos ainda pode ser publicado à
    mão com um corte, e cabe ao operador decidir. O que não pode é ele
    descobrir o problema depois do upload.
    """

    plataforma: Plataforma
    modo: ModoPublicacao
    arquivo: Path
    metadados: MetadadosPublicacao
    capa: Path | None = None
    avisos: list[str] = field(default_factory=list)

    @property
    def publicavel_por_api(self) -> bool:
        return self.modo is ModoPublicacao.API


class Destino:
    """Base dos destinos. Subclasse define `plataforma`, `modo` e `publicar`."""

    plataforma: Plataforma
    modo: ModoPublicacao = ModoPublicacao.MANUAL

    async def preparar(self, contexto: ContextoPublicacao) -> PacotePublicacao:
        """Adapta o texto e recolhe os avisos — comum a todos os destinos."""
        return PacotePublicacao(
            plataforma=self.plataforma,
            modo=self.modo,
            arquivo=contexto.arquivo,
            capa=contexto.capa,
            metadados=adaptar(contexto.base, self.plataforma),
            avisos=validar(
                self.plataforma,
                duracao_seg=contexto.duracao_seg,
                vertical=contexto.vertical,
            ),
        )

    async def publicar(self, pacote: PacotePublicacao) -> dict:
        """Entrega o vídeo. Destino manual devolve o caminho do pacote."""
        raise NotImplementedError(
            f"{LIMITES[self.plataforma].rotulo} ainda nao tem transporte implementado."
        )


_REGISTRO: dict[Plataforma, Destino] = {}


def registrar(destino: Destino) -> None:
    """Torna um destino disponível. Chamado no import do módulo do destino."""
    _REGISTRO[destino.plataforma] = destino


def destinos_disponiveis() -> list[Destino]:
    """Os destinos registrados, na ordem canônica das plataformas."""
    return [_REGISTRO[p] for p in Plataforma if p in _REGISTRO]


def obter_destino(plataforma: Plataforma) -> Destino:
    destino = _REGISTRO.get(plataforma)
    if destino is None:
        raise LookupError(f"Plataforma {plataforma!r} nao tem destino registrado.")
    return destino


async def montar_contexto(short_id: str) -> ContextoPublicacao:
    """Reúne o MP4 do short e os metadados editoriais que já existem.

    Levanta `LookupError` (short inexistente) e `ValueError` (short ainda não
    renderizado — sem arquivo não há o que publicar).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        if not short.arquivo_short_path:
            raise ValueError("Este short ainda nao foi renderizado.")
        arquivo = resolver_do_projeto(short.arquivo_short_path, corte.projeto_id)
        if not arquivo.is_file():
            raise ValueError("O arquivo do short nao esta mais em disco.")

        return ContextoPublicacao(
            short_id=short.id,
            arquivo=arquivo,
            duracao_seg=round(float(short.fim_seg) - float(short.inicio_seg), 2),
            # Todo short que este pipeline produz e vertical (D-463/D-466); o
            # horizontal entra por outro caminho, com o MP4 do corte longo.
            vertical=True,
            capa=await _capa_do_short(db, short, corte),
            base=await _texto_do_short(db, short, corte),
        )


async def _capa_do_short(db, short: Short, corte: Corte) -> Path | None:
    """O quadro de capa do short, se ele existe em disco (D-565, onda 4).

    Diferente da capa do CORTE, que e uma arte montada: aqui e um frame do
    proprio short, porque ele ja e 9:16 e ja veste a identidade do canal — a
    montagem existe la para resolver o problema do video deitado, que este nao
    tem.

    `None` quando nao ha capa escolhida, e tambem quando o caminho gravado nao
    aponta mais para um arquivo. E a mesma regra do corte: o operador escolhe um
    quadro na hora do upload, o que e melhor que o pacote levar um caminho morto.
    """
    from sqlalchemy import select

    meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short.id))
    if not meta or not meta.capa_path:
        return None

    caminho = resolver_do_projeto(meta.capa_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


async def _texto_do_short(db, short: Short, corte: Corte) -> MetadadosBase:
    """O texto de publicacao do short: o escrito, ou o de antes (D-565, onda 3).

    A PREFERENCIA e o `MetadadoShort` — escrito pela skill do post e revisado
    pelo operador, para o feed. O FALLBACK e o que esta funcao fazia sozinha ate
    aqui: `titulo_sugerido` + `gancho`, dois campos que a skill de shorts produz
    para a CURADORIA, nao para quem assiste.

    O fallback fica, e nao e transitorio: short que nunca passou pelo modal de
    post continua publicavel, com o texto de sempre. Exigir a etapa nova
    quebraria os candidatos que ja existem em PROD, e por um motivo burocratico
    — o video esta pronto.

    As hashtags seguem o mesmo criterio, mas SEPARADAS do titulo: um post pode
    ter titulo proprio e nenhuma hashtag escrita, e nesse caso as do corte ainda
    sao melhores que nenhuma.
    """
    from sqlalchemy import select

    meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == short.id))
    proprio = meta.titulo_youtube if meta else ""

    return MetadadosBase(
        titulo=proprio or short.titulo_sugerido or corte.titulo_proposto or "",
        descricao=(meta.descricao_youtube if meta and proprio else "") or short.gancho or "",
        hashtags=_hashtags_do_post(meta) or await _hashtags_do_corte(db, corte),
        url_video_longo=corte.youtube_url_publicado or "",
    )


def _hashtags_do_post(meta: MetadadoShort | None) -> list[str]:
    """As hashtags escritas para ESTE short, se houver.

    A desserializacao vem do dominio: a tela le o mesmo campo para edita-las, e
    duas leituras com tratamento de erro proprio ja tinham comecado a divergir.
    """
    from app.domain.metadados_short import hashtags_gravadas

    return hashtags_gravadas(meta.tags_youtube) if meta else []


async def montar_contexto_do_corte(corte_id: str) -> ContextoPublicacao:
    """O MP4 HORIZONTAL do corte, para o TikTok (D-470).

    O TikTok aceita 16:9 e ainda da impulso a landscape acima de 60s. O ganho e
    presenca e descoberta, nao watch time — video deitado toca em janela pequena
    com tarjas. Como o arquivo ja existe (e o mesmo que foi para o YouTube), o
    custo de estar la tambem e so o upload.

    Reusa o MESMO contrato do short: muda a origem do arquivo e o `vertical`.
    Levanta `LookupError`/`ValueError` como o caminho do short.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        arquivo = (
            projetos_dir() / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
        )
        if not arquivo.is_file():
            raise ValueError(
                "O video final deste corte nao esta em upload_ready — gere o corte antes."
            )

        return ContextoPublicacao(
            short_id=corte.id,
            arquivo=arquivo,
            duracao_seg=round(float(corte.duracao_clip_seg or 0.0), 2),
            vertical=False,
            capa=await _capa_do_corte(db, corte),
            base=MetadadosBase(
                titulo=corte.titulo_proposto or "",
                descricao=corte.resumo or "",
                hashtags=await _hashtags_do_corte(db, corte),
                # O corte E o video longo: repetir o proprio link como CTA seria
                # mandar o espectador de volta para onde ele ja esta.
                url_video_longo="",
            ),
        )


async def _capa_do_corte(db, corte: Corte) -> Path | None:
    """A capa VERTICAL do corte, se ela existe em disco (D-518, D-522).

    A D-518 usava aqui a thumbnail do YouTube, e a premissa estava errada: a
    capa do TikTok e 9:16 mesmo para o video deitado — o video toca com tarjas
    dentro do quadro vertical, mas a capa ocupa o quadro inteiro. A imagem 16:9
    virava uma faixa fina num retangulo vazio, e na grade do perfil, que recorta
    a capa no quadrado central, quase desaparecia.

    Sem capa vertical, devolve `None` — e NAO cai para a 16:9. Entregar a capa
    errada e pior que declarar a ausencia: no segundo caso o operador escolhe um
    frame na hora do upload; no primeiro ele publica um retangulo vazio sem
    saber.

    Tambem `None` quando o caminho gravado nao aponta mais para um arquivo: a
    limpeza de retencao apaga imagem antiga, e um caminho morto no pacote e pior
    que a ausencia declarada.
    """
    from sqlalchemy import select

    resultado = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id))
    meta = resultado.scalar_one_or_none()
    if not meta or not meta.thumbnail_tiktok_path:
        return None

    caminho = resolver_do_projeto(meta.thumbnail_tiktok_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


async def _hashtags_do_corte(db, corte: Corte) -> list[str]:
    """As hashtags do corte — das TAGS curadas, não do tema (D-535).

    O tema central é uma frase editorial: "O fetiche da derrota e a romantização
    da fraqueza na simbologia de esquerda". Usá-lo como hashtag produzia aquilo
    tudo junto e sem espaços — uma etiqueta que ninguém digita e nenhuma página
    de hashtag indexa.

    As `tags_youtube` do metadado já são o que uma hashtag quer ser: termos
    curtos e buscáveis, escritos por quem conhece o assunto — "banco master",
    "daniel vorcaro", "pix". Estavam ali o tempo todo, ignoradas.

    O tema sobra como reserva, e só quando ele mesmo é curto: um tema de duas
    palavras vira uma hashtag legítima; a normalização descarta o resto.
    """
    from sqlalchemy import select as _select

    resultado = await db.execute(_select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id))
    meta = resultado.scalar_one_or_none()

    tags: list[str] = []
    if meta and meta.tags_youtube:
        try:
            tags = [str(t) for t in json.loads(meta.tags_youtube)]
        except (ValueError, TypeError):
            logger.warning("[Publicacao] tags_youtube de %s nao e JSON", corte.id[:8])

    tema = (corte.tema_central or "").strip()
    if tema:
        tags.append(tema)
    return tags
