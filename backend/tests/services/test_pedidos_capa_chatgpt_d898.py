"""D-898: a capa do ChatGPT vira item da fila — um por vez, com passo, erro e entrega.

O robô de verdade (navegador) fica de fora: `gerar_imagem` é trocado por um
falso que anuncia passos e devolve uma imagem, ou para com a frase do robô.
"""

from __future__ import annotations

import asyncio

import pytest
from app.domain.compartilhado.erros import PedidoInvalido, ServicoExternoFalhou
from app.services import (
    capa_no_chatgpt,
    capa_short,
    capa_tiktok,
    jobs_globais,
    pedidos_capa_chatgpt,
)
from app.services.thumbnail import ThumbnailService

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
PROJETO = "https://chatgpt.com/g/g-p-" + "a" * 32 + "/project"


@pytest.fixture(autouse=True)
def fila_limpa():
    pedidos_capa_chatgpt.resetar()
    jobs_globais.JobsGlobais.resetar()
    yield
    pedidos_capa_chatgpt.resetar()


@pytest.fixture
def entregas(monkeypatch):
    """O que chegou em cada capa, pelo caminho do Ctrl+V de cada uma."""
    chegou: list[tuple] = []

    async def thumbnail(corte_id, conteudo, nome):
        chegou.append(("youtube", corte_id, conteudo, nome))
        return "thumb.png"

    async def arte_tiktok(corte_id, conteudo, nome):
        chegou.append(("tiktok-arte", corte_id, conteudo, nome))

    async def montar_tiktok(corte_id, **_kw):
        chegou.append(("tiktok-montada", corte_id))

    async def arte_short(short_id, conteudo, nome):
        chegou.append(("short", short_id, conteudo, nome))
        return {}

    async def corte_do_short(destino, alvo_id):
        return "corte-do-short" if destino == "short" else alvo_id

    monkeypatch.setattr(ThumbnailService, "upload_manual", staticmethod(thumbnail))
    monkeypatch.setattr(capa_tiktok, "salvar_arte", arte_tiktok)
    monkeypatch.setattr(capa_tiktok, "gerar", montar_tiktok)
    monkeypatch.setattr(capa_short, "subir_arte", arte_short)
    monkeypatch.setattr(pedidos_capa_chatgpt, "_corte_do_alvo", corte_do_short)
    monkeypatch.setattr(capa_no_chatgpt, "ler_configuracao", lambda: {"projeto_url": PROJETO})
    return chegou


class RoboFalso:
    """Anuncia dois passos e devolve a imagem — ou para, se mandarem."""

    def __init__(self, monkeypatch, *, falha: Exception | None = None) -> None:
        self.falha = falha
        self.pedidos: list[tuple[str, str, list | None]] = []
        self.liberar: asyncio.Event | None = None
        monkeypatch.setattr(capa_no_chatgpt, "gerar_imagem", self.gerar)

    async def gerar(self, prompt, proporcao, pessoas=None, anunciar=lambda _e: None):
        self.pedidos.append((prompt, proporcao, pessoas))
        anunciar("Abrindo o projeto no ChatGPT")
        if self.liberar is not None:
            await self.liberar.wait()
        anunciar("Esperando o ChatGPT desenhar")
        if self.falha:
            raise self.falha
        return PNG, "image/png"


async def _ate_terminar(*pedidos) -> None:
    for _ in range(200):
        if not any(p.ativo for p in pedidos):
            return
        await asyncio.sleep(0)
    raise AssertionError("o pedido não terminou")


def _rodar(corotina):
    return asyncio.run(corotina)


class TestEntrega:
    @pytest.mark.parametrize(
        ("destino", "proporcao", "esperado"),
        [
            ("youtube", "16:9", [("youtube", "c1", PNG, "chatgpt.png")]),
            (
                "tiktok",
                "4:5",
                [("tiktok-arte", "c1", PNG, "chatgpt.png"), ("tiktok-montada", "c1")],
            ),
            ("short", "9:16", [("short", "c1", PNG, "chatgpt.png")]),
        ],
    )
    def test_cada_capa_recebe_no_proprio_quadro_pelo_caminho_do_ctrl_v(
        self, monkeypatch, entregas, destino, proporcao, esperado
    ):
        robo = RoboFalso(monkeypatch)

        async def cenario():
            pedido = await pedidos_capa_chatgpt.enfileirar(destino, "c1", "o prompt", ["Neymar"])
            await _ate_terminar(pedido)
            return pedido

        pedido = _rodar(cenario())

        assert robo.pedidos == [("o prompt", proporcao, ["Neymar"])]
        assert entregas == esperado
        assert (pedido.estado, pedido.etapa, pedido.erro) == ("concluido", "Capa pronta", "")

    def test_capa_do_short_e_agrupada_pelo_corte_dele(self, monkeypatch, entregas):
        RoboFalso(monkeypatch)

        async def cenario():
            pedido = await pedidos_capa_chatgpt.enfileirar("short", "s1", "o prompt")
            await _ate_terminar(pedido)
            return pedido

        assert _rodar(cenario()).corte_id == "corte-do-short"


