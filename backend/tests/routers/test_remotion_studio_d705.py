"""Abrir um corte no Remotion Studio, pela porta HTTP (D-705).

Teste de caracterização, antes de o caso de uso e o estado dele saírem do
router. Pedir a URL do Studio monta as props do corte (vídeo, cenas, layout do
YouTube com o fallback do projeto) e as guarda; o Studio busca essas props por
outra rota. Troca só as bordas: banco em memória, a pasta dos projetos e o
estado guardado, zerado a cada teste. As referências que o movimento troca
ficam no topo.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.config import settings
from app.database import get_db
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Onde o caso de uso lê a pasta dos projetos e guarda as props ativas.
_PROJETOS_DIR_LIDO_EM = ["app.routers.cortes"]
_PROPS_ATIVAS_EM = ("app.routers.cortes", "_remotion_active_props")

_CENAS = [{"tipo": "ficha", "inicio": 1.0, "fim": 3.0}]
_LAYOUT_DO_PROJETO = json.dumps({"modo_padrao": "compartilhada", "regioes": []})


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
        db.add(
            Projeto(
                id="p1",
                youtube_url="u",
                layout_youtube_padrao=_LAYOUT_DO_PROJETO,
                sombra_nivel_padrao="forte",
            )
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.APROVADO,
                cenas_remotion=json.dumps({"cenas": _CENAS}),
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(f"{_PROPS_ATIVAS_EM[0]}.{_PROPS_ATIVAS_EM[1]}", {})

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _clip(tmp_path, nome: str = "clip_raw.mp4"):
    pasta = tmp_path / "p1" / "cortes" / "c1"
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / nome).write_bytes(b"mp4")


def test_sem_pedido_o_studio_recebe_props_vazias(cliente):
    assert cliente.get("/api/cortes/remotion/active-props").json() == {}


def test_a_url_do_studio_monta_e_guarda_as_props_do_corte(cliente, tmp_path):
    _clip(tmp_path)

    corpo = cliente.get("/api/cortes/c1/remotion-studio-url").json()

    video = f"{settings.backend_public_url}/videos/p1/cortes/c1/clip_raw.mp4"
    assert corpo["studio_url"] == (
        f"http://localhost:{settings.remotion_studio_port}/CenaYouTubeV2"
    )
    assert corpo["video_url"] == video
    props = corpo["props"]
    assert (props["videoUrl"], props["letterbox"], props["filtroCss"]) == (video, False, "none")
    assert props["layoutYoutube"]["modo_padrao"] == "compartilhada", "cai no layout do projeto"
    assert (props["sombraNivelPadrao"], props["layoutCardPadrao"]) == ("forte", "vertical")
    assert [c["tipo"] for c in props["cenas"]] == ["ficha"]
    assert cliente.get("/api/cortes/remotion/active-props").json() == props


def test_o_mkv_tem_precedencia_sobre_o_mp4(cliente, tmp_path):
    _clip(tmp_path, "clip_raw.mp4")
    _clip(tmp_path, "clip_raw.mkv")

    corpo = cliente.get("/api/cortes/c1/remotion-studio-url").json()

    assert corpo["video_url"].endswith("/clip_raw.mkv")


def test_sem_video_exportado_da_404_e_nao_guarda_nada(cliente):
    resposta = cliente.get("/api/cortes/c1/remotion-studio-url")

    assert resposta.status_code == 404
    assert "Exportar NLE" in resposta.json()["detail"]
    assert cliente.get("/api/cortes/remotion/active-props").json() == {}


def test_corte_inexistente_da_404(cliente):
    resposta = cliente.get("/api/cortes/nao-tem/remotion-studio-url")

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Corte não encontrado")


@pytest.mark.asyncio
async def test_sem_cenas_as_props_vao_com_lista_vazia(cliente, fabrica, tmp_path):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).cenas_remotion = ""
        await db.commit()
    _clip(tmp_path)

    corpo = cliente.get("/api/cortes/c1/remotion-studio-url").json()

    assert corpo["props"]["cenas"] == []
