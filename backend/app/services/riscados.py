"""Trechos riscados: gravar a rodada da IA, restaurar e desfazer (RN-35, RN-36, D-1017)."""

from __future__ import annotations

import json
from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.corte import riscados as dominio
from app.domain.corte.segment_calculator import (
    dividir_desvios_no_ponto,
    normalizar_desvio,
    somar_aos_desvios_gravados,
    somar_desvios_novos,
)
from app.models import Corte
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload


def registrar_rodada(
    corte: Corte, aceitas: list[dict], recusadas: list[dict]
) -> tuple[int, int, int]:
    """Grava uma rodada da `trechos-expert` no corte: (total no corte, novos, recusados).

    Soma ao que está gravado AGORA (D-976), sem tocar no que o operador marcou
    (D-332), e deixa de fora o que ele já riscou. D-334: conta a invocação, tanto
    do botão por corte quanto do lote.
    """
    rodada = (corte.trechos_geracoes or 0) + 1
    riscados = dominio.riscados_gravados(corte.desvios_riscados)
    novas = dominio.novos_sem_os_riscados(aceitas, riscados)
    mesclados, adicionados = somar_aos_desvios_gravados(
        corte.desvios, [dominio.carimbar_rodada(d, rodada) for d in novas]
    )
    riscados, recusados = somar_desvios_novos(
        riscados, [dominio.carimbar_rodada(d, rodada) for d in recusadas]
    )
    corte.desvios = json.dumps(mesclados, ensure_ascii=False)
    corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    corte.trechos_geracoes = rodada
    log = json.loads(corte.trechos_geracoes_log or "[]")
    log.append(
        {
            "em": datetime.utcnow().isoformat(),
            "rodada": rodada,
            "adicionados": adicionados,
            "recusados": recusados,
            "total_apos": len(mesclados),
        }
    )
    corte.trechos_geracoes_log = json.dumps(log, ensure_ascii=False)
    return len(mesclados), adicionados, recusados


def marcas_que_a_ia_nao_repete(corte: Corte) -> list[dict]:
    """O que vai no prompt como já decidido: o que está marcado e o que o operador riscou."""
    return [
        normalizar_desvio(d)
        for d in [
            *json.loads(corte.desvios or "[]"),
            *dominio.riscados_pelo_operador(dominio.riscados_gravados(corte.desvios_riscados)),
        ]
    ]


def dividir_riscados(corte: Corte, ponto_seg: float) -> str:
    """O corte fica com os riscados da esquerda; devolve os da direita, para o corte novo."""
    esquerda, direita = dividir_desvios_no_ponto(
        dominio.riscados_gravados(corte.desvios_riscados), ponto_seg
    )
    corte.desvios_riscados = json.dumps(esquerda, ensure_ascii=False)
    return json.dumps(direita, ensure_ascii=False)


def juntar_riscados(primeiro: Corte, segundo: Corte) -> None:
    """O corte que sobrevive à junção leva os riscados do que é apagado."""
    primeiro.desvios_riscados = json.dumps(
        [
            *dominio.riscados_gravados(primeiro.desvios_riscados),
            *dominio.riscados_gravados(segundo.desvios_riscados),
        ],
        ensure_ascii=False,
    )


async def _corte_para_resposta(db: AsyncSession, corte_id: str) -> Corte:
    resultado = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    corte = resultado.scalar_one_or_none()
    if corte is None:
        raise NaoEncontrado("Corte não encontrado")
    return corte


async def restaurar_desvio(corte_id: str, indice: int) -> Corte:
    """Devolve ao corte um trecho riscado e devolve o corte. RN-36."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await _corte_para_resposta(db, corte_id)
        desvios, riscados = dominio.restaurar(
            json.loads(corte.desvios or "[]"),
            dominio.riscados_gravados(corte.desvios_riscados),
            indice,
        )
        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    return corte


async def desfazer_rodada(corte_id: str) -> Corte:
    """Risca a última rodada da IA e devolve o corte. RN-36."""
    async with AsyncSessionLocal() as db, db.begin():
        corte = await _corte_para_resposta(db, corte_id)
        desvios, riscados, _rodada = dominio.desfazer_rodada(
            json.loads(corte.desvios or "[]"),
            dominio.riscados_gravados(corte.desvios_riscados),
        )
        corte.desvios = json.dumps(desvios, ensure_ascii=False)
        corte.desvios_riscados = json.dumps(riscados, ensure_ascii=False)
    return corte
