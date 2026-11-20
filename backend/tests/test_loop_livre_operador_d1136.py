"""As rotas do operador não podem travar o event loop (D-1136, E-069).

Pedido → teste:
- handlers viram `def` e o loop segue livre → test_rota_presa_no_store_nao_trava_outra_requisicao
- o teste enxerga o travamento (controle com `async def`) → test_controle_async_def_trava_o_loop
- `_connect` vira verbo em português → test_o_store_nao_expoe_connect_em_ingles
- o teste da D-1129 sobre "não é do canal" não provava nada → test_a_tabela_do_operador_existe_e_so_tem_id_e_nome

A prova não usa relógio para decidir: o store simulado fica preso num
`threading.Event` que só o TESTE solta, depois de outra requisição responder.
Se o handler rodasse no loop, o store seguraria o loop inteiro e ninguém
soltaria o evento: ele estoura o prazo e o veredito vem `False`.
"""

from __future__ import annotations

import asyncio
import sqlite3
import threading

import httpx
import pytest
from app.core import channel_paths
from app.infrastructure import operador_store
from app.main import app
from fastapi import FastAPI

PRAZO_DA_ROTA_REAL_S = 15.0  # folga para máquina carregada
PRAZO_DO_CONTROLE_S = 1.0  # o controle só precisa estourar


class _StoreLento:
    """Entra, avisa, e fica preso até o teste soltar (ou o prazo vencer)."""

    def __init__(self, prazo_s: float) -> None:
        self.prazo_s = prazo_s
        self.entrou = threading.Event()
        self.solto = threading.Event()
        self.foi_liberado_pelo_teste: bool | None = None

    def ler_nome(self, *_args) -> str:
        self.entrou.set()
        self.foi_liberado_pelo_teste = self.solto.wait(timeout=self.prazo_s)
        return ""


async def _esperar(evento: threading.Event, limite_s: float) -> None:
    """Espera sem bloquear o loop (e sem depender de `to_thread` suspender)."""
    fim = asyncio.get_running_loop().time() + limite_s
    while not evento.is_set():
        assert asyncio.get_running_loop().time() < fim, "o evento nunca chegou"
        await asyncio.sleep(0.005)


async def _outra_requisicao_responde_com_a_rota_presa(
    aplicacao: FastAPI, rota_presa: str, rota_livre: str, store: _StoreLento
) -> bool:
    """True se a rota livre respondeu ENQUANTO a presa seguia dentro do store."""
    transporte = httpx.ASGITransport(app=aplicacao)
    async with httpx.AsyncClient(transport=transporte, base_url="http://localhost") as http:
        presa = asyncio.create_task(http.get(rota_presa))
        await _esperar(store.entrou, store.prazo_s)
        # Com `async def` o loop já está preso aqui dentro: isto só roda
        # depois que o store estourou o prazo, e `solto` nunca foi setado.
        livre = await http.get(rota_livre)
        assert livre.status_code == 200
        store.solto.set()
        await presa
    return store.foi_liberado_pelo_teste is True


@pytest.fixture
def banco(tmp_path, monkeypatch):
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")


@pytest.mark.asyncio
@pytest.mark.usefixtures("banco")
async def test_rota_presa_no_store_nao_trava_outra_requisicao(monkeypatch):
    store = _StoreLento(PRAZO_DA_ROTA_REAL_S)
    monkeypatch.setattr(operador_store, "ler_nome", store.ler_nome)

    liberou = await _outra_requisicao_responde_com_a_rota_presa(
        app, "/api/operador", "/api/health", store
    )

    assert liberou, "GET /api/operador segurou o event loop enquanto o store esperava"


@pytest.mark.asyncio
@pytest.mark.usefixtures("banco")
async def test_put_preso_no_store_tambem_nao_trava_o_loop(monkeypatch):
    store = _StoreLento(PRAZO_DA_ROTA_REAL_S)

    def gravar_lento(*_args) -> None:
        store.ler_nome()

    monkeypatch.setattr(operador_store, "gravar_nome", gravar_lento)
    transporte = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transporte, base_url="http://localhost") as http:
        presa = asyncio.create_task(http.put("/api/operador", json={"nome": "Ana"}))
        await _esperar(store.entrou, PRAZO_DA_ROTA_REAL_S)
        assert (await http.get("/api/health")).status_code == 200
        store.solto.set()
        await presa

    assert store.foi_liberado_pelo_teste is True, "PUT /api/operador segurou o event loop"


@pytest.mark.asyncio
async def test_controle_async_def_trava_o_loop():
    """Sem este controle, um teste que sempre passa seria indistinguível de um bom."""
    store = _StoreLento(PRAZO_DO_CONTROLE_S)
    de_controle = FastAPI()

    @de_controle.get("/presa")
    async def presa():  # `async def` + I/O síncrono: o defeito original
        return {"nome": store.ler_nome()}

    @de_controle.get("/livre")
    async def livre():
        return {}

    liberou = await _outra_requisicao_responde_com_a_rota_presa(
        de_controle, "/presa", "/livre", store
    )

    assert liberou is False, "o harness não enxergou o loop preso: o teste real não vale nada"


def test_o_store_nao_expoe_connect_em_ingles():
    publicos = {n for n in dir(operador_store) if "connect" in n.lower()}
    assert publicos == set(), f"verbo em inglês de volta no store: {publicos}"
    assert callable(operador_store.abrir_banco)


def test_a_tabela_do_operador_existe_e_so_tem_id_e_nome(tmp_path):
    """O assert da D-1129 (`channel_id not in colunas`) passava com tabela inexistente."""
    db = tmp_path / "settings.db"
    operador_store.gravar_nome(db, "Paulo")

    conn = sqlite3.connect(db)
    try:
        colunas = [c[1] for c in conn.execute("PRAGMA table_info(operador)")]
    finally:
        conn.close()

    assert colunas == ["id", "nome"]
