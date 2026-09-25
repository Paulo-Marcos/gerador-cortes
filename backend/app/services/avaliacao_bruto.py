"""D-447: avaliação automática do bruto — montagem do material e persistência.

Divisão de trabalho: aqui mora tudo que toca banco (montar o contexto a partir do
corte, gravar o parecer, ler o histórico); o vocabulário e a validação vivem no
domínio puro (`app.domain.corte.avaliacao_bruto`); a chamada ao Claude vive em
`claude_ia`, junto com as demais etapas editoriais — mesmo arranjo de
`metadados` e `avaliacao_thumbnail`.

Uma linha por GERAÇÃO de bruto, nunca sobrescrita: a série é o produto. É ela
que responde "os cortes desta live ficaram melhores que os da anterior?" e que
alimenta o refino da skill que propõe os cortes.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass

from app.database import AsyncSessionLocal
from app.domain.compartilhado.time_convert import seg_to_hms_short
from app.domain.corte.arranjo_blocos import parse as parse_arranjo
from app.domain.corte.arranjo_blocos import reconciliar, segmentos_na_ordem
from app.domain.corte.avaliacao_bruto import (
    AvaliacaoNormalizada,
    Emenda,
    calcular_emendas,
    montar_texto_avaliado,
    rotulo_do_tipo,
)
from app.domain.corte.segment_calculator import normalizar_desvio
from app.models import AvaliacaoBruto, Corte
from sqlalchemy import select

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ContextoAvaliacao:
    """O material do prompt + os números que descrevem a geração avaliada."""

    corte_id: str
    projeto_id: str
    titulo: str
    tema_central: str
    duracao_seg: float
    emendas: list[Emenda]
    texto_avaliado: str

    @property
    def total_emendas(self) -> int:
        return len(self.emendas)

    @property
    def removido_seg(self) -> float:
        return round(sum(e.removido_seg for e in self.emendas), 2)


async def montar_contexto(corte_id: str) -> ContextoAvaliacao:
    """Reúne o que o avaliador precisa ver: o bruto com as emendas marcadas.

    Levanta `LookupError` quando o corte não existe e `ValueError` quando não há
    transcrição final — sem ela não há o que avaliar, e mandar um prompt vazio
    para a IA só produziria um parecer inventado.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} não encontrado")

        transcricao = _json_lista(corte.transcricao_final)
        if not transcricao:
            raise ValueError("O corte não tem transcrição final — gere o bruto antes de avaliá-lo.")

        desvios = [normalizar_desvio(d) for d in _json_lista(corte.desvios)]
        inicio = float(corte.inicio_seg or 0.0)
        fim = float(corte.fim_seg or 0.0)
        # D-576: as emendas são as do bruto REAL, que segue o arranjo de blocos.
        # Calculá-las em ordem cronológica descreveria um vídeo que não existe —
        # e é justamente na emenda que o avaliador julga se o corte se sustenta.
        arranjo = reconciliar(parse_arranjo(corte.arranjo_blocos), inicio, fim)
        segmentos = segmentos_na_ordem(arranjo, inicio, fim, desvios)
        emendas = calcular_emendas(segmentos, desvios)
        duracao = float(corte.duracao_clip_seg or 0.0) or sum(
            float(s["end"]) - float(s["start"]) for s in segmentos
        )

        return ContextoAvaliacao(
            corte_id=corte.id,
            projeto_id=corte.projeto_id,
            titulo=corte.titulo_proposto or "",
            tema_central=corte.tema_central or "",
            duracao_seg=round(duracao, 2),
            emendas=emendas,
            texto_avaliado=montar_texto_avaliado(transcricao, emendas),
        )


async def registrar_avaliacao(
    contexto: ContextoAvaliacao,
    avaliacao: AvaliacaoNormalizada,
    *,
    modelo: str = "",
    skill_sha: str = "",
) -> dict:
    """Grava mais uma linha na série de avaliações do corte e a devolve serializada."""
    registro = AvaliacaoBruto(
        id=str(uuid.uuid4()),
        corte_id=contexto.corte_id,
        projeto_id=contexto.projeto_id,
        nota=avaliacao.nota,
        veredito=avaliacao.veredito,
        parecer=avaliacao.parecer,
        apontamentos=json.dumps(avaliacao.apontamentos, ensure_ascii=False),
        duracao_seg=contexto.duracao_seg,
        total_emendas=contexto.total_emendas,
        removido_seg=contexto.removido_seg,
        modelo=modelo,
        skill_sha=skill_sha,
    )
    async with AsyncSessionLocal() as db:
        db.add(registro)
        await db.commit()
    logger.info(
        "[AvaliacaoBruto] corte=%s nota=%s veredito=%s apontamentos=%d",
        contexto.corte_id[:8],
        avaliacao.nota,
        avaliacao.veredito,
        len(avaliacao.apontamentos),
    )
    return _serializar(registro)


async def ultima_avaliacao(corte_id: str) -> dict | None:
    """A avaliação mais recente do corte — `None` quando nunca foi avaliado."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AvaliacaoBruto)
            .where(AvaliacaoBruto.corte_id == corte_id)
            .order_by(AvaliacaoBruto.criado_em.desc())
            .limit(1)
        )
        registro = result.scalar_one_or_none()
    return _serializar(registro) if registro else None


async def historico(corte_id: str) -> list[dict]:
    """Todas as avaliações do corte, da mais recente para a mais antiga."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AvaliacaoBruto)
            .where(AvaliacaoBruto.corte_id == corte_id)
            .order_by(AvaliacaoBruto.criado_em.desc())
        )
        return [_serializar(r) for r in result.scalars().all()]


async def avaliacoes_do_projeto(projeto_id: str) -> list[dict]:
    """A avaliação mais recente de CADA corte da live — a visão de levantamento.

    Uma linha por corte (a última), porque a pergunta desta tela é "como está
    esta live", não "como cada corte evoluiu" — essa é a de `historico`.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(AvaliacaoBruto)
            .where(AvaliacaoBruto.projeto_id == projeto_id)
            .order_by(AvaliacaoBruto.criado_em.desc())
        )
        vistos: set[str] = set()
        recentes: list[dict] = []
        for registro in result.scalars().all():
            if registro.corte_id in vistos:
                continue
            vistos.add(registro.corte_id)
            recentes.append(_serializar(registro))
    return recentes


def _json_lista(bruto: str | None) -> list:
    """Parse tolerante de coluna JSON: dado corrompido vira lista vazia."""
    try:
        dados = json.loads(bruto or "[]")
    except (ValueError, TypeError):
        return []
    return dados if isinstance(dados, list) else []


def _serializar(registro: AvaliacaoBruto) -> dict:
    apontamentos = _json_lista(registro.apontamentos)
    return {
        "id": registro.id,
        "corte_id": registro.corte_id,
        "projeto_id": registro.projeto_id,
        "nota": registro.nota,
        "veredito": registro.veredito,
        "parecer": registro.parecer or "",
        # `rotulo` sai pronto para a UI não duplicar o vocabulário do domínio.
        "apontamentos": [
            {**a, "rotulo": rotulo_do_tipo(str(a.get("tipo", "")))} for a in apontamentos
        ],
        "duracao_seg": registro.duracao_seg,
        "duracao_hms": seg_to_hms_short(registro.duracao_seg or 0.0),
        "total_emendas": registro.total_emendas,
        "removido_seg": registro.removido_seg,
        "modelo": registro.modelo or "",
        "criado_em": registro.criado_em.isoformat() if registro.criado_em else None,
    }
