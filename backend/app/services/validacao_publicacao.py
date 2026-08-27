"""Validação pré-publicação no YouTube (D-363).

Antes de subir um corte, confere se o pacote está completo e coerente:
vídeo final presente, duração final batendo com a líquida (trechos de fato
aplicados — o mesmo mismatch do D-362), cenas do roteiro visual, título,
descrição, tags e thumbnail.

Política (D-363/D-369): itens essenciais faltando BLOQUEIAM o upload (vídeo
final, título, descrição, tags, thumbnail). Cenas (opcionais) e duração são
AVISOS — aparecem no relatório mas não travam. A duração não bloqueia porque o
vídeo de upload inclui abertura/encerramento, então não bate com a líquida do
corte (comparar-e-bloquear dava falso-positivo).

O serviço é assíncrono só por causa do `ffprobe` (duração do vídeo final);
a montagem do relatório em si é determinística e a lógica de cada checagem
vive em helpers puros (fáceis de testar sem I/O).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.corte_mapper import cenas_fora_do_corte, extrair_cenas_remotion
from app.infrastructure.ffmpeg_runner import probe_duracao
from app.models import Corte, MetadadoCorte
from app.services.pipeline_corte_fields import _duracao_layout_corte
from sqlalchemy import select

# Extensões de thumbnail aceitas em upload_ready/ (mesma ordem do upload real).
_THUMB_NAMES = ("thumbnail.jpg", "thumbnail.png", "thumbnail.webp")


@dataclass
class Checagem:
    """Resultado de uma checagem individual da validação pré-publicação.

    `bloqueante=True` (padrão): a falha impede o upload. `bloqueante=False`:
    é apenas um AVISO — aparece no relatório mas não trava a publicação (ex.:
    cenas são opcionais; nem todo corte usa o roteiro visual — D-369).
    """

    id: str
    label: str
    ok: bool
    detalhe: str = ""
    bloqueante: bool = True

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "ok": self.ok,
            "detalhe": self.detalhe,
            "bloqueante": self.bloqueante,
        }


@dataclass
class RelatorioValidacao:
    checagens: list[Checagem] = field(default_factory=list)

    @property
    def bloqueado(self) -> bool:
        """True só quando uma checagem BLOQUEANTE falha (avisos não travam)."""
        return any(not c.ok and c.bloqueante for c in self.checagens)

    @property
    def ok(self) -> bool:
        return not self.bloqueado

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "bloqueado": self.bloqueado,
            "checagens": [c.to_dict() for c in self.checagens],
            # Pendências = só o que BLOQUEIA (o que o operador precisa corrigir).
            "pendencias": [c.label for c in self.checagens if not c.ok and c.bloqueante],
            # Avisos = falhas não-bloqueantes (informativas).
            "avisos": [c.label for c in self.checagens if not c.ok and not c.bloqueante],
        }


def _parse_lista_json(raw: str | list | None) -> list:
    """Desserializa um campo JSON-lista tolerante a string/list/None."""
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return data if isinstance(data, list) else []


def _parse_cenas(raw: str | list | dict | None) -> list:
    """Lista de cenas do payload, seja lista direta ou dict ``{formato, cenas}``.

    O serviço de roteiro visual grava um DICT (`{"formato", "paleta", "cenas"}`)
    — é o formato de 100% dos cortes no banco. Usar `_parse_lista_json` aqui
    devolvia `[]` para todos eles, e a checagem de cenas ficava cega.
    """
    if raw is None or raw == "":
        return []
    if isinstance(raw, (list, dict)):
        return extrair_cenas_remotion(raw)
    try:
        return extrair_cenas_remotion(json.loads(raw))
    except (ValueError, TypeError):
        return []


def _checar_cenas(cenas_raw: str | list | None) -> Checagem:
    # AVISO (não bloqueia): cenas são opcionais — nem todo corte usa o roteiro
    # visual (D-369). Mostramos no relatório, mas não travamos a publicação.
    cenas = _parse_cenas(cenas_raw)
    n = len(cenas)
    return Checagem(
        "cenas",
        "Cenas adicionadas",
        ok=n > 0,
        detalhe=f"{n} cena(s)" if n else "nenhuma cena (opcional)",
        bloqueante=False,
    )


def _checar_titulo(titulo: str | None) -> Checagem:
    t = (titulo or "").strip()
    return Checagem("titulo", "Título", ok=bool(t), detalhe="" if t else "título vazio")


def _checar_descricao(descricao: str | None) -> Checagem:
    d = (descricao or "").strip()
    return Checagem(
        "descricao", "Resumo/Descrição", ok=bool(d), detalhe="" if d else "descrição vazia"
    )


def _checar_tags(tags_raw: str | list | None) -> Checagem:
    tags = [t for t in _parse_lista_json(tags_raw) if str(t).strip()]
    n = len(tags)
    return Checagem("tags", "Tags", ok=n > 0, detalhe=f"{n} tag(s)" if n else "nenhuma tag")


def _checar_cenas_no_intervalo(cenas_raw: str | list | None, duracao_esperada: float) -> Checagem:
    """BLOQUEANTE: nenhuma cena pode apontar para além do fim do corte.

    Cena com o tempo ABSOLUTO da live (posição na live inteira) misturada às
    relativas faz a timeline do editor esticar — `max(duracao, maiorFimDeCena)`
    — e o player exibe um total muito maior que o vídeo, rodando vazio depois
    do fim real. Bloqueia porque o vídeo publicado sairia com a cena renderizada
    em cima de nada, ou simplesmente ausente.
    """
    cenas = _parse_cenas(cenas_raw)
    if not cenas or duracao_esperada <= 0:
        return Checagem(
            "cenas_intervalo",
            "Cenas dentro do corte",
            ok=True,
            detalhe="sem cenas para conferir" if not cenas else "duração do corte indisponível",
            bloqueante=False,
        )
    fora = cenas_fora_do_corte(cenas, duracao_esperada)
    if not fora:
        return Checagem(
            "cenas_intervalo",
            "Cenas dentro do corte",
            ok=True,
            detalhe=f"{len(cenas)} cena(s) dentro de {duracao_esperada:.0f}s",
        )
    exemplo = fora[0]
    return Checagem(
        "cenas_intervalo",
        "Cenas dentro do corte",
        ok=False,
        detalhe=(
            f"{len(fora)} de {len(cenas)} cena(s) além do fim do corte "
            f"({duracao_esperada:.0f}s) — ex.: cena {exemplo['indice']} em "
            f"{exemplo['inicio']:.0f}s-{exemplo['fim']:.0f}s. Provável tempo "
            "absoluto da live no roteiro visual."
        ),
    )


def _checar_duracao(duracao_final: float | None, duracao_esperada: float) -> Checagem:
    """Duração do vídeo final: BLOQUEIA quando falta vídeo no fim.

    O vídeo de upload inclui abertura/encerramento concatenados
    (`_adicionar_intro_outro`), então ele é sempre MAIOR que a duração líquida
    do corte. Por isso comparar-e-bloquear pelo valor exato daria falso-positivo
    (D-369) — mas a desigualdade vale sempre: um final MENOR que a líquida só
    acontece se o vídeo foi truncado, e é isso que checamos. Acima do esperado
    segue como informação (a diferença é a abertura/encerramento).
    """
    if duracao_final is None:
        return Checagem(
            "duracao",
            "Duração final",
            ok=True,
            detalhe="não verificada (ffprobe indisponível)",
            bloqueante=False,
        )
    # 2% de folga absorve arredondamento de keyframe/concat sem mascarar
    # truncamento real (que corta minutos, não centésimos).
    minimo = duracao_esperada * 0.98
    if duracao_esperada > 0 and duracao_final < minimo:
        faltando = duracao_esperada - duracao_final
        return Checagem(
            "duracao",
            "Duração final",
            ok=False,
            detalhe=(
                f"{duracao_final:.1f}s — MENOR que o corte ({duracao_esperada:.0f}s). "
                f"Faltam ~{faltando:.0f}s de vídeo no fim, e o upload ainda soma "
                "abertura/encerramento por cima."
            ),
        )
    return Checagem(
        "duracao",
        "Duração final",
        ok=True,
        detalhe=f"{duracao_final:.1f}s (corte ~{duracao_esperada:.0f}s + abertura/encerramento)",
        bloqueante=False,
    )


class ValidacaoPublicacaoService:
    @classmethod
    async def validar(cls, corte_id: str) -> dict:
        """Valida o pacote de publicação de um corte. Retorna dict serializável.

        `{"status": "ok"|"erro", ok, bloqueado, checagens[], pendencias[]}`.
        """
        async with AsyncSessionLocal() as db:
            corte = await db.get(Corte, corte_id)
            if not corte:
                return {"status": "erro", "mensagem": "Corte não encontrado"}
            meta_res = await db.execute(
                select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
            )
            meta = meta_res.scalar_one_or_none()

            projeto_id = corte.projeto_id
            duracao_esperada = _duracao_layout_corte(corte)
            cenas_raw = corte.cenas_remotion
            meta_snapshot = (
                {
                    "titulo_youtube": meta.titulo_youtube,
                    "descricao_youtube": meta.descricao_youtube,
                    "tags_youtube": meta.tags_youtube,
                    "thumbnail_path": meta.thumbnail_path,
                }
                if meta
                else None
            )

        corte_dir = projetos_dir() / projeto_id / "cortes" / corte_id
        video_path = corte_dir / "upload_ready" / "video.mp4"

        checagens: list[Checagem] = []

        video_existe = video_path.exists() and video_path.stat().st_size > 0
        checagens.append(
            Checagem(
                "video_final",
                "Vídeo final",
                ok=video_existe,
                detalhe="" if video_existe else "upload_ready/video.mp4 ausente",
            )
        )

        duracao_final = await probe_duracao(video_path) if video_existe else None
        checagens.append(_checar_duracao(duracao_final, duracao_esperada))

        checagens.append(_checar_cenas(cenas_raw))
        checagens.append(_checar_cenas_no_intervalo(cenas_raw, duracao_esperada))
        checagens.append(_checar_titulo(meta_snapshot and meta_snapshot["titulo_youtube"]))
        checagens.append(_checar_descricao(meta_snapshot and meta_snapshot["descricao_youtube"]))
        checagens.append(_checar_tags(meta_snapshot and meta_snapshot["tags_youtube"]))
        checagens.append(
            cls._checar_thumbnail(
                corte_dir, projeto_id, meta_snapshot and meta_snapshot["thumbnail_path"]
            )
        )

        return {"status": "ok", **RelatorioValidacao(checagens).to_dict()}

    @staticmethod
    def _checar_thumbnail(corte_dir: Path, projeto_id: str, thumbnail_path: str | None) -> Checagem:
        """Thumbnail presente em upload_ready/ ou no caminho do banco."""
        base_dir = corte_dir / "upload_ready"
        for nome in _THUMB_NAMES:
            cand = base_dir / nome
            if cand.exists() and cand.stat().st_size > 0:
                return Checagem("thumbnail", "Thumbnail", ok=True, detalhe=nome)

        if thumbnail_path:
            db_thumb = resolver_do_projeto(thumbnail_path, projeto_id)
            if db_thumb.exists() and db_thumb.stat().st_size > 0:
                return Checagem("thumbnail", "Thumbnail", ok=True, detalhe=db_thumb.name)

        return Checagem("thumbnail", "Thumbnail", ok=False, detalhe="thumbnail ausente")
