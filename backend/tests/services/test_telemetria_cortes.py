"""D-303: integração da telemetria editorial com banco SQLite real.

Prova o fluxo de ponta a ponta sem subir o servidor:
  1. `AnaliseService.importar_resultado` congela um `CorteSnapshot` por corte.
  2. O snapshot NÃO muda quando o editor edita o corte.
  3. `TelemetriaCortesService` devolve o diff proposta×final por projeto.
  4. Os endpoints de projeto e de export (JSON/CSV) respondem.
"""

from __future__ import annotations

import json
import uuid

import pytest
from app.models import Base, Corte, CorteSnapshot, MetadadoCorte, Projeto
from app.services.analise import AnaliseService
from app.services.telemetria_cortes import TelemetriaCortesService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

PROPOSTA_IA = {
    "titulo_proposto": "Por que a técnica paralisa a política",
    "resumo": "Arco sobre tecnocracia e paralisia decisória.",
    "tema_central": "tecnocracia",
    "justificativa": "Tese fechada com desenvolvimento e conclusão.",
    "inicio_hms": "00:10:00",
    "fim_hms": "00:25:00",
    "inicio_seg": 600,
    "fim_seg": 1500,
    "desvios": [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}],
}


async def _novo_banco(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'telemetria.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    return engine, factory


async def _criar_projeto(factory, projeto_id: str = "p-tele") -> str:
    async with factory() as db:
        db.add(
            Projeto(
                id=projeto_id,
                youtube_url="https://youtu.be/x",
                titulo_live="Live de teste",
                canal_origem="@teste",  # explícito: evita lookup do canal ativo
            )
        )
        await db.commit()
    return projeto_id


def _desvio_tecnico() -> dict:
    return {"inicio_seg": 800.0, "fim_seg": 830.0, "motivo": "silêncio", "origem": "tecnico"}


async def _editar_corte_como_editor(factory, projeto_id: str) -> str:
    """Simula a edição humana: move borda, troca desvios, título e status."""
    async with factory() as db:
        corte = (
            (await db.execute(select(Corte).where(Corte.projeto_id == projeto_id)))
            .scalars()
            .first()
        )
        corte.inicio_seg = 630.0
        corte.inicio_hms = "00:10:30"
        corte.desvios = json.dumps([_desvio_tecnico()])  # rejeita o da IA, adiciona técnico
        corte.status = "aprovado"
        db.add(
            MetadadoCorte(
                id=str(uuid.uuid4()),
                corte_id=corte.id,
                titulo_youtube="Título final escolhido pelo editor",
                canal_credito="",  # explícito: evita lookup do canal ativo
            )
        )
        await db.commit()
        return corte.id


@pytest.mark.asyncio
async def test_importar_resultado_congela_snapshot_imutavel(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)
    try:
        projeto_id = await _criar_projeto(factory)
        await AnaliseService.importar_resultado(projeto_id, [dict(PROPOSTA_IA)])
        corte_id = await _editar_corte_como_editor(factory, projeto_id)

        async with factory() as db:
            snapshot = (
                (await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == corte_id)))
                .scalars()
                .one()
            )

        # O snapshot preserva a PROPOSTA, não o estado editado.
        assert snapshot.inicio_seg == 600.0
        assert snapshot.titulo_proposto == PROPOSTA_IA["titulo_proposto"]
        assert snapshot.justificativa == PROPOSTA_IA["justificativa"]
        assert snapshot.origem_analise == "claude"  # default: pipeline interno
        desvios_congelados = json.loads(snapshot.desvios)
        assert len(desvios_congelados) == 1
        assert desvios_congelados[0]["motivo"] == "chat"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_importar_resultado_registra_origem_manual(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)
    try:
        projeto_id = await _criar_projeto(factory)
        await AnaliseService.importar_resultado(projeto_id, [dict(PROPOSTA_IA)], origem="manual")

        async with factory() as db:
            snapshot = (await db.execute(select(CorteSnapshot))).scalars().one()
        assert snapshot.origem_analise == "manual"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_telemetria_do_projeto_mede_o_que_o_editor_mudou(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)
    try:
        projeto_id = await _criar_projeto(factory)
        await AnaliseService.importar_resultado(projeto_id, [dict(PROPOSTA_IA)])
        await _editar_corte_como_editor(factory, projeto_id)

        # Corte criado NA MÃO pelo editor (sem snapshot) no mesmo projeto.
        async with factory() as db:
            db.add(
                Corte(
                    id=str(uuid.uuid4()),
                    projeto_id=projeto_id,
                    numero=2,
                    titulo_proposto="Corte manual do editor",
                    inicio_seg=2000.0,
                    fim_seg=2600.0,
                )
            )
            await db.commit()

        async with factory() as db:
            payload = await TelemetriaCortesService.telemetria_do_projeto(projeto_id, db)

        assert payload["total_cortes"] == 2
        assert payload["com_snapshot"] == 1

        editado, manual = payload["cortes"]
        assert editado["situacao"] == "com_snapshot"
        assert editado["bordas"]["delta_inicio_seg"] == 30.0
        assert editado["bordas"]["delta_fim_seg"] == 0.0
        assert len(editado["desvios"]["removidos"]) == 1  # rejeitou o "chat" da IA
        assert editado["desvios"]["adicionados_por_origem"] == {"tecnico": 1}
        assert editado["titulo"]["mudou"] is True
        assert editado["status_final"] == "aprovado"

        assert manual["situacao"] == "sem_proposta_ia"
        assert manual["numero"] == 2
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_projeto_legado_sem_snapshots_reporta_sem_snapshot(tmp_path, monkeypatch):
    engine, factory = await _novo_banco(tmp_path)
    try:
        projeto_id = await _criar_projeto(factory, "p-legado")
        async with factory() as db:
            db.add(
                Corte(
                    id=str(uuid.uuid4()),
                    projeto_id=projeto_id,
                    numero=1,
                    titulo_proposto="Corte anterior à telemetria",
                    inicio_seg=0.0,
                    fim_seg=300.0,
                )
            )
            await db.commit()

        async with factory() as db:
            payload = await TelemetriaCortesService.telemetria_do_projeto(projeto_id, db)

        assert payload["cortes"][0]["situacao"] == "sem_snapshot"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_endpoints_devolvem_diff_json_e_export_csv(tmp_path, monkeypatch):
    from app.routers.projetos import exportar_telemetria_cortes, obter_telemetria_cortes
    from fastapi import HTTPException

    engine, factory = await _novo_banco(tmp_path)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)
    try:
        projeto_id = await _criar_projeto(factory)
        await AnaliseService.importar_resultado(projeto_id, [dict(PROPOSTA_IA)])
        await _editar_corte_como_editor(factory, projeto_id)

        async with factory() as db:
            payload = await obter_telemetria_cortes(projeto_id, db)
            assert payload["projeto_id"] == projeto_id
            assert payload["cortes"][0]["situacao"] == "com_snapshot"

            agregado = await exportar_telemetria_cortes(formato="json", db=db)
            assert agregado["total_cortes"] == 1
            assert agregado["cortes"][0]["projeto_titulo"] == "Live de teste"

            resposta_csv = await exportar_telemetria_cortes(formato="csv", db=db)
            assert resposta_csv.media_type.startswith("text/csv")
            corpo = resposta_csv.body.decode("utf-8")
            linhas = corpo.strip().split("\n")
            assert linhas[0].startswith("projeto_id,projeto_titulo,corte_id")
            assert len(linhas) == 2  # header + 1 corte
            assert "com_snapshot" in linhas[1]

            with pytest.raises(HTTPException) as exc:
                await obter_telemetria_cortes("nao-existe", db)
            assert exc.value.status_code == 404
    finally:
        await engine.dispose()
