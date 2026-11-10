"""D-1103: o rastro da capa no banco (D-1100) sem vazar, sem atropelar e sem órfãos.

A auditoria do PR #357 achou três furos no rastro que a D-1100 grava por trás:

- o conjunto das gravações em voo só crescia: cada passo de cada pedido ficava
  lá para sempre, com a foto do pedido;
- a guarda "o pedido substituído não grava por cima do novo" não tinha teste:
  tirada, 33 testes passavam;
- uma gravação cortada pelo fim do loop deixava a thread do aiosqlite com
  trabalho na fila, e ela caía em "Event loop is closed" depois de o loop
  fechar (44 por rodada dos testes d898/d929, contra 0 antes da D-1100).

O robô de verdade continua de fora, e o banco do canal é um SQLite só do teste.
"""

from __future__ import annotations

import asyncio
import sqlite3
import threading

import pytest
from app.models import Base, UltimoPedidoDeCapa
from app.services import capa_no_chatgpt, capa_tiktok, jobs_globais, pedidos_capa_chatgpt
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
PROJETO = "https://chatgpt.com/g/g-p-" + "a" * 32 + "/project"


@pytest.fixture(autouse=True)
def fila_limpa(monkeypatch):
    pedidos_capa_chatgpt.resetar()
    jobs_globais.JobsGlobais.resetar()

    async def entregar(_corte_id, *_args, **_kw):
        return None

    async def corte_do_alvo(_destino, alvo_id):
        return alvo_id

    monkeypatch.setattr(capa_tiktok, "salvar_arte", entregar)
    monkeypatch.setattr(capa_tiktok, "gerar", entregar)
    monkeypatch.setattr(pedidos_capa_chatgpt, "_corte_do_alvo", corte_do_alvo)
    monkeypatch.setattr(capa_no_chatgpt, "ler_configuracao", lambda: {"projeto_url": PROJETO})
    yield
    pedidos_capa_chatgpt.resetar()


class Robo:
    """Desenha na hora, menos os prompts que o teste mandou segurar."""

    def __init__(self, monkeypatch, *segurados: str) -> None:
        self.segurados = {prompt: asyncio.Event() for prompt in segurados}
        self.chamados: list[str] = []
        monkeypatch.setattr(capa_no_chatgpt, "gerar_imagem", self.gerar)

    async def gerar(self, prompt, _proporcao, _pessoas=None, anunciar=lambda _e: None):
        self.chamados.append(prompt)
        anunciar("Esperando o ChatGPT desenhar")
        if prompt in self.segurados:
            await self.segurados[prompt].wait()
        return PNG, "image/png"

    def soltar(self, prompt: str) -> None:
        self.segurados[prompt].set()


def _banco_do_canal(monkeypatch, url: str, **kw) -> AsyncEngine:
    engine = create_async_engine(url, **kw)
    monkeypatch.setattr(
        pedidos_capa_chatgpt,
        "AsyncSessionLocal",
        async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False),
    )
    return engine


