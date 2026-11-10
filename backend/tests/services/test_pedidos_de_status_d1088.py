"""D-1088: o PATCH e o /aprovar que tiram o corte do riscado, chamados pelo service.

`pedidos_de_status` orquestra o que o router só repassa. O service do corte faz a
volta na transação do pedido (snapshot limpo, fora da telemetria), e este gera
de novo o bruto que o riscar soltou, depois do commit. O status pedido vale.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.services import media_retention, pedidos_de_status, riscar_corte
from app.services.corte import AtualizarCorteDTO
from app.services.telemetria_cortes import TelemetriaCortesService
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        for numero, corte_id in enumerate(("c1", "c2"), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.APROVADO,
                    arquivo_clip_path=f"cortes/{corte_id}/clip_raw.mkv",
                )
            )
            db.add(CorteSnapshot(id=f"s-{corte_id}", corte_id=corte_id, projeto_id="p1"))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def raiz(monkeypatch, tmp_path) -> Path:
    from app.core import channel_paths

    monkeypatch.setattr(media_retention, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr("app.services.corte.projetos_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture
def geracoes(monkeypatch):
    """O bruto pedido de novo: a geração real chama o worker, aqui só se anota."""
    pedidos: list[str] = []

    async def iniciar_geracao(corte_id: str, **_):
        pedidos.append(corte_id)
        return {"message": "Geração de bruto iniciada", "corte_id": corte_id}

    monkeypatch.setattr(riscar_corte.bruto_do_corte, "iniciar_geracao", iniciar_geracao)
    return pedidos


async def _riscar_com_bruto(raiz: Path, corte_id: str) -> None:
    bruto = raiz / "p1" / "cortes" / corte_id / "clip_raw.mkv"
    bruto.parent.mkdir(parents=True, exist_ok=True)
    bruto.write_bytes(b"x" * 1024 * 1024)
    await riscar_corte.riscar(corte_id, "repetido")


async def _snapshot(fabrica, corte_id: str) -> CorteSnapshot:
    async with fabrica() as db:
        return (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == corte_id))
        ).scalar_one()


async def _apagados(fabrica) -> int:
    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)
    return telemetria["apagados"]["total"]


@pytest.mark.parametrize("pedido", ["proposto", "aprovado"])
@pytest.mark.asyncio
async def test_o_patch_que_tira_do_riscado_gera_o_bruto_solto(fabrica, raiz, geracoes, pedido):
    await _riscar_com_bruto(raiz, "c1")

    async with fabrica() as db:
        corte = await pedidos_de_status.atualizar(db, "c1", AtualizarCorteDTO(status=pedido))

    # O status pedido vale: o Voltar fica proposto mesmo vindo de aprovado.
    assert corte.status == pedido
    assert (await _snapshot(fabrica, "c1")).apagado_em is None
    assert await _apagados(fabrica) == 0
    assert geracoes == ["c1"]


@pytest.mark.asyncio
async def test_o_aprovar_que_tira_do_riscado_gera_o_bruto_solto(fabrica, raiz, geracoes):
    await _riscar_com_bruto(raiz, "c1")

    await pedidos_de_status.aprovar("c1")

    async with fabrica() as db:
        assert (await db.get(Corte, "c1")).status == StatusCorte.APROVADO
    assert (await _snapshot(fabrica, "c1")).apagado_em is None
    assert geracoes == ["c1"]


@pytest.mark.asyncio
async def test_patch_de_corte_vivo_nao_gera_bruto(fabrica, geracoes):
    async with fabrica() as db:
        await pedidos_de_status.atualizar(db, "c1", AtualizarCorteDTO(status="proposto"))

    await pedidos_de_status.aprovar("c2")

    assert geracoes == []


@pytest.mark.asyncio
async def test_riscado_sem_bruto_solto_volta_sem_gerar(fabrica, raiz, geracoes):
    """O riscar não achou bruto no disco: voltar não ganha uma geração de brinde."""
    await riscar_corte.riscar("c1")

    async with fabrica() as db:
        corte = await pedidos_de_status.atualizar(db, "c1", AtualizarCorteDTO(status="aprovado"))

    assert corte.status == StatusCorte.APROVADO
    assert geracoes == []
