"""D-1101, os dois resíduos da rodada 2 da auditoria da D-1088 (RN-04, RN-05).

- Um PATCH `{status: rejeitado}` num corte já riscado não o tira do riscado,
  então não pode desfazer o riscar: o snapshot de apagado, a etapa de antes e o
  bruto solto ficam como estavam, e nenhum bruto é gerado.
- Um arquivo em uso ao riscar aparece uma vez em `nao_removidos`: o aviso do
  editor conta os itens ("2 arquivos em uso" para um arquivo só era o defeito).

Banco em memória (toda sessão do app é desviada para ele) e a raiz dos projetos
em `tmp_path`, como em `test_riscar_corte_volta_unica_d1088`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.routers import corte_riscado
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from app.services import media_retention, riscar_corte
from app.services.telemetria_cortes import TelemetriaCortesService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_MB = 1024 * 1024


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
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
                arquivo_clip_path="cortes/c1/clip_raw.mkv",
            )
        )
        db.add(CorteSnapshot(id="s-c1", corte_id="c1", projeto_id="p1"))
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


@pytest.fixture
def cliente(fabrica, raiz, geracoes):
    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.include_router(corte_riscado.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _bruto(raiz: Path) -> Path:
    arquivo = raiz / "p1" / "cortes" / "c1" / "clip_raw.mkv"
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(b"x" * _MB)
    return arquivo


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


async def _snapshot(fabrica) -> CorteSnapshot:
    async with fabrica() as db:
        return (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == "c1"))
        ).scalar_one()


@pytest.mark.asyncio
async def test_patch_para_rejeitado_num_riscado_nao_desfaz_o_riscar(
    cliente, fabrica, raiz, geracoes
):
    _bruto(raiz)
    assert cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"}).status_code == 200

    resposta = cliente.patch("/api/cortes/c1", json={"status": "rejeitado"})

    assert resposta.status_code == 200
    corte = await _corte(fabrica)
    assert corte.status == StatusCorte.REJEITADO
    # A etapa de antes e o bruto solto ficam: o "Trazer de volta" ainda precisa deles.
    assert corte.status_antes_de_riscar == "aprovado"
    assert corte.bruto_solto_ao_riscar
    snapshot = await _snapshot(fabrica)
    assert snapshot.apagado_em is not None
    assert snapshot.motivo_apagado == "repetido"
    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)
    assert telemetria["apagados"]["total"] == 1
    # A mídia de um corte riscado não volta ao disco.
    assert geracoes == []


@pytest.mark.asyncio
async def test_trazer_de_volta_depois_do_patch_rejeitado_volta_a_etapa_de_antes(
    cliente, fabrica, raiz, geracoes
):
    _bruto(raiz)
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})
    cliente.patch("/api/cortes/c1", json={"status": "rejeitado"})

    resposta = cliente.post("/api/cortes/c1/trazer-de-volta")

    assert resposta.status_code == 200
    assert (await _corte(fabrica)).status == StatusCorte.APROVADO
    assert geracoes == ["c1"]


@pytest.mark.asyncio
async def test_arquivo_em_uso_conta_uma_vez(cliente, raiz, monkeypatch):
    bruto = _bruto(raiz)
    original = Path.unlink

    def unlink(self, *args, **kwargs):
        if self == bruto:
            raise PermissionError("em uso pelo player")
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink)

    nao_removidos = cliente.post("/api/cortes/c1/riscar").json()["nao_removidos"]

    assert len(nao_removidos) == 1
    assert "clip_raw.mkv" in nao_removidos[0]
