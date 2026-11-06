"""A busca de retratos não apaga as cenas que mudaram enquanto ela buscava (D-1065).

A busca lê as cenas, vai à rede por até dezenas de segundos e grava. Sem conferir, gravava
a lista lida por cima do que aconteceu nesse intervalo: uma geração paga sumia em silêncio,
com 200. Agora ela grava só se as cenas seguem as lidas e, se não, avisa o operador.

Só a Wikipedia é falsa: fica presa até a mudança do cenário entrar, pela rota de verdade.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from app.database import get_db
from app.models import Base, Corte, Projeto
from app.routers import cortes
from app.routers.errors import registrar_tratadores
from app.services import cenas_remotion as cenas_module
from app.services import corte as corte_module
from app.services import origem_das_cenas, retrato_wikipedia
from app.services.corte import CorteService
from fastapi import FastAPI
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_LIMITE_SEG = 5
_URL_DA_ROTA = "/api/cortes/c1/cenas-remotion/retratos"
_MUDARAM = "As cenas mudaram durante a busca"
_FICHA = {"tipo": "ficha_biografica", "texto": "Nietzsche", "inicio": 25.0, "fim": 28.0}
_LIDAS = {"formato": "cortes", "cenas": [_FICHA], "retratos": {"total_fichas": 1}}
_DESVIO = {"inicio_seg": 110.0, "fim_seg": 120.0, "inicio_hms": "00:01:50", "fim_hms": "00:02:00"}


def _transcricao_da_live() -> list[dict]:
    segmentos = []
    for i in range(0, 60, 4):
        palavras = [f"palavra{n}" for n in range(i, i + 4)]
        segmentos.append(
            {
                "start": 100.0 + i,
                "end": 104.0 + i,
                "texto": " ".join(palavras),
                "palavras": [
                    {"texto": p, "inicio_seg": 100.0 + i + j, "fim_seg": 101.0 + i + j}
                    for j, p in enumerate(palavras)
                ],
            }
        )
    return segmentos


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
    for modulo in (corte_module, cenas_module, origem_das_cenas):
        monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(
            Projeto(id="p1", youtube_url="u", transcricao_raw=json.dumps(_transcricao_da_live()))
        )
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=100.0,
                fim_seg=160.0,
                status="aprovado",
                titulo_proposto="Corte",
            )
        )
        await db.commit()
    await CorteService.sincronizar_transcricao_corte("c1")
    await _gravar(f, cenas_remotion=json.dumps(_LIDAS))
    yield f
    await engine.dispose()


@pytest_asyncio.fixture
async def cliente(fabrica):
    async def banco():
        async with fabrica() as db:
            yield db

    app = FastAPI()
    registrar_tratadores(app)
    app.include_router(cortes.router, prefix="/api/cortes")
    app.dependency_overrides[get_db] = banco
    transporte = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transporte, base_url="http://teste") as http:
        yield http


class WikipediaPresa:
    """A rede da busca: só responde quando o teste soltar."""

    def __init__(self):
        self.comecou = asyncio.Event()
        self.solta = asyncio.Event()
        self.achou = True
        self.nomes: list[str] = []

    async def buscar(self, nome: str, forcar_redownload: bool = False):
        self.nomes.append(nome)
        self.comecou.set()
        await self.solta.wait()
        if not self.achou:
            return None
        return SimpleNamespace(url_publica="/api/retratos/nietzsche")


@pytest.fixture
def wikipedia(monkeypatch):
    presa = WikipediaPresa()
    monkeypatch.setattr(retrato_wikipedia, "buscar_wikipedia", presa.buscar)
    yield presa
    presa.solta.set()


async def _gravar(fabrica, **campos) -> None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        for campo, valor in campos.items():
            setattr(corte, campo, valor)
        await db.commit()


async def _cenas_gravadas(fabrica) -> str | None:
    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
        return corte.cenas_remotion


async def _no_limite(aguardavel):
    return await asyncio.wait_for(aguardavel, _LIMITE_SEG)


async def _busca_presa(cliente, wikipedia, url: str = _URL_DA_ROTA) -> asyncio.Task:
    busca = asyncio.create_task(cliente.post(url))
    await _no_limite(wikipedia.comecou.wait())
    return busca


async def _terminar(wikipedia, busca: asyncio.Task) -> httpx.Response:
    wikipedia.solta.set()
    return await _no_limite(busca)


# ── A mudança que entra durante a busca, pelo caminho de cada uma ─────────────


async def _uma_geracao_termina(cliente, _fabrica) -> None:
    # Importar é o escritor da geração: é por ele que a fila do Claude e a colagem manual gravam.
    resposta = await cliente.post(
        "/api/cortes/c1/cenas-remotion/importar",
        json={"cenas": [{"tipo": "enfase", "texto": "Gerada", "startLeg": 1, "duracao_s": 3}]},
    )
    assert resposta.status_code == 200, resposta.text


async def _o_operador_salva(cliente, _fabrica) -> None:
    editada = {**_FICHA, "texto": "Nietzsche, o filósofo"}
    resposta = await cliente.patch(
        "/api/cortes/c1",
        json={"cenas_remotion": {"formato": "cortes", "cenas": [editada]}},
    )
    assert resposta.status_code == 200, resposta.text


async def _a_sincronia_leva_as_cenas(_cliente, fabrica) -> None:
    await _gravar(fabrica, desvios=json.dumps([_DESVIO]))
    await CorteService.sincronizar_transcricao_corte("c1")


_MUDANCAS = [_uma_geracao_termina, _o_operador_salva, _a_sincronia_leva_as_cenas]


@pytest.mark.asyncio
@pytest.mark.parametrize("mudanca", _MUDANCAS, ids=["geracao", "edicao", "sincronia"])
async def test_a_mudanca_durante_a_busca_fica_e_o_operador_sabe(
    cliente, wikipedia, fabrica, mudanca
):
    busca = await _busca_presa(cliente, wikipedia)

    await mudanca(cliente, fabrica)
    depois_da_mudanca = await _cenas_gravadas(fabrica)
    assert depois_da_mudanca != json.dumps(_LIDAS), "o cenário não mudou as cenas"

    resposta = await _terminar(wikipedia, busca)

    assert await _cenas_gravadas(fabrica) == depois_da_mudanca, "a busca gravou por cima"
    assert resposta.status_code == 400, resposta.text
    assert _MUDARAM in resposta.json()["detail"]


@pytest.mark.asyncio
async def test_a_sincronia_do_cenario_moveu_mesmo_a_cena(cliente, wikipedia, fabrica):
    # Guarda do parâmetro "sincronia": sem mover a cena, ele não provaria nada.
    await _a_sincronia_leva_as_cenas(cliente, fabrica)

    cena = json.loads(await _cenas_gravadas(fabrica))["cenas"][0]

    assert cena["inicio"] != _FICHA["inicio"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "lidas",
    [_LIDAS, [_FICHA]],
    ids=["roteiro_com_formato", "lista_solta"],
)
async def test_sem_concorrencia_a_busca_grava_o_retrato(cliente, wikipedia, fabrica, lidas):
    await _gravar(fabrica, cenas_remotion=json.dumps(lidas))
    wikipedia.solta.set()

    resposta = await _no_limite(cliente.post(_URL_DA_ROTA))

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["retratos"]["atualizados"] == 1
    gravadas = json.loads(await _cenas_gravadas(fabrica))
    cenas = gravadas if isinstance(lidas, list) else gravadas["cenas"]
    assert cenas[0]["retrato_url"].endswith("/api/retratos/nietzsche")
    if isinstance(lidas, dict):
        assert gravadas["retratos"] == _LIDAS["retratos"], "o resto do roteiro se perdeu"
    assert wikipedia.nomes == ["Nietzsche"]


@pytest.mark.asyncio
async def test_a_busca_que_nao_achou_nada_nao_recusa_nem_toca_na_mudanca(
    cliente, wikipedia, fabrica
):
    # Sem retrato novo não há o que descartar: recusar seria alarme falso.
    wikipedia.achou = False
    busca = await _busca_presa(cliente, wikipedia)
    await _uma_geracao_termina(cliente, fabrica)
    depois_da_mudanca = await _cenas_gravadas(fabrica)

    resposta = await _terminar(wikipedia, busca)

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["retratos"]["atualizados"] == 0
    assert await _cenas_gravadas(fabrica) == depois_da_mudanca


@pytest.mark.asyncio
async def test_a_busca_de_novo_depois_da_recusa_grava_nas_cenas_atuais(cliente, wikipedia, fabrica):
    busca = await _busca_presa(cliente, wikipedia)
    await _o_operador_salva(cliente, fabrica)
    recusa = await _terminar(wikipedia, busca)
    assert recusa.status_code == 400, recusa.text

    resposta = await _no_limite(cliente.post(_URL_DA_ROTA))

    assert resposta.status_code == 200, resposta.text
    cena = json.loads(await _cenas_gravadas(fabrica))["cenas"][0]
    assert cena["texto"] == "Nietzsche, o filósofo"
    assert cena["retrato_url"].endswith("/api/retratos/nietzsche")


@pytest.mark.asyncio
async def test_o_corte_apagado_durante_a_busca_responde_que_nao_existe(cliente, wikipedia, fabrica):
    busca = await _busca_presa(cliente, wikipedia)
    async with fabrica() as db:
        await db.execute(delete(Corte).where(Corte.id == "c1"))
        await db.commit()

    resposta = await _terminar(wikipedia, busca)

    assert resposta.status_code == 404, resposta.text
    assert _MUDARAM not in resposta.json()["detail"]


@pytest.mark.asyncio
async def test_o_corte_que_nao_existe_responde_que_nao_existe(cliente, wikipedia):
    resposta = await _no_limite(cliente.post("/api/cortes/nenhum/cenas-remotion/retratos"))

    assert resposta.status_code == 404, resposta.text
    assert wikipedia.nomes == []
