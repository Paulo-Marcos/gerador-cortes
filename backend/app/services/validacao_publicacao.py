"""Validação pré-publicação no YouTube (D-363).

Antes de subir um corte, confere se o pacote está completo e coerente:
vídeo final presente, duração final batendo com a líquida (trechos de fato
aplicados — o mesmo mismatch do D-362), cenas do roteiro visual, título,
descrição, tags e thumbnail.

Política (D-363): QUALQUER item faltando bloqueia o upload — o operador
corrige e confirma antes de subir. Todas as checagens são bloqueantes.

O serviço é assíncrono só por causa do `ffprobe` (duração do vídeo final);
a montagem do relatório em si é determinística e a lógica de cada checagem
vive em helpers puros (fáceis de testar sem I/O).
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import AsyncSessionLocal
from app.models import Corte, MetadadoCorte
from app.services.pipeline_corte_fields import _duracao_layout_corte
from sqlalchemy import select

# Acima desta diferença entre a duração do vídeo final e a líquida esperada,
# consideramos que os trechos não foram aplicados (ou sobrou freeze — D-362).
TOLERANCIA_DURACAO_SEG = 2.0

# Extensões de thumbnail aceitas em upload_ready/ (mesma ordem do upload real).
_THUMB_NAMES = ("thumbnail.jpg", "thumbnail.png", "thumbnail.webp")


@dataclass
class Checagem:
    """Resultado de uma checagem individual da validação pré-publicação."""

    id: str
    label: str
    ok: bool
    detalhe: str = ""

    def to_dict(self) -> dict:
        return {"id": self.id, "label": self.label, "ok": self.ok, "detalhe": self.detalhe}


@dataclass
class RelatorioValidacao:
    checagens: list[Checagem] = field(default_factory=list)

    @property
    def bloqueado(self) -> bool:
        """True se qualquer checagem falhou (todas são bloqueantes — D-363)."""
        return any(not c.ok for c in self.checagens)

    @property
    def ok(self) -> bool:
        return not self.bloqueado

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "bloqueado": self.bloqueado,
            "checagens": [c.to_dict() for c in self.checagens],
            "pendencias": [c.label for c in self.checagens if not c.ok],
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


def _checar_cenas(cenas_raw: str | list | None) -> Checagem:
    cenas = _parse_lista_json(cenas_raw)
    n = len(cenas)
    return Checagem(
        "cenas",
        "Cenas adicionadas",
        ok=n > 0,
        detalhe=f"{n} cena(s)" if n else "nenhuma cena no roteiro visual",
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


def _checar_duracao(duracao_final: float | None, duracao_esperada: float) -> Checagem:
    """Compara a duração medida do vídeo final com a líquida esperada.

    É a checagem que pega o D-362: se os trechos não foram aplicados (ou
    sobrou freeze no fim), o vídeo final fica mais longo que a líquida.
    """
    if duracao_final is None:
        return Checagem(
            "duracao",
            "Duração final",
            ok=False,
            detalhe="não foi possível medir a duração do vídeo final",
        )
    diff = abs(duracao_final - duracao_esperada)
    ok = diff <= TOLERANCIA_DURACAO_SEG
    detalhe = (
        f"final={duracao_final:.1f}s vs esperado={duracao_esperada:.1f}s (Δ={diff:.1f}s)"
        if not ok
        else f"{duracao_final:.1f}s"
    )
    return Checagem("duracao", "Duração final (trechos aplicados)", ok=ok, detalhe=detalhe)


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

        duracao_final = await cls._probe_duracao(video_path) if video_existe else None
        checagens.append(_checar_duracao(duracao_final, duracao_esperada))

        checagens.append(_checar_cenas(cenas_raw))
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

    @staticmethod
    async def _probe_duracao(file_path: Path) -> float | None:
        """Duração em segundos via ffprobe, ou None se falhar."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            return float(stdout.decode().strip())
        except Exception:
            return None
