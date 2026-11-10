"""D-1097: "Juntar com o próximo" risca o segundo corte em vez de apagá-lo.

Decisão do Paulo (P8 do design D-1082, "Sim, com volta"): o segundo corte fica
riscado com título, Fire, aprovação e proposta; solta a mídia como o Limpar; e o
"Trazer de volta" o devolve e regera o bruto. O riscado não conta como corte
vizinho: o próximo corte e o "corte no meio" o pulam.

Banco em memória (toda sessão do app é desviada para ele) e a raiz dos projetos
em `tmp_path`.
"""

from __future__ import annotations

import json
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
from app.services.corte import CorteService
from fastapi import FastAPI
from fastapi.testclient import TestClient
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
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
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


@pytest.fixture(autouse=True)
def sem_resync(monkeypatch):
    async def _fake(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_fake))


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


async def _semear(fabrica, corte_id: str, numero: int, inicio: float, fim: float, **campos):
    async with fabrica() as db:
        db.add(
            Corte(
                id=corte_id,
                projeto_id="p1",
                numero=numero,
                inicio_seg=inicio,
                fim_seg=fim,
                inicio_hms=f"{inicio}",
                fim_hms=f"{fim}",
                **campos,
            )
        )
        await db.commit()


async def _par(fabrica, **do_segundo):
    """c1 de 0 a 100 s e c2 de 120 a 200 s; o c2 é aprovado, Fire e da IA."""
    await _semear(fabrica, "c1", 1, 0.0, 100.0, titulo_proposto="Parte A")
    campos = {
        "titulo_proposto": "Parte B",
        "status": StatusCorte.APROVADO,
        "is_fire": True,
        "cenas_remotion": json.dumps([{"inicio_seg": 5.0, "fim_seg": 8.0, "texto": "B"}]),
        **do_segundo,
    }
    await _semear(fabrica, "c2", 2, 120.0, 200.0, **campos)
    async with fabrica() as db:
        db.add(CorteSnapshot(id="s-c2", corte_id="c2", projeto_id="p1"))
        await db.commit()


async def _corte(fabrica, corte_id: str) -> Corte | None:
    async with fabrica() as db:
        return await db.get(Corte, corte_id)


# ── o segundo fica riscado, com o trabalho ─────────────────────────────────────


@pytest.mark.asyncio
async def test_juntar_risca_o_segundo_corte_em_vez_de_apagar(fabrica, raiz):
    await _par(fabrica)

    await CorteService.juntar_cortes("c1", "c2")

    segundo = await _corte(fabrica, "c2")
    assert segundo is not None
    assert segundo.status == StatusCorte.REJEITADO
    assert segundo.status_antes_de_riscar == "aprovado"
    assert segundo.titulo_proposto == "Parte B"
    assert segundo.is_fire
    assert (await _corte(fabrica, "c1")).fim_seg == 200.0


@pytest.mark.asyncio
async def test_o_riscado_guarda_as_cenas_dele(fabrica, raiz):
    await _par(fabrica)

    await CorteService.juntar_cortes("c1", "c2")

    cenas = json.loads((await _corte(fabrica, "c2")).cenas_remotion)
    assert cenas == [{"inicio_seg": 5.0, "fim_seg": 8.0, "texto": "B"}]


@pytest.mark.asyncio
async def test_o_juntado_nao_conta_como_proposta_apagada(fabrica, raiz):
    """A proposta do segundo vive no corte que ficou: a telemetria não a conta."""
    await _par(fabrica)

    await CorteService.juntar_cortes("c1", "c2")

    async with fabrica() as db:
        snapshot = (
            await db.execute(select(CorteSnapshot).where(CorteSnapshot.corte_id == "c2"))
        ).scalar_one()
    assert snapshot.apagado_em is None
    assert snapshot.motivo_apagado == ""


@pytest.mark.asyncio
async def test_a_midia_do_segundo_sai_como_no_limpar(fabrica, raiz):
    pasta = raiz / "p1" / "cortes" / "c2"
    pasta.mkdir(parents=True)
    (pasta / "clip_raw.mkv").write_bytes(b"x")
    capa = pasta / "thumbnail.png"
    capa.write_bytes(b"x")
    await _par(fabrica, arquivo_clip_path="cortes/c2/clip_raw.mkv", is_fire=False)

    await CorteService.juntar_cortes("c1", "c2")

    segundo = await _corte(fabrica, "c2")
    assert not (pasta / "clip_raw.mkv").exists()
    # A capa e o texto ficam, como no Limpar: a pasta não é apagada inteira.
    assert capa.exists()
    assert segundo.arquivo_clip_path == ""
    assert segundo.bruto_solto_ao_riscar


# ── trazer de volta ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_trazer_de_volta_devolve_a_aprovacao_e_regera_o_bruto(
    cliente, fabrica, raiz, geracoes
):
    pasta = raiz / "p1" / "cortes" / "c2"
    pasta.mkdir(parents=True)
    (pasta / "clip_raw.mkv").write_bytes(b"x")
    await _par(fabrica, arquivo_clip_path="cortes/c2/clip_raw.mkv", is_fire=False)
    assert cliente.post("/api/cortes/c1/juntar", json={}).status_code == 200

    resposta = cliente.post("/api/cortes/c2/trazer-de-volta")

    assert resposta.status_code == 200
    assert (await _corte(fabrica, "c2")).status == StatusCorte.APROVADO
    assert geracoes == ["c2"]


# ── o riscado não é vizinho ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_juntar_de_novo_pula_o_riscado_e_pega_o_proximo(cliente, fabrica, raiz):
    await _par(fabrica)
    await _semear(fabrica, "c3", 3, 250.0, 300.0)
    assert cliente.post("/api/cortes/c1/juntar", json={}).status_code == 200

    resposta = cliente.post("/api/cortes/c1/juntar", json={})

    assert resposta.status_code == 200
    assert resposta.json()["fim_seg"] == 300.0
    assert (await _corte(fabrica, "c3")).status == StatusCorte.REJEITADO


@pytest.mark.asyncio
async def test_um_riscado_entre_os_dois_nao_barra_a_juncao(fabrica, raiz):
    await _semear(fabrica, "c1", 1, 0.0, 100.0)
    await _semear(fabrica, "c2", 2, 120.0, 200.0, status=StatusCorte.REJEITADO)
    await _semear(fabrica, "c3", 3, 220.0, 300.0)

    await CorteService.juntar_cortes("c1", "c3")

    assert (await _corte(fabrica, "c1")).fim_seg == 300.0


@pytest.mark.asyncio
async def test_recusa_juntar_um_corte_riscado(cliente, fabrica, raiz):
    await _semear(fabrica, "c1", 1, 0.0, 100.0)
    await _semear(fabrica, "c2", 2, 120.0, 200.0, status=StatusCorte.REJEITADO)

    resposta = cliente.post("/api/cortes/c1/juntar", json={"outro_corte_id": "c2"})

    assert resposta.status_code == 400
    assert "riscado" in resposta.json()["detail"]
    assert (await _corte(fabrica, "c1")).fim_seg == 100.0
