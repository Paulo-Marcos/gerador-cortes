"""O modo do corte é decisão do operador, e o Global chega vivo (D-966, RN-10).

Três defeitos com a mesma raiz: o corte nascia gravado com a sentinela
`{"modo_padrao": "full", "regioes": []}`, e a leitura ADIVINHAVA se aquele
`full` era escolha ou herança pelo resto do layout ("corte configurado").

1. Escolher FULL num corte de projeto COMP gravava exatamente a sentinela, e a
   leitura devolvia COMP — o modo "não aceitava mudar".
2. Adicionar uma região tornava o corte "configurado", e o `full` da sentinela
   passava a valer: o corte virava FULL sozinho.
3. "Definir Global" COPIAVA o padrão em todo projeto; o projeto ficava com uma
   cópia própria e o Global, mudado depois, não chegava mais ao corte.

A regra nova é a de toda a cascata: `modo_padrao` presente é decisão; ausente
herda. Sentinela antiga e cópias do Global saem numa migration.
"""

from __future__ import annotations

import json
import sys

import pytest
import pytest_asyncio
from app import database
from app.database import get_db
from app.domain.corte.youtube_layout import (
    mesclar_no_layout_do_corte,
    regioes_compartilhadas,
    resolver_layout_em_cascata,
)
from app.models import Base, Corte, Projeto
from app.routers import projetos as rota_projetos
from app.routers.errors import registrar_tratadores
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PROJETO_COMP = {"modo_padrao": "compartilhada"}
REGIAO_COMP = {"inicio": 10.0, "fim": 20.0, "modo": "compartilhada"}
RECORTE = {"x": 10, "y": 20, "w": 300, "h": 200}


def _layout_inicial_do_corte() -> dict:
    """O que um corte recém-criado tem gravado (o default da coluna)."""
    return json.loads(Corte.__table__.c.layout_youtube.default.arg)


# ─── 1. o modo escolhido no corte vale, mesmo diferente do projeto ──────────


def test_corte_que_escolhe_full_num_projeto_comp_fica_em_full():
    escolhido = mesclar_no_layout_do_corte(_layout_inicial_do_corte(), {"modo_padrao": "full"})

    efetivo = resolver_layout_em_cascata(escolhido, PROJETO_COMP)

    assert efetivo["modo_padrao"] == "full"


def test_projeto_que_escolhe_full_num_global_comp_fica_em_full():
    efetivo = resolver_layout_em_cascata(None, {"modo_padrao": "full"}, PROJETO_COMP)

    assert efetivo["modo_padrao"] == "full"


def test_corte_recem_criado_herda_o_modo_do_projeto():
    efetivo = resolver_layout_em_cascata(_layout_inicial_do_corte(), PROJETO_COMP)

    assert "modo_padrao" not in _layout_inicial_do_corte()
    assert efetivo["modo_padrao"] == "compartilhada"


# ─── 2. adicionar região não mexe no modo do corte ───────────────────────────


def test_adicionar_regiao_mantem_o_modo_herdado_do_projeto():
    com_regiao = mesclar_no_layout_do_corte(_layout_inicial_do_corte(), {"regioes": [REGIAO_COMP]})

    efetivo = resolver_layout_em_cascata(com_regiao, PROJETO_COMP)

    assert efetivo["modo_padrao"] == "compartilhada"
    assert [r["modo"] for r in efetivo["regioes"]] == ["compartilhada"]


def test_mudar_o_modo_do_corte_preserva_o_ajuste_do_segmento():
    regiao = {**REGIAO_COMP, "compartilhada": {"telas": 1, "crop_tela": RECORTE}}
    gravado = mesclar_no_layout_do_corte({"modo_padrao": "full"}, {"regioes": [regiao]})

    gravado = mesclar_no_layout_do_corte(gravado, {"modo_padrao": "compartilhada"})

    trechos = regioes_compartilhadas(gravado, 60.0, PROJETO_COMP)
    no_segmento = [t for t in trechos if t["inicio"] == 10.0 and t["fim"] == 20.0]
    assert no_segmento and no_segmento[0]["telas"] == 1
    assert no_segmento[0]["crop_tela"] == RECORTE


# ─── 3. a migration converte a sentinela e solta as cópias do Global ─────────