class TestErro:
    def test_parada_do_robo_fica_no_pedido_com_o_passo_em_que_parou(self, monkeypatch, entregas):
        # O defeito da D-896: o motivo morria com o modal. Agora ele mora no pedido.
        RoboFalso(monkeypatch, falha=ServicoExternoFalhou("O ChatGPT respondeu sem imagem."))

        async def cenario():
            pedido = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "o prompt")
            await _ate_terminar(pedido)
            return pedido

        pedido = _rodar(cenario())

        assert pedido.estado == "erro"
        assert pedido.erro == "O ChatGPT respondeu sem imagem."
        assert pedido.etapa == "Esperando o ChatGPT desenhar"
        assert entregas == []

    def test_excecao_sem_frase_ainda_diz_algo_ao_operador(self, monkeypatch, entregas):
        RoboFalso(monkeypatch, falha=KeyError("x"))

        async def cenario():
            pedido = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "o prompt")
            await _ate_terminar(pedido)
            return pedido

        assert "KeyError" in _rodar(cenario()).erro

    def test_sem_prompt_volta_na_hora(self, entregas):
        with pytest.raises(PedidoInvalido, match="prompt"):
            _rodar(pedidos_capa_chatgpt.enfileirar("youtube", "c1", "  "))
        assert pedidos_capa_chatgpt.listar() == []

    def test_sem_projeto_configurado_volta_na_hora(self, monkeypatch, entregas):
        monkeypatch.setattr(capa_no_chatgpt, "ler_configuracao", lambda: {"projeto_url": ""})

        with pytest.raises(PedidoInvalido, match="Canais"):
            _rodar(pedidos_capa_chatgpt.enfileirar("youtube", "c1", "o prompt"))


class TestFila:
    def test_um_por_vez_o_segundo_espera_na_fila(self, monkeypatch, entregas):
        robo = RoboFalso(monkeypatch)

        async def cenario():
            robo.liberar = asyncio.Event()
            primeiro = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            segundo = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "p2")
            for _ in range(20):
                await asyncio.sleep(0)
            durante = (primeiro.estado, segundo.estado, segundo.etapa, len(robo.pedidos))
            robo.liberar.set()
            await _ate_terminar(primeiro, segundo)
            return durante, primeiro, segundo

        durante, primeiro, segundo = _rodar(cenario())

        assert durante == ("rodando", "aguardando", "Na fila do ChatGPT", 1)
        assert (primeiro.estado, segundo.estado) == ("concluido", "concluido")

    def test_pedir_de_novo_a_mesma_capa_em_voo_nao_duplica(self, monkeypatch, entregas):
        robo = RoboFalso(monkeypatch)

        async def cenario():
            robo.liberar = asyncio.Event()
            primeiro = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            repetido = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            robo.liberar.set()
            await _ate_terminar(primeiro)
            return primeiro, repetido

        primeiro, repetido = _rodar(cenario())

        assert repetido is primeiro
        assert len(robo.pedidos) == 1

    def test_pedir_de_novo_depois_do_erro_tenta_outra_vez(self, monkeypatch, entregas):
        robo = RoboFalso(monkeypatch, falha=ServicoExternoFalhou("limite"))

        async def cenario():
            primeiro = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            await _ate_terminar(primeiro)
            robo.falha = None
            segundo = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            await _ate_terminar(segundo)
            return segundo

        assert _rodar(cenario()).estado == "concluido"
        # Só o último de cada capa fica: o anterior não diz mais nada sobre ela.
        assert len(pedidos_capa_chatgpt.listar()) == 1


class TestFilaGlobal:
    def test_a_fila_global_mostra_qual_capa_e_em_que_passo(self, monkeypatch, entregas):
        robo = RoboFalso(monkeypatch)

        async def cenario():
            robo.liberar = asyncio.Event()
            youtube = await pedidos_capa_chatgpt.enfileirar("youtube", "c1", "p1")
            tiktok = await pedidos_capa_chatgpt.enfileirar("tiktok", "c1", "p2")
            for _ in range(20):
                await asyncio.sleep(0)
            jobs = jobs_globais.JobsGlobais.coletar()
            robo.liberar.set()
            await _ate_terminar(youtube, tiktok)
            return jobs

        jobs = sorted(_rodar(cenario()), key=lambda j: j.tipo, reverse=True)

        assert [(j.rotulo_tipo, j.estado, j.etapa, j.corte_id, j.familia) for j in jobs] == [
            ("capa YouTube no ChatGPT", "rodando", "Abrindo o projeto no ChatGPT", "c1", "ia"),
            ("arte TikTok no ChatGPT", "aguardando", "Na fila do ChatGPT", "c1", "ia"),
        ]


class TestRotas:
    @pytest.fixture
    def cliente(self, monkeypatch, entregas):
        from app.routers import capa_no_chatgpt as rotas
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        RoboFalso(monkeypatch)
        app = FastAPI()
        app.include_router(rotas.router, prefix="/api/capa-chatgpt")
        with TestClient(app) as cliente:
            yield cliente

    def test_pedido_responde_na_hora_e_a_capa_conta_onde_ele_esta(self, cliente):
        resposta = cliente.post(
            "/api/capa-chatgpt/pedidos",
            json={"destino": "tiktok", "alvo_id": "c1", "prompt": "o prompt"},
        )

        assert resposta.status_code == 202
        assert resposta.json()["destino"] == "tiktok"
        lido = cliente.get("/api/capa-chatgpt/pedidos/tiktok/c1").json()["pedido"]
        assert lido["id"] == resposta.json()["id"]
        assert lido["estado"] in {"aguardando", "rodando", "concluido"}

    def test_capa_nunca_pedida_responde_sem_pedido(self, cliente):
        assert cliente.get("/api/capa-chatgpt/pedidos/youtube/c9").json() == {"pedido": None}
