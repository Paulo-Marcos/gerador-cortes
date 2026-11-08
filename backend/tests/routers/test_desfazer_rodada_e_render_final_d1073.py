"""Desfazer a rodada das cenas leva a validação junto, e o render final segue (D-1073).

A Pós ganhou o "Desfazer rodada" (RN-37) ao lado do render travado até validar o plano
(RN-38, D-1072). As duas regras se encontram aqui: a marca de validadas é da rodada, então
o plano que volta traz a marca que tinha, e o render final libera ou trava conforme ela.
Desfazer de novo refaz, com a marca de volta. Se a tela mandou uma versão velha, nada muda:
nem as cenas, nem a marca, nem o render.

Pelas portas HTTP de verdade, com o tratador global. O pipeline em si é um registro.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.domain.corte.render_etapas import PLANO_NAO_VALIDADO
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import cortes as rota_cortes
from app.routers import origem_das_cenas as rota_das_cenas
from app.routers.errors import registrar_tratadores
from app.services.origem_das_cenas import CENAS_MUDARAM_AO_DESFAZER
from app.services.render.remotion_render import RemotionRenderService
from app.services.render.render_progress import RenderProgressStore
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_VALIDADA = json.dumps({"cenas": [{"tipo": "enfase", "texto": "Conferida", "inicio": 1, "fim": 2}]})
_NOVA = json.dumps({"cenas": [{"tipo": "enfase", "texto": "Da IA, nova", "inicio": 3, "fim": 4}]})
_RODADAS = "/api/cortes/c1/cenas-remotion/rodadas"


@pytest.fixture(autouse=True)
def _progresso_limpo():
    RenderProgressStore._progress.pop("c1", None)
    yield
    RenderProgressStore._progress.pop("c1", None)


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    """O corte depois de gerar de novo: a rodada nova sem validar, a anterior validada."""
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
                cenas_remotion=_NOVA,
                cenas_origem="claude",
                cenas_validadas=0,
                cenas_anteriores=_VALIDADA,
                cenas_anteriores_origem="gemini",
                cenas_anteriores_validadas=1,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def disparos(monkeypatch):
    chamadas: list[str] = []
    monkeypatch.setattr(
        RemotionRenderService,
        "iniciar_render_background",
        lambda corte_id, **_: chamadas.append(corte_id),
    )
    return chamadas


@pytest.fixture
def cliente(fabrica):
    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_cortes.router, prefix="/api/cortes")
    app.include_router(rota_das_cenas.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    return TestClient(app)


def _renderizar_final(cliente):
    return cliente.post("/api/cortes/c1/renderizar-pipeline", json={})


def _desfazer(cliente, versao: str):
    return cliente.post(f"{_RODADAS}/desfazer", json={"versao": versao})


def _versao(cliente) -> str:
    return cliente.get(_RODADAS).json()["versao"]


def test_desfazer_volta_a_rodada_validada_e_libera_o_render_final(cliente, disparos):
    assert _renderizar_final(cliente).status_code == 400

    resposta = _desfazer(cliente, _versao(cliente))

    assert resposta.status_code == 200
    assert resposta.json()["atual"]["validadas"] is True
    assert cliente.get("/api/cortes/c1").json()["cenas_validadas"] == 1
    assert _renderizar_final(cliente).status_code == 200
    assert disparos == ["c1"]


def test_refazer_traz_a_rodada_sem_validar_e_o_render_final_volta_a_travar(cliente, disparos):
    assert _desfazer(cliente, _versao(cliente)).status_code == 200
    assert _renderizar_final(cliente).status_code == 200

    refeita = _desfazer(cliente, _versao(cliente))

    assert refeita.status_code == 200
    assert refeita.json()["atual"]["origem"] == "claude"
    assert refeita.json()["atual"]["validadas"] is False
    resposta = _renderizar_final(cliente)
    assert resposta.status_code == 400
    assert resposta.json()["detail"] == PLANO_NAO_VALIDADO
    assert disparos == ["c1"]


def test_versao_velha_e_recusada_sem_mexer_nas_cenas_na_marca_nem_no_render(cliente, disparos):
    antes = cliente.get(_RODADAS).json()

    resposta = _desfazer(cliente, "versao-que-a-tela-viu-antes")

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == CENAS_MUDARAM_AO_DESFAZER
    assert cliente.get(_RODADAS).json() == antes
    assert _renderizar_final(cliente).status_code == 400
    assert disparos == []