@pytest_asyncio.fixture
async def conn():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conexao:
        # Só as colunas que a migration lê: o resto do schema não importa aqui.
        await conexao.execute(text("CREATE TABLE cortes (id TEXT, layout_youtube TEXT)"))
        await conexao.execute(text("CREATE TABLE projetos (id TEXT, layout_youtube_padrao TEXT)"))
        yield conexao
    await engine.dispose()


async def _inserir(conn, tabela: str, **colunas) -> None:
    nomes = ", ".join(colunas)
    marcas = ", ".join(f":{n}" for n in colunas)
    await conn.execute(text(f"INSERT INTO {tabela} ({nomes}) VALUES ({marcas})"), colunas)


async def _layout(conn, tabela: str, coluna: str, id_: str) -> dict:
    valor = (
        await conn.execute(text(f"SELECT {coluna} FROM {tabela} WHERE id = :id"), {"id": id_})
    ).scalar_one()
    return json.loads(valor)


@pytest.mark.asyncio
async def test_migration_tira_a_sentinela_e_preserva_corte_configurado(conn):
    from app.migrations import migration_008_modo_do_corte_e_global_vivo as migration

    sentinela = json.dumps({"modo_padrao": "full", "regioes": []})
    configurado = json.dumps({"modo_padrao": "full", "regioes": [REGIAO_COMP]})
    comp = json.dumps({"modo_padrao": "compartilhada", "regioes": []})
    for id_, layout in (("c1", sentinela), ("c2", configurado), ("c3", comp)):
        await _inserir(conn, "cortes", id=id_, layout_youtube=layout)

    await migration.upgrade(conn, global_padrao="{}")

    assert await _layout(conn, "cortes", "layout_youtube", "c1") == {"regioes": []}
    assert await _layout(conn, "cortes", "layout_youtube", "c2") == json.loads(configurado)
    assert await _layout(conn, "cortes", "layout_youtube", "c3") == json.loads(comp)


@pytest.mark.asyncio
async def test_migration_solta_do_projeto_o_que_e_copia_do_global(conn):
    from app.migrations import migration_008_modo_do_corte_e_global_vivo as migration

    global_ = {"modo_padrao": "full", "fundo": "hud-topo", "full": {"crop": RECORTE}}
    copia = dict(global_)
    ajustado = {**global_, "fundo": "cosmograph", "modo_padrao": "compartilhada"}
    await _inserir(conn, "projetos", id="p1", layout_youtube_padrao=json.dumps(copia))
    await _inserir(conn, "projetos", id="p2", layout_youtube_padrao=json.dumps(ajustado))

    await migration.upgrade(conn, global_padrao=json.dumps(global_))

    assert await _layout(conn, "projetos", "layout_youtube_padrao", "p1") == {}
    assert await _layout(conn, "projetos", "layout_youtube_padrao", "p2") == {
        "fundo": "cosmograph",
        "modo_padrao": "compartilhada",
    }


# ─── 4. "Definir Global" grava só no Global ──────────────────────────────────


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", layout_youtube_padrao="{}"))
        db.add(Projeto(id="p2", youtube_url="u2", layout_youtube_padrao='{"fundo": "cosmograph"}'))
        await db.commit()
    yield f
    await engine.dispose()


def test_definir_global_nao_copia_o_padrao_para_os_projetos(fabrica, monkeypatch):
    gravados: list[str] = []
    monkeypatch.setattr(
        rota_projetos.AppSettingsService,
        "update_youtube_layout_padrao_global",
        classmethod(lambda cls, layout: gravados.append(layout)),
    )
    monkeypatch.setattr(rota_projetos, "fire_and_forget", lambda *a, **k: None)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_projetos.router, prefix="/api/projetos")
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    global_ = json.dumps({"modo_padrao": "compartilhada", "fundo": "hud-topo"})

    resposta = TestClient(app).patch(
        "/api/projetos/p1/render-config",
        json={"layout_youtube_padrao": global_, "global_update": True},
    )

    assert resposta.status_code == 200, resposta.text
    assert gravados == [global_]
    assert resposta.json()["layout_youtube_padrao"] == "{}"

    async def _do_p2():
        async with fabrica() as db:
            return (await db.get(Projeto, "p2")).layout_youtube_padrao

    import asyncio

    assert asyncio.run(_do_p2()) == '{"fundo": "cosmograph"}'
