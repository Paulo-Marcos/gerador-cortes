"""Juntar cortes zera a rodada das cenas: depois da junção não há anterior (D-1073, RN-37).

A junção reescreve as cenas do corte que fica (as dele mais as do outro, deslocadas) sem
passar pela geração. A anterior guardada era de uma metade só, no tempo de antes; desfazer
a trocaria pelo plano mesclado e o devolveria a um corte que não existe mais. Decisão do
Paulo em 07/11/2026: juntar zera a rodada, e o desfazer fica sem anterior até a próxima
geração. A validação já saía junto (D-575).

Pelas portas HTTP de verdade, com o tratador global: o que se confere é o que a Pós lê.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto
from app.routers import cortes as rota_cortes
from app.routers import origem_das_cenas as rota_das_cenas
from app.routers.errors import registrar_tratadores
from app.services import corte as corte_module
from app.services.corte import CorteService
from app.services.origem_das_cenas import SEM_RODADA_ANTERIOR
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


def _plano(texto: str, inicio: float) -> str:
    return json.dumps(
        {"cenas": [{"tipo": "enfase", "texto": texto, "inicio": inicio, "fim": inicio + 2}]}
    )


def _corte(corte_id: str, numero: int, inicio: float, fim: float, texto: str) -> Corte:
    """Um corte com a rodada atual da IA e a anterior guardada, validada."""
    return Corte(
        id=corte_id,
        projeto_id="p1",
        numero=numero,
        inicio_seg=inicio,
        fim_seg=fim,
        inicio_hms=f"{inicio}",
        fim_hms=f"{fim}",
        desvios="[]",
        cenas_remotion=_plano(f"{texto} atual", 1),
        cenas_origem="claude",
        cenas_validadas=1,
        cenas_anteriores=_plano(f"{texto} anterior", 1),
        cenas_anteriores_origem="gemini",
        cenas_anteriores_validadas=1,
    )


@pytest_asyncio.fixture
async def fabrica(monkeypatch, tmp_path):
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
    # A junção apaga artefatos em disco e ressincroniza a transcrição: fora do teste.
    monkeypatch.setattr(corte_module, "projetos_dir", lambda: tmp_path)

    async def _sem_resync(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_sem_resync))
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        db.add(_corte("c1", 1, 0.0, 60.0, "Primeiro"))
        db.add(_corte("c2", 2, 80.0, 140.0, "Segundo"))
        await db.commit()
    yield f
    await engine.dispose()


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


def _rodadas(cliente):
    return cliente.get("/api/cortes/c1/cenas-remotion/rodadas")


def test_antes_de_juntar_o_corte_tem_rodada_anterior(cliente):
    assert _rodadas(cliente).json()["anterior"] is not None


def test_depois_de_juntar_nao_ha_rodada_anterior(cliente):
    assert cliente.post("/api/cortes/c1/juntar", json={}).status_code == 200

    rodadas = _rodadas(cliente).json()

    assert rodadas["anterior"] is None
    assert [cena["texto"] for cena in rodadas["atual"]["cenas"]] == [
        "Primeiro atual",
        "Segundo atual",
    ]
    assert rodadas["atual"]["validadas"] is False
    assert rodadas["diferencas"]["sairam"] == []


def test_depois_de_juntar_o_desfazer_recusa_por_falta_de_anterior(cliente):
    assert cliente.post("/api/cortes/c1/juntar", json={}).status_code == 200
    versao = _rodadas(cliente).json()["versao"]

    resposta = cliente.post(
        "/api/cortes/c1/cenas-remotion/rodadas/desfazer", json={"versao": versao}
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == SEM_RODADA_ANTERIOR
    textos = [cena["texto"] for cena in _rodadas(cliente).json()["atual"]["cenas"]]
    assert textos == ["Primeiro atual", "Segundo atual"]