async def _criar_tabelas(engine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _ate(condicao, falha: str) -> None:
    for _ in range(400):
        if condicao():
            return
        await asyncio.sleep(0)
    raise AssertionError(falha)


def test_gravacao_que_terminou_sai_do_conjunto_sozinha(monkeypatch):
    # Na PROD ninguém chama `esperar_gravacoes`: só os testes. O conjunto tem de
    # se esvaziar sozinho, senão guarda cada passo de cada pedido até o reinício.
    Robo(monkeypatch)

    async def cenario():
        engine = _banco_do_canal(monkeypatch, "sqlite+aiosqlite:///:memory:")
        await _criar_tabelas(engine)
        try:
            pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
            await _ate(lambda: not pedido.ativo, "o pedido não terminou")
            await pedidos_capa_chatgpt.esperar_gravacoes()
            await asyncio.sleep(0)  # o callback de fim roda no passo seguinte do loop
            async with pedidos_capa_chatgpt.AsyncSessionLocal() as db:
                linha = await db.get(UltimoPedidoDeCapa, ("tiktok", "c1"))
            return linha.estado if linha else None, len(pedidos_capa_chatgpt._gravacoes)
        finally:
            await engine.dispose()

    gravado, no_conjunto = asyncio.run(cenario())

    assert gravado == "concluido", "o rastro não chegou ao banco"
    assert no_conjunto == 0, "as gravações que terminaram ficaram no conjunto"


def test_pedido_cancelado_na_fila_nao_grava_por_cima_do_pedido_novo(monkeypatch):
    # O A espera atrás do X, é cancelado, e o B da mesma capa entra. Quando chega
    # a vez do A, ele só passa ("cancelado"), mas a linha da capa já é do B. O Y
    # entra entre os dois e fica desenhando, para o B continuar na fila na hora
    # da leitura: é a janela em que o A gravaria por cima.
    robo = Robo(monkeypatch, "x", "y")

    async def cenario():
        engine = _banco_do_canal(monkeypatch, "sqlite+aiosqlite:///:memory:")
        await _criar_tabelas(engine)
        try:
            x = await pedidos_capa_chatgpt.enfileirar("tiktok", "outra", "x")
            await _ate(lambda: x.estado == "rodando", "o X não começou")
            a = await pedidos_capa_chatgpt.enfileirar("tiktok", "capa", "a")
            await pedidos_capa_chatgpt.enfileirar("tiktok", "mais-uma", "y")
            await asyncio.sleep(0)
            assert pedidos_capa_chatgpt.cancelar(a.id) == "aguardando"
            b = await pedidos_capa_chatgpt.enfileirar("tiktok", "capa", "b")
            assert b is not a
            robo.soltar("x")
            await _ate(lambda: robo.chamados[-1:] == ["y"], "o Y não começou")
            await pedidos_capa_chatgpt.esperar_gravacoes()
            pedidos_capa_chatgpt.resetar()  # o reinício: a memória some, o banco fica
            return b.id, await pedidos_capa_chatgpt.ler_pedido("tiktok", "capa")
        finally:
            await engine.dispose()

    id_do_b, lido = asyncio.run(cenario())

    assert lido is not None
    assert (lido.id, lido.estado) == (id_do_b, "erro"), "o pedido cancelado gravou por cima do novo"
    assert "reiniciou" in lido.erro


def test_gravacao_em_voo_termina_antes_de_o_loop_fechar(monkeypatch, tmp_path):
    # O cenário volta com o pedido desenhando e as gravações dele em voo, como os
    # testes d898/d929 e como o desligamento do backend. O fim do `asyncio.run`
    # cancela o que estiver pendente: cortada no `connect`, a gravação deixava a
    # thread do aiosqlite respondendo a um loop já fechado.
    caiu_na_thread: list[BaseException] = []
    monkeypatch.setattr(threading, "excepthook", lambda a: caiu_na_thread.append(a.exc_value))
    Robo(monkeypatch, "a arte 4:5")
    banco = tmp_path / "projetos.db"
    # NullPool: cada sessão fecha a conexão e a thread dela, e o teste pode
    # esperar todas terminarem depois que o loop fecha.
    url = f"sqlite+aiosqlite:///{banco.as_posix()}"

    async def cenario():
        engine = _banco_do_canal(monkeypatch, url, poolclass=NullPool)
        await _criar_tabelas(engine)
        pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
        await _ate(lambda: pedido.estado == "rodando", "o pedido não começou")

    asyncio.run(cenario())
    for thread in threading.enumerate():
        if "_connection_worker_thread" in thread.name:
            thread.join(timeout=5)

    assert caiu_na_thread == [], f"a thread do banco caiu depois do loop: {caiu_na_thread!r}"
    with sqlite3.connect(banco) as conn:
        linha = conn.execute(
            "SELECT estado FROM pedidos_capa_chatgpt WHERE destino = 'tiktok' AND alvo_id = 'c1'"
        ).fetchone()
    assert linha == ("rodando",), "o último passo pedido não chegou ao banco"
