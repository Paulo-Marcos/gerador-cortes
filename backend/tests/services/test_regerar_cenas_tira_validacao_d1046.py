"""Cenas substituídas não herdam a marca de validadas (D-1046).

O diálogo de "Gerar de novo" promete que a marca será perdida, e o item "Cenas validadas" da
Revisão lê essa coluna. Validar diz que o operador conferiu AQUELAS cenas; as novas ninguém viu.

Tudo é de verdade, das rotas ao banco em memória, menos a IA, o scaffold do canal e o retrato.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.models import Base, Corte, Projeto
from app.routers import claude_ia, cortes
from app.routers.errors import registrar_tratadores
from app.services import abertura_do_corte, cenas_remotion, retrato_wikipedia
from app.services.cenas_da_cadeia import gerar_cenas_da_cadeia
from app.services.cenas_em_geracao import reservar_ou_recusar
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_TRANSCRICAO = [
    {
        "start": float(i),
        "end": float(i + 1),
        "inicio": float(i),
        "fim": float(i + 1),
        "texto": f"frase {i}",
    }
    for i in range(0, 50, 10)
]
_VALIDADAS_EM = datetime(2026, 11, 1, 10, 0, 0)
_CENA_DA_IA = {"tipo": "enfase", "texto": "Cena nova", "startLeg": 1, "duracao_s": 4}
_CENA_CONFERIDA = {"tipo": "enfase", "texto": "Conferida", "inicio": 2.0, "fim": 6.0}


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
        db.add(Projeto(id="p1", youtube_url="https://x/y"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                status="aprovado",
                inicio_seg=0.0,
                fim_seg=60.0,
                transcricao_final=json.dumps(_TRANSCRICAO),
                cenas_remotion=json.dumps({"formato": "cortes", "cenas": [_CENA_CONFERIDA]}),
                cenas_validadas=1,
                cenas_validadas_em=_VALIDADAS_EM,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def ia(monkeypatch, tmp_path):
    """A IA dos dois provedores, com o que a geração lê do canal fora do `instance/`."""
    resposta = AsyncMock(return_value={"cenas": [_CENA_DA_IA]})
    monkeypatch.setattr(abertura_do_corte, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(
        cenas_remotion.editorial_scaffolds,
        "resolver_scaffold",
        lambda *_a, **_k: "{legendas_numeradas}",
    )
    monkeypatch.setattr(
        cenas_remotion.editorial_skills,
        "resolver_skill",
        lambda *_a, **_k: SimpleNamespace(lentes=[]),
    )
    monkeypatch.setattr(cenas_remotion, "registrar_skill_usada", MagicMock())
    monkeypatch.setattr(cenas_remotion, "gerar_json", resposta)
    monkeypatch.setattr(cenas_remotion.gemini_client, "generate_json", resposta)
    monkeypatch.setattr(cenas_remotion.modelos_ia, "ler_modelos", MagicMock())
    return resposta


@pytest_asyncio.fixture
async def cliente(fabrica):
    async def banco():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(claude_ia.router, prefix="/api/claude")
    app.include_router(cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as http:
        yield http


async def _pelo_botao(cliente):
    return await cliente.post("/api/claude/corte/c1/gerar-cenas")


async def _pelo_gemini(cliente):
    return await cliente.post("/api/cortes/c1/gerar-cenas-remotion")


async def _pelo_import_manual(cliente):
    return await cliente.post(
        "/api/cortes/c1/cenas-remotion/importar", json={"cenas": [_CENA_DA_IA]}
    )


async def _pela_cadeia_do_bruto(_cliente):
    await gerar_cenas_da_cadeia("c1", reservar_ou_recusar("c1"))
    return SimpleNamespace(status_code=200, text="")


async def _estado(fabrica) -> tuple[list[str], int, datetime | None]:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        textos = [c["texto"] for c in json.loads(corte.cenas_remotion)["cenas"]]
        return textos, corte.cenas_validadas, corte.cenas_validadas_em


@pytest.mark.parametrize(
    "substituir", [_pelo_botao, _pelo_gemini, _pelo_import_manual, _pela_cadeia_do_bruto]
)
@pytest.mark.asyncio
async def test_cenas_substituidas_perdem_a_marca(cliente, fabrica, ia, substituir):
    resposta = await substituir(cliente)

    assert resposta.status_code == 200, resposta.text
    assert await _estado(fabrica) == (["Cena nova"], 0, None)


@pytest.mark.asyncio
async def test_as_cenas_novas_podem_ser_validadas_de_novo(cliente, fabrica, ia):
    await _pelo_botao(cliente)

    resposta = await cliente.post("/api/cortes/c1/cenas-remotion/validar")

    assert resposta.status_code == 200, resposta.text
    textos, marca, em = await _estado(fabrica)
    assert (textos, marca) == (["Cena nova"], 1)
    assert em is not None


# ─── Sem cena nova, nada a desfazer: a marca fala das cenas que continuam lá ───


@pytest.mark.asyncio
async def test_geracao_que_falha_mantem_cenas_e_marca(cliente, fabrica, ia):
    ia.side_effect = RuntimeError("IA fora do ar")

    resposta = await _pelo_botao(cliente)

    assert resposta.status_code == 500
    assert await _estado(fabrica) == (["Conferida"], 1, _VALIDADAS_EM)


@pytest.mark.asyncio
async def test_ia_sem_cenas_mantem_cenas_e_marca(cliente, fabrica, ia):
    ia.return_value = {"cenas": []}

    resposta = await _pelo_botao(cliente)

    assert resposta.status_code == 400
    assert await _estado(fabrica) == (["Conferida"], 1, _VALIDADAS_EM)


@pytest.mark.asyncio
async def test_import_recusado_mantem_cenas_e_marca(cliente, fabrica):
    async with fabrica() as db:
        (await db.get(Corte, "c1")).transcricao_final = "[]"
        await db.commit()

    resposta = await _pelo_import_manual(cliente)

    assert resposta.status_code == 400
    assert await _estado(fabrica) == (["Conferida"], 1, _VALIDADAS_EM)


@pytest.mark.asyncio
async def test_buscar_retrato_nao_e_substituir_as_cenas(cliente, fabrica, monkeypatch):
    ficha = {"tipo": "ficha_biografica", "texto": "Conferida", "inicio": 2.0, "fim": 6.0}
    async with fabrica() as db:
        (await db.get(Corte, "c1")).cenas_remotion = json.dumps({"cenas": [ficha]})
        await db.commit()
    monkeypatch.setattr(
        retrato_wikipedia,
        "buscar_wikipedia",
        AsyncMock(return_value=SimpleNamespace(url_publica="http://localhost/r.jpg")),
    )

    resposta = await cliente.post("/api/cortes/c1/cenas-remotion/retratos")

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["retratos"]["atualizados"] == 1
    assert await _estado(fabrica) == (["Conferida"], 1, _VALIDADAS_EM)
