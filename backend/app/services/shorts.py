"""Serviço de Shorts — monta o material do prompt e persiste os candidatos (D-454).

Divisão de trabalho no mesmo arranjo da avaliação do bruto (D-447): aqui mora o
que toca banco; as regras de validação vivem no domínio puro (`app.domain.shorts`)
e a chamada ao Claude vive em `claude_ia`, junto com as demais etapas editoriais.

O INSUMO é `Corte.transcricao_final` — a transcrição já com os desvios removidos
e **os tempos rebaseados na timeline do bruto** (`services/corte.py`). É de
propósito: o short é recortado do arquivo do bruto, então tempo de live aqui
dessincronizaria todo candidato. Nenhuma conversão é necessária; o cuidado é não
trocar a fonte por `transcricao_raw` num refactor futuro.

Regerar sugestões preserva decisão humana: só os candidatos ainda em SUGERIDO são
substituídos. O que o operador já aprovou ou rejeitou sobrevive.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.shorts import ResultadoSugestoes, SugestaoShort
from app.domain.time_convert import seg_to_mmss
from app.models import Corte, Short, StatusShort
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContextoShorts:
    """O material do prompt + os números que descrevem o bruto analisado."""

    corte_id: str
    projeto_id: str
    titulo: str
    tema_central: str
    duracao_seg: float
    texto_transcricao: str


async def montar_contexto(corte_id: str) -> ContextoShorts:
    """Reúne o que o garimpeiro precisa ver: a transcrição do bruto com `[MM:SS]`.

    Levanta `LookupError` quando o corte não existe e `ValueError` quando não há
    transcrição final — sem ela não há bruto de onde recortar, e mandar prompt
    vazio só produziria candidatos inventados.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} não encontrado")

        transcricao = _json_lista(corte.transcricao_final)
        if not transcricao:
            raise ValueError(
                "O corte não tem transcrição final — gere o bruto antes de propor shorts."
            )

        return ContextoShorts(
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            titulo=corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            duracao_seg=round(_duracao_do_bruto(corte, transcricao), 2),
            texto_transcricao=montar_texto_transcricao(transcricao),
        )


def montar_texto_transcricao(transcricao_final: list[dict]) -> str:
    """A transcrição do bruto no dialeto `[MM:SS] fala` que os prompts leem.

    Exemplo:
        >>> montar_texto_transcricao(
        ...     [{"start": 0.0, "texto": "primeira"}, {"start": 65.0, "texto": "segunda"}]
        ... )
        '[00:00] primeira\\n[01:05] segunda'
    """
    linhas = []
    for segmento in transcricao_final:
        texto = str(segmento.get("texto", "")).strip()
        if not texto:
            continue
        linhas.append(f"[{seg_to_mmss(float(segmento.get('start', 0.0) or 0.0))}] {texto}")
    return "\n".join(linhas)


async def registrar_sugestoes(
    contexto: ContextoShorts, resultado: ResultadoSugestoes
) -> list[dict]:
    """Substitui os candidatos ainda SUGERIDOS do corte pelos recém-propostos.

    Aprovados e rejeitados NÃO são tocados: regerar as sugestões é refazer o
    palpite da IA, não desfazer a curadoria de quem já passou por ali.
    """
    async with AsyncSessionLocal() as db:
        # A numeracao continua depois do que SOBREVIVE, entao ela e lida antes do
        # delete — depois dele os candidatos removidos ainda estariam na sessao.
        proximo_numero = await _proximo_numero_apos_os_curados(db, contexto.corte_id)

        antigos = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == contexto.corte_id)
                .where(Short.status == StatusShort.SUGERIDO)
            )
        ).all()
        for antigo in antigos:
            await db.delete(antigo)

        novos = [
            _para_modelo(contexto.corte_id, proximo_numero + posicao, sugestao)
            for posicao, sugestao in enumerate(resultado.sugestoes)
        ]
        db.add_all(novos)
        await db.commit()
        serializados = [_serializar(short) for short in novos]

    logger.info(
        "[Shorts] corte=%s sugeridos=%d descartados=%d substituidos=%d",
        contexto.corte_id[:8],
        len(novos),
        len(resultado.descartes),
        len(antigos),
    )
    for motivo in resultado.descartes:
        logger.info("[Shorts] corte=%s descarte: %s", contexto.corte_id[:8], motivo)
    return serializados


async def listar_shorts(corte_id: str) -> list[dict]:
    """Todos os shorts do corte, do melhor palpite ao pior."""
    async with AsyncSessionLocal() as db:
        shorts = (
            await db.scalars(
                select(Short)
                .where(Short.corte_id == corte_id)
                .order_by(Short.score.desc(), Short.numero.asc())
            )
        ).all()
    return [_serializar(short) for short in shorts]


async def _proximo_numero_apos_os_curados(db: AsyncSession, corte_id: str) -> int:
    """Primeiro número livre acima dos shorts que a regeração NÃO apaga."""
    maior = await db.scalar(
        select(func.max(Short.numero))
        .where(Short.corte_id == corte_id)
        .where(Short.status != StatusShort.SUGERIDO)
    )
    return int(maior or 0) + 1


def _duracao_do_bruto(corte: Corte, transcricao: list[dict]) -> float:
    """Duração do bruto: a gravada na geração, com a transcrição como retaguarda.

    `duracao_clip_seg` pode estar zerada em corte antigo (o probe do D-369 falhava
    em silêncio); nesse caso o último segmento da transcrição é o melhor palpite
    disponível — e é melhor um teto aproximado que nenhum.
    """
    gravada = float(corte.duracao_clip_seg or 0.0)
    if gravada > 0:
        return gravada
    ultimo = transcricao[-1]
    return float(ultimo.get("end", ultimo.get("start", 0.0)) or 0.0)


def _para_modelo(corte_id: str, numero: int, sugestao: SugestaoShort) -> Short:
    return Short(
        id=str(uuid.uuid4()),
        corte_id=corte_id,
        numero=numero,
        titulo_sugerido=sugestao.titulo,
        gancho=sugestao.gancho,
        inicio_seg=sugestao.inicio_seg,
        fim_seg=sugestao.fim_seg,
        score=sugestao.score,
        justificativa=sugestao.justificativa,
        status=StatusShort.SUGERIDO,
    )


def _serializar(short: Short) -> dict:
    return {
        "id": short.id,
        "corte_id": short.corte_id,
        "numero": short.numero,
        "titulo": short.titulo_sugerido,
        "gancho": short.gancho,
        "inicio_seg": short.inicio_seg,
        "fim_seg": short.fim_seg,
        "duracao_seg": round(short.fim_seg - short.inicio_seg, 2),
        "score": short.score,
        "justificativa": short.justificativa,
        "status": short.status,
        "arquivo_short_path": short.arquivo_short_path,
    }


def _json_lista(bruto: str | None) -> list[dict]:
    try:
        dados = json.loads(bruto or "[]")
    except json.JSONDecodeError:
        return []
    return dados if isinstance(dados, list) else []
