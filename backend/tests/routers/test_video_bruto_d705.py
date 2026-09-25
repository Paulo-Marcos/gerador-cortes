"""Servir o vídeo bruto do corte, pela porta HTTP (D-705).

Teste de caracterização, antes de a regra que acha o bruto no disco sair do
router. A rota redireciona para o arquivo, com `?v=<mtime>` para o navegador
não servir um bruto velho do cache: primeiro o caminho gravado no corte, depois
o `clip_raw_*` mais recente, depois os nomes fixos, nesta ordem. Troca só as
bordas: banco em memória e a pasta dos projetos. As referências que o movimento
troca ficam no topo.
"""

from __future__ import annotations

import os
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Onde a regra lê a pasta dos projetos (o canal resolve o caminho gravado).
_PROJETOS_DIR_LIDO_EM = ["app.routers.cortes", "app.core.channel_paths"]


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
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app, follow_redirects=False)


def _video(tmp_path, nome: str, mtime: int):
    pasta = tmp_path / "p1" / "cortes" / "c1"
    pasta.mkdir(parents=True, exist_ok=True)
    arquivo = pasta / nome
    arquivo.write_bytes(b"mkv")
    os.utime(arquivo, (mtime, mtime))
    return arquivo


def _destino(cliente) -> tuple[int, str, str]:
    resposta = cliente.get("/api/cortes/c1/video-bruto")
    return (
        resposta.status_code,
        resposta.headers.get("location", ""),
        resposta.headers.get("cache-control", ""),
    )


@pytest.mark.asyncio
async def test_o_caminho_gravado_no_corte_vem_primeiro(cliente, fabrica, tmp_path):
    _video(tmp_path, "clip_raw_B_2.mkv", 2_000)
    _video(tmp_path, "gravado.mkv", 1_000)
    async with fabrica() as db:
        (await db.get(Corte, "c1")).arquivo_clip_path = "cortes/c1/gravado.mkv"
        await db.commit()

    assert _destino(cliente) == (
        307,
        "/videos/p1/cortes/c1/gravado.mkv?v=1000",
        "no-store",
    )


def test_sem_caminho_gravado_vale_o_clip_raw_mais_recente(cliente, tmp_path):
    _video(tmp_path, "clip_raw.mkv", 5_000)
    _video(tmp_path, "clip_raw_A_1.mkv", 1_000)
    _video(tmp_path, "clip_raw_B_2.mp4", 3_000)

    assert _destino(cliente)[1] == "/videos/p1/cortes/c1/clip_raw_B_2.mp4?v=3000"


def test_os_nomes_fixos_na_ordem_mkv_antes_de_mp4(cliente, tmp_path):
    _video(tmp_path, "clip_raw.mp4", 9_000)
    _video(tmp_path, "clip_raw.mkv", 1_000)

    assert _destino(cliente)[1] == "/videos/p1/cortes/c1/clip_raw.mkv?v=1000"


def test_o_backup_com_silencios_e_o_ultimo_recurso(cliente, tmp_path):
    _video(tmp_path, "clip_raw_backup_com_silencios.mp4", 1_000)

    assert _destino(cliente)[1] == ("/videos/p1/cortes/c1/clip_raw_backup_com_silencios.mp4?v=1000")


def test_sem_bruto_nenhum_da_404(cliente):
    resposta = cliente.get("/api/cortes/c1/video-bruto")

    assert (resposta.status_code, resposta.json()["detail"]) == (
        404,
        "Vídeo bruto não encontrado",
    )


def test_corte_inexistente_da_404(cliente):
    resposta = cliente.get("/api/cortes/nao-tem/video-bruto")

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Corte não encontrado")
