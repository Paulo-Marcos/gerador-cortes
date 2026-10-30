"""D-998: a geração de trechos grava o alerta "conferir" e o editor o dispensa.

Banco em memória (toda sessão do app é desviada para ele); a IA é trocada por
uma resposta fixa da trechos-expert com um desvio e um pedido de conferência.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto, StatusCorte
from app.routers import alertas_conferir as rota_alertas
from app.routers.errors import registrar_tratadores
from app.services.claude_ia import ClaudeIaService
from app.services.corte import CorteService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_TRANSCRICAO = [
    {"start": 0.0, "end": 30.0, "texto": "abertura"},
    {"start": 30.0, "end": 40.0, "texto": "repete a tese"},
    {"start": 60.0, "end": 70.0, "texto": "quarenta por cento dos casos"},
    {"start": 70.0, "end": 120.0, "texto": "fechamento"},
]


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
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_TRANSCRICAO)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_hms="00:00:00",
                fim_hms="00:02:00",
                inicio_seg=0.0,
                fim_seg=120.0,
                transcricao_corte=json.dumps(_TRANSCRICAO),
                status=StatusCorte.PROPOSTO,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def ia_pede_conferencia(monkeypatch):
    async def fake_gerar_desvios(_t, _meta, _existentes, _mapa=None, provider="claude"):
        return {
            "desvios": [
                {
                    "inicio_hms": "00:00:30",
                    "fim_hms": "00:00:40",
                    "categoria": "repeticao",
                    "motivo": "repete a tese",
                }
            ],
            "conferir": [
                {"inicio_hms": "00:01:00", "fim_hms": "00:01:10", "motivo": "cita 40% sem fonte"}
            ],
        }

    monkeypatch.setattr(ClaudeIaService, "gerar_desvios", staticmethod(fake_gerar_desvios))


@pytest.fixture
def cliente(fabrica):
    app = FastAPI()
    app.include_router(rota_alertas.router, prefix="/api/alertas-conferir")
    registrar_tratadores(app)
    return TestClient(app)


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


@pytest.mark.asyncio
async def test_gerar_trechos_grava_o_alerta_e_o_trecho_fica_no_corte(fabrica, ia_pede_conferencia):
    await CorteService.gerar_trechos_via_claude("c1")

    corte = await _corte(fabrica)
    desvios = json.loads(corte.desvios)
    alertas = json.loads(corte.alertas_conferir)
    assert [d["motivo"] for d in desvios] == ["repete a tese"]
    assert [(a["id"], a["motivo"], a["conferido"]) for a in alertas] == [
        ("60000-70000", "cita 40% sem fonte", False)
    ]
    texto_final = " ".join(linha["texto"] for linha in json.loads(corte.transcricao_final))
    assert "quarenta por cento" in texto_final
    assert "repete a tese" not in texto_final


@pytest.mark.asyncio
async def test_editor_dispensa_o_alerta_e_o_corte_devolve_conferido(
    fabrica, ia_pede_conferencia, cliente
):
    await CorteService.gerar_trechos_via_claude("c1")
    desvios_antes = (await _corte(fabrica)).desvios

    resposta = cliente.post("/api/alertas-conferir/c1/60000-70000/conferido")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["alertas_conferir"][0]["conferido"] is True
    assert [d["motivo"] for d in corpo["desvios"]] == ["repete a tese"]
    corte = await _corte(fabrica)
    assert json.loads(corte.alertas_conferir)[0]["conferido"] is True
    assert corte.desvios == desvios_antes


@pytest.mark.asyncio
async def test_alerta_conferido_nao_volta_ao_gerar_trechos_de_novo(
    fabrica, ia_pede_conferencia, cliente
):
    await CorteService.gerar_trechos_via_claude("c1")
    cliente.post("/api/alertas-conferir/c1/60000-70000/conferido")

    await CorteService.gerar_trechos_via_claude("c1")

    alertas = json.loads((await _corte(fabrica)).alertas_conferir)
    assert [(a["id"], a["conferido"]) for a in alertas] == [("60000-70000", True)]


def test_dispensar_alerta_que_nao_existe_e_404(cliente):
    assert cliente.post("/api/alertas-conferir/c1/0-1/conferido").status_code == 404
    assert cliente.post("/api/alertas-conferir/zz/0-1/conferido").status_code == 404
