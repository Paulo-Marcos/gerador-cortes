"""D-1040 (RN-36): a sincronia que falha não desfaz o trecho gravado nem o duplica.

`adicionar_desvio` grava e depois sincroniza. Com a sincronia falhando, a resposta era
500 com o desvio já no banco: a tela do atalho não mostrava nada, o operador apertava de
novo e a lista ganhava dois desvios iguais. Agora a resposta é normal e avisa, e repetir
o mesmo intervalo não grava outro: só refaz a sincronia que ficou para trás.
"""

import json

import pytest
import pytest_asyncio
from app.database import get_db
from app.models import Base, Corte, Projeto
from app.routers import cortes as rota_cortes
from app.routers.errors import registrar_tratadores
from app.services import corte as corte_module
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PALAVRAS = [f"palavra{i}" for i in range(60)]
_FALAS = [
    {
        "start": 100.0 + i,
        "end": 100.0 + i + 4,
        "texto": " ".join(_PALAVRAS[i : i + 4]),
        "palavras": [
            {"texto": palavra, "inicio_seg": 100.0 + i + j}
            for j, palavra in enumerate(_PALAVRAS[i : i + 4])
        ],
    }
    for i in range(0, len(_PALAVRAS), 4)
]
_CENA = {"tipo": "enfase", "texto": "Tese", "inicio": 30.0, "fim": 35.0}
_TRECHO = {"inicio_hms": "00:01:50.000", "fim_hms": "00:02:00.000", "motivo": "Trecho manual"}


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
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_FALAS)))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=100.0,
                fim_seg=160.0,
                status="proposto",
            )
        )
        await db.commit()
    # A cena nasce sobre a transcrição do corte, como na tela: é dela que ela se move.
    await corte_module.CorteService.sincronizar_transcricao_corte("c1")
    async with f() as db:
        corte = await db.get(Corte, "c1")
        corte.cenas_remotion = json.dumps([_CENA])
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
    app.dependency_overrides[get_db] = sessao
    registrar_tratadores(app)
    # O 500 do bug é a resposta sob teste: não pode virar exceção no teste.
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def sincronia_quebrada(monkeypatch):
    """Quebra a gravação da sincronia, como um banco travado, até o teste consertar."""
    original = corte_module._gravar_sincronia
    estado = {"quebrada": True}

    async def gravar(*args, **kwargs):
        if estado["quebrada"]:
            raise RuntimeError("database is locked")
        return await original(*args, **kwargs)

    monkeypatch.setattr(corte_module, "_gravar_sincronia", gravar)
    return estado


def _adicionar(cliente, trecho=_TRECHO):
    return cliente.post("/api/cortes/c1/adicionar-desvio", json=trecho)


async def _gravado(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


@pytest.mark.asyncio
async def test_sincronia_falhando_nao_responde_500_e_o_trecho_fica_gravado(
    cliente, fabrica, sincronia_quebrada
):
    resposta = _adicionar(cliente)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["sincronia_falhou"] is True
    assert [d["inicio_hms"] for d in corpo["desvios"]] == ["00:01:50.000"]
    assert len(json.loads((await _gravado(fabrica)).desvios)) == 1


@pytest.mark.asyncio
async def test_sincronia_que_funciona_nao_traz_o_aviso(cliente, fabrica):
    resposta = _adicionar(cliente)

    assert resposta.status_code == 200
    assert resposta.json()["sincronia_falhou"] is False
    assert json.loads((await _gravado(fabrica)).cenas_remotion)[0]["inicio"] == 20.0


@pytest.mark.asyncio
async def test_repetir_com_a_sincronia_falhando_nao_duplica(cliente, fabrica, sincronia_quebrada):
    _adicionar(cliente)
    segunda = _adicionar(cliente)

    assert segunda.status_code == 200
    assert segunda.json()["sincronia_falhou"] is True
    assert len(json.loads((await _gravado(fabrica)).desvios)) == 1


@pytest.mark.asyncio
async def test_repetir_depois_da_falha_recupera_a_sincronia(cliente, fabrica, sincronia_quebrada):
    _adicionar(cliente)
    corte = await _gravado(fabrica)
    assert json.loads(corte.cenas_remotion)[0]["inicio"] == 30.0

    sincronia_quebrada["quebrada"] = False
    segunda = _adicionar(cliente)

    assert segunda.json()["sincronia_falhou"] is False
    corte = await _gravado(fabrica)
    assert len(json.loads(corte.desvios)) == 1
    assert json.loads(corte.cenas_remotion)[0]["inicio"] == 20.0


@pytest.mark.asyncio
async def test_mesmo_intervalo_com_outro_motivo_nao_entra_de_novo(cliente, fabrica):
    _adicionar(cliente)
    segunda = _adicionar(cliente, {**_TRECHO, "motivo": "outro motivo"})

    assert segunda.status_code == 200
    desvios = json.loads((await _gravado(fabrica)).desvios)
    assert [d["motivo"] for d in desvios] == ["Trecho manual"]


@pytest.mark.asyncio
async def test_intervalo_igual_a_desvio_antigo_sem_segundos_nao_entra_de_novo(cliente, fabrica):
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        corte.desvios = json.dumps(
            [{"inicio_hms": "00:01:50", "fim_hms": "00:02:00", "motivo": "antigo"}]
        )
        await db.commit()

    resposta = _adicionar(cliente)

    assert resposta.status_code == 200
    desvios = json.loads((await _gravado(fabrica)).desvios)
    assert [d["motivo"] for d in desvios] == ["antigo"]


@pytest.mark.asyncio
async def test_intervalo_diferente_entra_na_ordem_do_tempo(cliente, fabrica):
    _adicionar(cliente)
    _adicionar(cliente, {**_TRECHO, "inicio_hms": "00:01:45.000", "fim_hms": "00:01:48.000"})
    _adicionar(cliente, {**_TRECHO, "fim_hms": "00:02:01.000"})

    desvios = json.loads((await _gravado(fabrica)).desvios)
    assert [(d["inicio_hms"], d["fim_hms"]) for d in desvios] == [
        ("00:01:45.000", "00:01:48.000"),
        ("00:01:50.000", "00:02:00.000"),
        ("00:01:50.000", "00:02:01.000"),
    ]
