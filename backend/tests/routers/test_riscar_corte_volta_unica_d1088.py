"""D-1088, rodada 1 da auditoria: uma volta só, trabalho em curso e o corte manual.

- O PATCH e o /aprovar que tiram o corte do riscado (o A do editor, o "Voltar"
  do Workspace) passam pela mesma volta do "Trazer de volta": limpam o snapshot
  de apagado, saem da telemetria e geram de novo o bruto que o riscar soltou.
- Riscar recusa o corte com bruto sendo cortado ou render rodando, e a resposta
  diz a mídia que ficou no disco (arquivo em uso).
- O corte feito na mão e riscado não tem snapshot: sai dos cortes mantidos pelo
  status.

Banco em memória (toda sessão do app é desviada para ele) e a raiz dos projetos
em `tmp_path`.
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
from app.services import marca_do_riscado, media_retention, riscar_corte
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
        # c1 e c2: propostos pela IA (têm snapshot); m1: feito na mão (sem snapshot).
        for numero, corte_id in enumerate(("c1", "c2", "m1"), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.PROPOSTO,
                    arquivo_clip_path=f"cortes/{corte_id}/clip_raw.mkv",
                )
            )
        for corte_id in ("c1", "c2"):
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


def _bruto(raiz: Path, corte_id: str) -> Path:
    arquivo = raiz / "p1" / "cortes" / corte_id / "clip_raw.mkv"
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(b"x" * _MB)
    return arquivo


async def _corte(fabrica, corte_id: str) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, corte_id)


async def _snapshot(fabrica, corte_id: str) -> CorteSnapshot:
    async with fabrica() as db:
        return (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == corte_id))
        ).scalar_one()


async def _telemetria(fabrica) -> dict:
    async with fabrica() as db:
        return await TelemetriaCortesService.telemetria_do_projeto("p1", db)


# ── uma volta só ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("pedido", ["proposto", "aprovado"])
@pytest.mark.asyncio
async def test_o_patch_que_tira_do_riscado_e_a_mesma_volta(
    cliente, fabrica, raiz, geracoes, pedido
):
    """O A do editor pede aprovado; o "Voltar" do Workspace pede proposto."""
    _bruto(raiz, "c1")
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    resposta = cliente.patch("/api/cortes/c1", json={"status": pedido})

    assert resposta.status_code == 200
    corte = await _corte(fabrica, "c1")
    assert corte.status == pedido
    assert corte.status_antes_de_riscar == ""
    assert not corte.bruto_solto_ao_riscar
    snapshot = await _snapshot(fabrica, "c1")
    assert snapshot.apagado_em is None
    assert snapshot.motivo_apagado == ""
    telemetria = await _telemetria(fabrica)
    assert telemetria["apagados"]["total"] == 0
    assert "c1" in [linha["corte_id"] for linha in telemetria["cortes"]]
    assert geracoes == ["c1"]


@pytest.mark.asyncio
async def test_o_aprovar_que_tira_do_riscado_e_a_mesma_volta(cliente, fabrica, raiz, geracoes):
    _bruto(raiz, "c1")
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})

    assert cliente.post("/api/cortes/c1/aprovar").status_code == 200

    assert (await _corte(fabrica, "c1")).status == StatusCorte.APROVADO
    assert (await _snapshot(fabrica, "c1")).apagado_em is None
    assert (await _telemetria(fabrica))["apagados"]["total"] == 0
    assert geracoes == ["c1"]


@pytest.mark.asyncio
async def test_patch_em_corte_vivo_nao_mexe_na_proposta_nem_gera_bruto(cliente, fabrica, geracoes):
    cliente.patch("/api/cortes/c1", json={"status": "aprovado"})

    assert (await _corte(fabrica, "c1")).status == StatusCorte.APROVADO
    assert geracoes == []


@pytest.mark.asyncio
async def test_patch_de_outro_campo_num_riscado_nao_o_traz_de_volta(cliente, fabrica, geracoes):
    """O ajuste pendente salvo ao riscar (rRiscaNoEditor) não pode desfazer o riscar."""
    cliente.post("/api/cortes/c1/riscar")

    cliente.patch("/api/cortes/c1", json={"inicio_seg": 5.0})

    corte = await _corte(fabrica, "c1")
    assert corte.status == StatusCorte.REJEITADO
    assert corte.inicio_seg == 5.0
    assert (await _snapshot(fabrica, "c1")).apagado_em is not None
    assert geracoes == []


# ── trabalho em curso ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bruto_sendo_cortado_recusa_o_riscar_e_nada_muda(cliente, fabrica, raiz, monkeypatch):
    bruto = _bruto(raiz, "c1")
    monkeypatch.setattr(
        riscar_corte.ExportService, "get_tarefa_corte_status", lambda corte_id: "cortando"
    )

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.status_code == 400
    assert "bruto deste corte está sendo gerado" in resposta.json()["detail"]
    assert (await _corte(fabrica, "c1")).status == StatusCorte.PROPOSTO
    assert (await _snapshot(fabrica, "c1")).apagado_em is None
    assert bruto.exists()


@pytest.mark.asyncio
async def test_render_rodando_recusa_o_riscar_e_nada_muda(cliente, fabrica, raiz, monkeypatch):
    bruto = _bruto(raiz, "c1")
    monkeypatch.setattr(
        riscar_corte.RenderProgressStore, "is_running", classmethod(lambda cls, corte_id: True)
    )

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.status_code == 400
    assert "render deste corte está rodando" in resposta.json()["detail"]
    assert (await _corte(fabrica, "c1")).status == StatusCorte.PROPOSTO
    assert bruto.exists()


@pytest.mark.asyncio
async def test_arquivo_em_uso_fica_e_a_resposta_diz_qual(cliente, fabrica, raiz, monkeypatch):
    bruto = _bruto(raiz, "c1")
    original = Path.unlink

    def unlink(self, *args, **kwargs):
        if self == bruto:
            raise PermissionError("em uso pelo player")
        return original(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", unlink)

    resposta = cliente.post("/api/cortes/c1/riscar")

    assert resposta.status_code == 200
    assert bruto.exists()
    assert any("clip_raw.mkv" in item for item in resposta.json()["nao_removidos"])
    # O bruto continua no disco: o caminho fica, e trazer de volta não o regera.
    assert (await _corte(fabrica, "c1")).arquivo_clip_path == "cortes/c1/clip_raw.mkv"


@pytest.mark.asyncio
async def test_sem_arquivo_em_uso_a_lista_vem_vazia(cliente, raiz):
    _bruto(raiz, "c1")

    assert cliente.post("/api/cortes/c1/riscar").json()["nao_removidos"] == []


@pytest.mark.asyncio
async def test_so_esquece_o_bruto_se_ninguem_gravou_outro_no_meio(fabrica):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).arquivo_clip_path = "cortes/c1/clip_raw_novo.mkv"
        await db.commit()

    await marca_do_riscado._anotar_o_bruto_solto("c1", "cortes/c1/clip_raw.mkv")

    corte = await _corte(fabrica, "c1")
    assert corte.arquivo_clip_path == "cortes/c1/clip_raw_novo.mkv"
    assert not corte.bruto_solto_ao_riscar


# ── corte manual ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_corte_manual_riscado_sai_dos_cortes_mantidos(cliente, fabrica):
    cliente.post("/api/cortes/m1/riscar")

    telemetria = await _telemetria(fabrica)

    assert [linha["corte_id"] for linha in telemetria["cortes"]] == ["c1", "c2"]
    assert telemetria["total_cortes"] == 2
