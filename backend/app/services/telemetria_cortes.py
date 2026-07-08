"""D-303: levantamento da telemetria editorial (proposta da IA × corte final).

Lê cortes + snapshots do banco, delega o diff ao domain puro
(`app.domain.telemetria_cortes`) e devolve payloads prontos para os endpoints
de projeto e cross-projeto (JSON/CSV).
"""

import json

from app.domain.telemetria_cortes import (
    SITUACAO_COM_SNAPSHOT,
    diff_proposta_vs_final,
    telemetria_csv,
)
from app.models import Corte, CorteSnapshot, Projeto
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


class TelemetriaCortesService:
    @staticmethod
    async def telemetria_do_projeto(projeto_id: str, db: AsyncSession) -> dict | None:
        """Diff proposta×final de cada corte do projeto (None se não existe)."""
        projeto = await db.get(Projeto, projeto_id)
        if not projeto:
            return None

        cortes = await _cortes_do_projeto(db, projeto_id)
        snapshots = await _snapshots_por_corte(db, [c.id for c in cortes])
        diffs = _diffs(cortes, snapshots)
        com_snapshot = sum(1 for d in diffs if d["situacao"] == SITUACAO_COM_SNAPSHOT)

        return {
            "projeto_id": projeto_id,
            "titulo_live": projeto.titulo_live or "",
            "total_cortes": len(diffs),
            "com_snapshot": com_snapshot,
            "sem_snapshot": len(diffs) - com_snapshot,
            "cortes": diffs,
        }

    @staticmethod
    async def telemetria_agregada(db: AsyncSession) -> list[dict]:
        """Uma linha (diff) por corte de TODOS os projetos, com identificação
        do projeto embutida — insumo do export JSON/CSV cross-projeto."""
        result = await db.execute(select(Projeto).order_by(Projeto.criado_em))
        projetos = result.scalars().all()

        linhas: list[dict] = []
        for projeto in projetos:
            cortes = await _cortes_do_projeto(db, projeto.id)
            snapshots = await _snapshots_por_corte(db, [c.id for c in cortes])
            for diff in _diffs(cortes, snapshots):
                diff["projeto_id"] = projeto.id
                diff["projeto_titulo"] = projeto.titulo_live or ""
                linhas.append(diff)
        return linhas

    @staticmethod
    def csv_agregado(linhas: list[dict]) -> str:
        return telemetria_csv(linhas)


# ── internos ────────────────────────────────────────────────────────────────


async def _cortes_do_projeto(db: AsyncSession, projeto_id: str) -> list[Corte]:
    result = await db.execute(
        select(Corte).where(Corte.projeto_id == projeto_id).order_by(Corte.numero)
    )
    return list(result.scalars().all())


async def _snapshots_por_corte(db: AsyncSession, corte_ids: list[str]) -> dict[str, CorteSnapshot]:
    if not corte_ids:
        return {}
    result = await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id.in_(corte_ids)))
    return {s.corte_id: s for s in result.scalars().all()}


def _diffs(cortes: list[Corte], snapshots: dict[str, CorteSnapshot]) -> list[dict]:
    # Heurística documentada no domain: projeto sem NENHUM snapshot é legado
    # (sem_snapshot); com algum, corte órfão de snapshot nasceu manual.
    projeto_tem_snapshots = bool(snapshots)
    return [
        diff_proposta_vs_final(
            _snapshot_para_diff(snapshots.get(corte.id)),
            _corte_para_diff(corte),
            projeto_tem_snapshots=projeto_tem_snapshots,
        )
        for corte in cortes
    ]


def _json_lista(raw: str | None) -> list:
    try:
        dados = json.loads(raw or "[]")
        return dados if isinstance(dados, list) else []
    except (ValueError, TypeError):
        return []


def _corte_para_diff(corte: Corte) -> dict:
    metadado = corte.metadado  # lazy="selectin" — já carregado com o corte
    return {
        "id": corte.id,
        "numero": corte.numero or 0,
        "titulo_proposto": corte.titulo_proposto or "",
        "titulo_youtube": (metadado.titulo_youtube if metadado else "") or "",
        "inicio_seg": corte.inicio_seg or 0.0,
        "fim_seg": corte.fim_seg or 0.0,
        "status": corte.status or "",
        "desvios": _json_lista(corte.desvios),
    }


def _snapshot_para_diff(snapshot: CorteSnapshot | None) -> dict | None:
    if snapshot is None:
        return None
    return {
        "titulo_proposto": snapshot.titulo_proposto or "",
        "tema_central": snapshot.tema_central or "",
        "resumo": snapshot.resumo or "",
        "justificativa": snapshot.justificativa or "",
        "numero": snapshot.numero or 0,
        "inicio_hms": snapshot.inicio_hms or "00:00:00",
        "fim_hms": snapshot.fim_hms or "00:00:00",
        "inicio_seg": snapshot.inicio_seg or 0.0,
        "fim_seg": snapshot.fim_seg or 0.0,
        "desvios": _json_lista(snapshot.desvios),
        "origem_analise": snapshot.origem_analise or "",
        "criado_em": snapshot.criado_em.isoformat() if snapshot.criado_em else None,
    }
