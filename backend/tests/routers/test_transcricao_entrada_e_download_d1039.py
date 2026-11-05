"""O que a escrita antes do lote passou a exigir de quem chega nela (D-1039).

Gravar antes do lote tirou uma proteção acidental: o valor que não é lista
quebrava a sincronia e o `rollback` o descartava. E, com a escrita no service, o
download da legenda não pode voltar a acontecer com escrita pendente (ADR-0016).
"""

import json
import sqlite3
import sys

import httpx
import pytest
import pytest_asyncio
from app import database
from app.models import Base, Corte, Projeto
from app.routers import projetos as rota_projetos
from app.routers.errors import registrar_tratadores
from app.services import projeto as projeto_module
from app.services.ingestao import IngestaoService
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_TRANSCRICAO = [{"inicio": 10.0, "fim": 11.0, "texto": "velho"}]


@pytest_asyncio.fixture
async def fabrica(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    monkeypatch.setattr(projeto_module, "projetos_dir", lambda: tmp_path)
    (tmp_path / "p1").mkdir()
    async with f() as db:
        db.add(
            Projeto(
                id="p1",
                youtube_url="https://youtu.be/p1",
                titulo_live="Live",
                transcricao_raw=json.dumps(_TRANSCRICAO),
            )
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="Corte",
                inicio_hms="00:00:10",
                fim_hms="00:01:00",
                inicio_seg=10.0,
                fim_seg=60.0,
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest_asyncio.fixture
async def cliente(fabrica):
    app = FastAPI()
    app.include_router(rota_projetos.router, prefix="/api/projetos")
    registrar_tratadores(app)
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as c:
        yield c


@pytest.mark.asyncio
@pytest.mark.parametrize("valor", [0, False, "abc", {"a": 1}])
async def test_transcricao_que_nao_e_lista_da_400_e_nao_entra_no_projeto(cliente, fabrica, valor):
    resposta = await cliente.patch("/api/projetos/p1/transcricao", json={"transcricao": valor})

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Campo 'transcricao' precisa ser uma lista"
    async with fabrica() as db:
        assert json.loads((await db.get(Projeto, "p1")).transcricao_raw) == _TRANSCRICAO


@pytest.mark.asyncio
async def test_transcricao_vazia_continua_aceita(cliente, fabrica):
    resposta = await cliente.patch("/api/projetos/p1/transcricao", json={"transcricao": []})

    assert resposta.status_code == 200
    async with fabrica() as db:
        assert (await db.get(Projeto, "p1")).transcricao_raw == "[]"


@pytest.mark.asyncio
async def test_download_da_legenda_nao_segura_o_banco(cliente, tmp_path, monkeypatch):
    """Durante o download, outra conexão consegue abrir uma escrita (ADR-0016, regra 3)."""
    abertura_de_escrita = []

    async def extrair_legenda(*_args, **_kwargs):
        conexao = sqlite3.connect(tmp_path / "p.db", timeout=0)
        try:
            conexao.execute("BEGIN IMMEDIATE")
            conexao.rollback()
            abertura_de_escrita.append("livre")
        except sqlite3.OperationalError as erro:
            abertura_de_escrita.append(str(erro))
        finally:
            conexao.close()
        return _TRANSCRICAO

    monkeypatch.setattr(IngestaoService, "_extrair_legenda", staticmethod(extrair_legenda))

    resposta = await cliente.put("/api/projetos/p1/sincronia-legenda", json={"offset_segundos": 1})

    assert resposta.status_code == 200, resposta.text
    assert abertura_de_escrita == ["livre"]
