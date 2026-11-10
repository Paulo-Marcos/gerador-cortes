"""D-1100: o motivo de a capa não ter voltado sobrevive ao reinício do backend.

Medido na PROD em 09/11/2026: três capas verticais do TikTok sem imagem, e a RN-26
segurando a publicação automática. O ChatGPT tinha recusado uma delas, gerado
outra sem que o robô a salvasse, e a terceira nem abriu conversa. Mas o motivo
morava só no dicionário `_pedidos` da fila, e o backend tinha reiniciado às
19:55: `GET /api/capa-chatgpt/pedidos/tiktok/<id>` devolvia `{"pedido": null}`,
e o card não dizia nada.

Aqui a memória da fila é esvaziada (`resetar`, o mesmo que um reinício faz com
ela) e o banco do canal fica. O robô de verdade continua de fora.
"""

from __future__ import annotations

import asyncio

import pytest
from app.domain.compartilhado.erros import ServicoExternoFalhou
from app.models import Base
from app.routers import capa_no_chatgpt as rota
from app.services import capa_no_chatgpt, capa_tiktok, jobs_globais, pedidos_capa_chatgpt
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
PROJETO = "https://chatgpt.com/g/g-p-" + "a" * 32 + "/project"
RECUSA = (
    "O ChatGPT respondeu sem imagem — recusa ou limite do plano. A resposta está na janela do robô."
)


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
    """Para com a frase do robô, devolve a imagem ou fica desenhando até mandarem."""

    def __init__(self, monkeypatch) -> None:
        self.falha: Exception | None = None
        self.segurar = False
        monkeypatch.setattr(capa_no_chatgpt, "gerar_imagem", self.gerar)

    async def gerar(self, _prompt, _proporcao, _pessoas=None, anunciar=lambda _e: None):
        anunciar("Esperando o ChatGPT desenhar")
        if self.segurar:
            await asyncio.Event().wait()
        if self.falha:
            raise self.falha
        return PNG, "image/png"


def _no_banco_do_canal(monkeypatch, cenario):
    """Roda o cenário com um `projetos.db` de verdade, só deste teste."""

    async def rodar():
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        monkeypatch.setattr(
            pedidos_capa_chatgpt,
            "AsyncSessionLocal",
            async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False),
        )
        try:
            return await cenario()
        finally:
            await engine.dispose()

    return asyncio.run(rodar())


async def _ate(condicao, falha: str) -> None:
    for _ in range(400):
        if condicao():
            # O rastro vai para o banco por trás: espera o banco alcançar a fila.
            await pedidos_capa_chatgpt.gravacoes_em_dia()
            return
        await asyncio.sleep(0)
    raise AssertionError(falha)


async def _ate_terminar(pedido) -> None:
    await _ate(lambda: not pedido.ativo, "o pedido não terminou")


async def _ate_rodar(pedido) -> None:
    await _ate(lambda: pedido.estado == "rodando", "o pedido não começou")


def _reiniciar_o_backend() -> None:
    # O que um reinício faz com a fila: a memória some, o banco fica.
    pedidos_capa_chatgpt.resetar()


def test_a_recusa_do_chatgpt_continua_na_tela_depois_do_reinicio(monkeypatch):
    robo = Robo(monkeypatch)
    robo.falha = ServicoExternoFalhou(RECUSA)

    async def cenario():
        pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "81161dfd", "a arte 4:5")
        await _ate_terminar(pedido)
        _reiniciar_o_backend()
        return await rota.pedido_da_capa("tiktok", "81161dfd")

    lido = _no_banco_do_canal(monkeypatch, cenario)["pedido"]

    assert lido is not None, "o motivo da parada sumiu com a memória da fila"
    assert (lido["estado"], lido["etapa"], lido["erro"]) == (
        "erro",
        "Esperando o ChatGPT desenhar",
        RECUSA,
    )
    assert (lido["destino"], lido["alvo_id"], lido["corte_id"]) == (
        "tiktok",
        "81161dfd",
        "81161dfd",
    )


def test_capa_que_ficou_pronta_depois_de_um_erro_nao_mostra_o_erro_antigo(monkeypatch):
    robo = Robo(monkeypatch)

    async def cenario():
        robo.falha = ServicoExternoFalhou(RECUSA)
        primeiro = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
        await _ate_terminar(primeiro)
        robo.falha = None
        segundo = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
        await _ate_terminar(segundo)
        _reiniciar_o_backend()
        return await rota.pedido_da_capa("tiktok", "c1")

    lido = _no_banco_do_canal(monkeypatch, cenario)["pedido"]

    assert (lido["estado"], lido["etapa"], lido["erro"]) == ("concluido", "Capa pronta", "")


def test_pedido_que_o_reinicio_interrompeu_vira_erro_explicado(monkeypatch):
    # O 9bb01b19: o prompt foi gravado, e nenhuma conversa abriu. Se o processo
    # cai com a capa na fila ou desenhando, o card precisa dizer isso, e não
    # "Gerando no ChatGPT…" para sempre nem nada.
    robo = Robo(monkeypatch)
    robo.segurar = True

    async def cenario():
        pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "9bb01b19", "a arte 4:5")
        await _ate_rodar(pedido)
        _reiniciar_o_backend()
        return await rota.pedido_da_capa("tiktok", "9bb01b19")

    lido = _no_banco_do_canal(monkeypatch, cenario)["pedido"]

    assert lido["estado"] == "erro"
    assert "reiniciou" in lido["erro"]
    assert "peça de novo" in lido["erro"].lower()


def test_cada_capa_le_o_proprio_pedido(monkeypatch):
    robo = Robo(monkeypatch)
    robo.falha = ServicoExternoFalhou(RECUSA)

    async def cenario():
        pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
        await _ate_terminar(pedido)
        _reiniciar_o_backend()
        return (
            await rota.pedido_da_capa("youtube", "c1"),
            await rota.pedido_da_capa("tiktok", "c2"),
        )

    assert _no_banco_do_canal(monkeypatch, cenario) == ({"pedido": None}, {"pedido": None})


def test_pedido_vivo_na_memoria_vence_o_gravado(monkeypatch):
    # Sem reinício, quem responde é a fila: o banco só guarda o último passo gravado.
    robo = Robo(monkeypatch)
    robo.segurar = True

    async def cenario():
        pedido = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "a arte 4:5")
        await _ate_rodar(pedido)
        pedido.etapa = "Baixando a imagem"
        return await rota.pedido_da_capa("tiktok", "c1")

    lido = _no_banco_do_canal(monkeypatch, cenario)["pedido"]

    assert (lido["estado"], lido["etapa"]) == ("rodando", "Baixando a imagem")
