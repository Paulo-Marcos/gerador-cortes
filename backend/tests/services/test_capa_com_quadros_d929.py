"""D-929: as três capas do modo apresentador anexam quadros da live no lugar do banco de fotos.

O navegador fica de fora (como na D-804): `_gerar_no_navegador` é trocado por
um registro do pedido e dos anexos. A extração dos quadros, por um falso que
devolve arquivos prontos ou nada.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.core import channel_paths
from app.services import capa_no_chatgpt, jobs_globais, pedidos_capa_chatgpt, quadros_da_capa
from app.services.canal import capa_do_canal

PROJETO = "https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"resto-da-imagem"
PROMPT = (
    '[APRESENTADOR="grade"]\n'
    "The host shown in the attached reference photos; ignore the facial expressions shown in them.\n"
    "EXPRESSION (host): smirk with a raised eyebrow."
)


@pytest.fixture
def canal(monkeypatch, tmp_path):
    raiz = tmp_path / "channels" / "meucanal"
    monkeypatch.setattr(channel_paths, "active_channel_root", lambda: raiz)
    monkeypatch.setattr(channel_paths, "settings_db_path", lambda: tmp_path / "settings.db")
    monkeypatch.setattr(
        channel_paths, "fichas_do_chatgpt_dir", lambda: raiz / "capa_chatgpt" / "fichas"
    )
    monkeypatch.setattr(
        channel_paths, "fotos_do_apresentador_dir", lambda: raiz / "assets" / "apresentador"
    )
    monkeypatch.setattr(
        capa_do_canal, "identidade_do_mascote", lambda: SimpleNamespace(nome="Sapo")
    )
    monkeypatch.setattr(
        capa_no_chatgpt, "identidade_do_mascote", lambda: SimpleNamespace(nome="Sapo")
    )
    capa_no_chatgpt.gravar_projeto(PROJETO)
    capa_do_canal.salvar_foto("grade.png", PNG)
    capa_no_chatgpt.salvar_ficha("poses.png", PNG)
    return raiz


@pytest.fixture
def robo(monkeypatch):
    chamadas: list[tuple[str, list[Path]]] = []

    def gerar(_projeto, pedido, anexos, _anunciar):
        chamadas.append((pedido, anexos))
        return PNG

    monkeypatch.setattr(capa_no_chatgpt, "_gerar_no_navegador", gerar)
    return chamadas


@pytest.fixture
def quadros(tmp_path):
    pasta = tmp_path / "quadros"
    pasta.mkdir()
    arquivos = [pasta / f"quadro-da-live-{i}.jpg" for i in (1, 2, 3)]
    for arquivo in arquivos:
        arquivo.write_bytes(b"jpg")
    return arquivos


class TestRoboComQuadros:
    def test_quadros_vao_no_lugar_das_fotos_do_banco(self, canal, robo, quadros):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)

        asyncio.run(
            capa_no_chatgpt.gerar_imagem_com_quadros(PROMPT, "16:9", [], lambda _e: None, quadros)
        )

        pedido, anexos = robo[0]
        assert anexos == quadros
        assert "quadros da live no exato momento em que ele diz a frase da capa" in pedido
        assert "smirk" not in pedido
        assert "ignore the facial expressions" not in pedido

    def test_sem_quadros_volta_ao_banco_de_fotos(self, canal, robo):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)

        asyncio.run(
            capa_no_chatgpt.gerar_imagem_com_quadros(PROMPT, "16:9", [], lambda _e: None, [])
        )

        pedido, anexos = robo[0]
        assert [a.name for a in anexos] == ["grade.png"]
        assert "quadros da live" not in pedido
        assert "smirk" in pedido

    def test_no_modo_mascote_os_quadros_nao_entram(self, canal, robo, quadros):
        asyncio.run(
            capa_no_chatgpt.gerar_imagem_com_quadros(PROMPT, "16:9", [], lambda _e: None, quadros)
        )

        assert [a.name for a in robo[0][1]] == ["poses.png"]


@pytest.fixture
def fila(monkeypatch):
    """A fila sem entrega nem banco: registra o que o robô recebeu."""
    pedidos_capa_chatgpt.resetar()
    jobs_globais.JobsGlobais.resetar()
    recebido: list[tuple] = []

    async def gerar(prompt, proporcao, pessoas=None, anunciar=lambda _e: None):
        recebido.append(("banco", proporcao, None))
        return PNG, "image/png"

    async def gerar_com_quadros(prompt, proporcao, pessoas, anunciar, quadros):
        recebido.append(("quadros", proporcao, [q.name for q in quadros]))
        return PNG, "image/png"

    async def corte_do_alvo(destino, alvo_id):
        return alvo_id

    async def entregar(_pedido, _imagem, _nome):
        return None

    monkeypatch.setattr(capa_no_chatgpt, "gerar_imagem", gerar)
    monkeypatch.setattr(capa_no_chatgpt, "gerar_imagem_com_quadros", gerar_com_quadros)
    monkeypatch.setattr(pedidos_capa_chatgpt, "_corte_do_alvo", corte_do_alvo)
    monkeypatch.setattr(pedidos_capa_chatgpt, "_entregar", entregar)
    yield recebido
    pedidos_capa_chatgpt.resetar()


def _desenhar(destino: str, alvo_id: str) -> pedidos_capa_chatgpt.PedidoDeCapa:
    async def cenario():
        pedido = await pedidos_capa_chatgpt.enfileirar(destino, alvo_id, PROMPT)
        for _ in range(200):
            if not pedido.ativo:
                return pedido
            await asyncio.sleep(0)
        raise AssertionError("o pedido não terminou")

    return asyncio.run(cenario())


class TestFilaComQuadros:
    @pytest.mark.parametrize(
        ("destino", "proporcao"), [("youtube", "16:9"), ("tiktok", "4:5"), ("short", "9:16")]
    )
    def test_as_tres_capas_do_apresentador_tiram_quadros_do_proprio_corte(
        self, canal, fila, monkeypatch, destino, proporcao
    ):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)
        pedidos: list[tuple] = []

        async def extrair(destino_pedido, alvo_id, pasta):
            pedidos.append((destino_pedido, alvo_id))
            arquivo = pasta / "quadro-da-live-1.jpg"
            arquivo.write_bytes(b"jpg")
            return [arquivo]

        monkeypatch.setattr(quadros_da_capa, "quadros_do_apresentador", extrair)

        pedido = _desenhar(destino, "alvo-1")

        assert pedidos == [(destino, "alvo-1")]
        assert fila == [("quadros", proporcao, ["quadro-da-live-1.jpg"])]
        assert pedido.estado == "concluido"

    def test_sem_quadros_a_capa_sai_com_o_banco_de_fotos(self, canal, fila, monkeypatch):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)

        async def nada(*_a):
            return []

        monkeypatch.setattr(quadros_da_capa, "quadros_do_apresentador", nada)

        _desenhar("youtube", "alvo-1")

        assert fila == [("banco", "16:9", None)]

    def test_modo_mascote_nem_procura_quadros(self, canal, fila, monkeypatch):
        async def nao_devia(*_a):
            raise AssertionError("o mascote não tira quadros")

        monkeypatch.setattr(quadros_da_capa, "quadros_do_apresentador", nao_devia)

        _desenhar("youtube", "alvo-1")

        assert fila == [("banco", "16:9", None)]

    def test_a_fila_mostra_o_passo_dos_quadros(self, canal, fila, monkeypatch):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)
        etapas: list[str] = []

        async def extrair(_destino, _alvo, _pasta):
            pedido = pedidos_capa_chatgpt.pedido_da_capa("youtube", "alvo-1")
            etapas.append(pedido.etapa)
            return []

        monkeypatch.setattr(quadros_da_capa, "quadros_do_apresentador", extrair)

        _desenhar("youtube", "alvo-1")

        assert etapas == [pedidos_capa_chatgpt.ETAPA_QUADROS]
