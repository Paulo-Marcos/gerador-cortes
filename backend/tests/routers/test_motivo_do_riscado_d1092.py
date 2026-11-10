"""D-1092: o corte riscado diz por quê, na resposta da API.

A seção "Riscados" da lista de cortes mostra o chip do motivo. O motivo mora no
snapshot da proposta (D-993, gravado pelo riscar da D-1088); o corte que chega à
tela passa a trazê-lo em `motivo_riscado`. Banco em memória (toda sessão do app
é desviada para ele) e a raiz dos projetos em `tmp_path`.
"""

from __future__ import annotations

import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.domain.corte.motivo_apagado import ler_motivos_gravados
from app.models import Base, Corte, CorteSnapshot, Projeto, StatusCorte
from app.routers import corte_riscado
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from app.services import media_retention, riscar_corte
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# c1 e c2 vêm da IA (têm snapshot); c3 foi feito na mão (sem snapshot).
_COM_SNAPSHOT = ("c1", "c2")


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
        for numero, corte_id in enumerate(("c1", "c2", "c3"), start=1):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="p1",
                    numero=numero,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    status=StatusCorte.PROPOSTO,
                )
            )
            if corte_id in _COM_SNAPSHOT:
                db.add(CorteSnapshot(id=f"s-{corte_id}", corte_id=corte_id, projeto_id="p1"))
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    from app.core import channel_paths

    monkeypatch.setattr(media_retention, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr("app.routers.cortes_helpers.projetos_dir", lambda: tmp_path)

    async def sem_bruto(_corte_id: str) -> None:
        return None

    monkeypatch.setattr(riscar_corte.bruto_do_corte, "iniciar_geracao", sem_bruto)

    async def sessao():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.include_router(corte_riscado.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _motivos(cliente) -> dict[str, list[str]]:
    resposta = cliente.get("/api/cortes/projeto/p1")
    assert resposta.status_code == 200
    return {c["id"]: c["motivo_riscado"] for c in resposta.json()}


def test_o_riscado_traz_os_motivos_gravados(cliente):
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "tema_fraco|repetido"})

    assert _motivos(cliente)["c1"] == ["tema_fraco", "repetido"]
    assert cliente.get("/api/cortes/c1").json()["motivo_riscado"] == ["tema_fraco", "repetido"]


def test_sem_motivo_sem_snapshot_ou_nao_riscado_vem_vazio(cliente):
    cliente.post("/api/cortes/c2/riscar")
    cliente.post("/api/cortes/c3/riscar", json={"motivo": "repetido"})

    assert _motivos(cliente) == {"c1": [], "c2": [], "c3": []}


def test_trazer_de_volta_tira_o_motivo(cliente):
    cliente.post("/api/cortes/c1/riscar", json={"motivo": "repetido"})
    assert cliente.post("/api/cortes/c1/trazer-de-volta").status_code == 200

    assert _motivos(cliente)["c1"] == []


@pytest.mark.parametrize(
    ("bruto", "esperado"),
    [
        ("tema_fraco|repetido", ["tema_fraco", "repetido"]),
        (" repetido | ", ["repetido"]),
        # Motivo que o canal criou ou escondeu depois continua sendo o motivo.
        ("motivo_do_canal", ["motivo_do_canal"]),
        ("", []),
        (None, []),
    ],
)
def test_motivos_gravados_le_como_foi_gravado(bruto, esperado):
    assert ler_motivos_gravados(bruto) == esperado
