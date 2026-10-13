"""D-909: o estilo das capas do canal — protagonista, fotos do apresentador e claridade.

O canal e o settings.db moram numa pasta do teste; o robô do ChatGPT é trocado
por um registro do que ele anexaria, como na D-804.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from app.core import channel_paths
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.routers import avaliacoes_thumbnail
from app.routers import capa_no_chatgpt as router_capa
from app.services import capa_no_chatgpt, claridade_da_capa, retrato_wikipedia
from app.services.canal import capa_do_canal
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PROJETO = "https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project"
PNG = bytes.fromhex("89504e470d0a1a0a") + b"resto-da-imagem"


@pytest.fixture
def canal(monkeypatch, tmp_path):
    """Canal ativo, settings.db e pastas de fichas e fotos dentro do teste."""
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
    return raiz


class TestEstilo:
    def test_canal_novo_tem_o_mascote_e_a_meta_padrao(self, canal):
        assert capa_do_canal.ler_estilo() == {
            "protagonista": "mascote",
            "luminancia_minima": 95.0,
            "escuros_maximo": 40.0,
            "fotos_do_apresentador": [],
            "expressoes": [],
            "maximo_de_fotos": 40,
        }

    def test_liga_o_apresentador_e_volta_ao_mascote_sem_perder_as_fotos(self, canal):
        capa_do_canal.salvar_foto("pensativo.jpg", PNG)
        capa_do_canal.gravar_estilo("apresentador", 100, 35)

        assert capa_do_canal.protagonista() == "apresentador"
        assert capa_do_canal.meta_de_claridade().luminancia_minima == 100

        estilo = capa_do_canal.gravar_estilo("mascote", 100, 35)
        assert estilo["protagonista"] == "mascote"
        assert estilo["fotos_do_apresentador"] == ["pensativo.jpg"]

    def test_estilo_e_por_canal(self, canal, monkeypatch, tmp_path):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)
        outro = tmp_path / "channels" / "outrocanal"
        monkeypatch.setattr(channel_paths, "active_channel_root", lambda: outro)

        assert capa_do_canal.protagonista() == "mascote"

    def test_recusa_protagonista_e_meta_invalidos(self, canal):
        with pytest.raises(PedidoInvalido):
            capa_do_canal.gravar_estilo("os dois", 95, 40)
        with pytest.raises(PedidoInvalido):
            capa_do_canal.gravar_estilo("apresentador", 300, 40)

    def test_o_bloco_do_modo_lista_as_expressoes_do_banco(self, canal):
        capa_do_canal.salvar_foto("Indignado 2.png", PNG)
        capa_do_canal.salvar_foto("pensativo.jpg", PNG)
        assert "MODO DA CAPA: mascote" in capa_do_canal.bloco_do_modo_da_capa()

        capa_do_canal.gravar_estilo("apresentador", 95, 40)
        bloco = capa_do_canal.bloco_do_modo_da_capa()
        assert "MODO DA CAPA: apresentador" in bloco
        assert "indignado, pensativo" in bloco


class TestBancoDeFotos:
    def test_fotos_entram_saem_e_o_mesmo_nome_substitui(self, canal):
        capa_do_canal.salvar_foto("Pensativo.JPG", PNG)
        capa_do_canal.salvar_foto("pensativo.jpg", PNG + b"nova")
        estilo = capa_do_canal.salvar_foto("indignação-2.png", PNG)

        assert estilo["fotos_do_apresentador"] == ["indignacao-2.png", "pensativo.jpg"]
        assert estilo["expressoes"] == ["indignacao", "pensativo"]
        assert (canal / "assets" / "apresentador" / "pensativo.jpg").read_bytes() == PNG + b"nova"

        assert capa_do_canal.remover_foto("pensativo.jpg")["fotos_do_apresentador"] == [
            "indignacao-2.png"
        ]
        with pytest.raises(NaoEncontrado):
            capa_do_canal.caminho_da_foto("pensativo.jpg")

    def test_recusa_arquivo_que_nao_e_imagem(self, canal):
        with pytest.raises(PedidoInvalido):
            capa_do_canal.salvar_foto("pensativo.jpg", b"%PDF-1.7")

    def test_banco_cheio_recusa_foto_nova(self, canal, monkeypatch):
        monkeypatch.setattr(capa_do_canal, "MAXIMO_DE_FOTOS_NO_BANCO", 1)
        capa_do_canal.salvar_foto("serio.jpg", PNG)

        with pytest.raises(PedidoInvalido):
            capa_do_canal.salvar_foto("rindo.jpg", PNG)
        capa_do_canal.salvar_foto("serio.jpg", PNG + b"troca")  # trocar continua valendo

    def test_as_fotos_do_prompt_seguem_a_linha_do_capista(self, canal):
        for nome in ("pensativo.jpg", "indignado.jpg", "rindo.jpg", "serio.jpg", "assustado.jpg"):
            capa_do_canal.salvar_foto(nome, PNG)

        fotos = capa_do_canal.fotos_para_o_prompt('[APRESENTADOR="indignado, rindo"]\n\nA host.')

        assert [f.name for f in fotos][:2] == ["indignado.jpg", "rindo.jpg"]
        assert len(fotos) == 3


@pytest.fixture
def robo(canal, monkeypatch):
    """O robô do ChatGPT trocado por um registro do pedido e dos anexos."""
    capa_no_chatgpt.gravar_projeto(PROJETO)
    capa_no_chatgpt.salvar_ficha("poses-do-sapo.png", PNG)
    chamadas: list[tuple[str, list]] = []

    def gerar(_projeto, pedido, anexos, _anunciar):
        chamadas.append((pedido, anexos))
        return PNG

    async def sem_retrato(_nome, **_kw):
        return None

    monkeypatch.setattr(capa_no_chatgpt, "_gerar_no_navegador", gerar)
    monkeypatch.setattr(retrato_wikipedia, "buscar_wikipedia", sem_retrato)
    return chamadas


class TestRoboNoModoApresentador:
    PROMPT = '[VARIATION_TAGS] cenario="estudio"\n[APRESENTADOR="pensativo"]\n\nA host thinking.'

    def test_anexa_as_fotos_do_apresentador_e_nenhuma_ficha_do_mascote(self, robo):
        capa_do_canal.salvar_foto("pensativo.jpg", PNG)
        capa_do_canal.salvar_foto("rindo.jpg", PNG)
        capa_do_canal.gravar_estilo("apresentador", 95, 40)

        asyncio.run(capa_no_chatgpt.gerar_imagem(self.PROMPT, "16:9"))

        pedido, anexos = robo[0]
        assert [a.name for a in anexos] == ["pensativo.jpg", "rindo.jpg"]
        assert "fotos anexas do apresentador (pensativo.jpg, rindo.jpg)" in pedido
        assert "fichas" not in pedido

    def test_banco_vazio_desenha_pela_descricao_sem_ficha_nenhuma(self, robo):
        capa_do_canal.gravar_estilo("apresentador", 95, 40)

        asyncio.run(capa_no_chatgpt.gerar_imagem(self.PROMPT, "16:9"))

        pedido, anexos = robo[0]
        assert anexos == []
        assert "apresentador é desenhado pela descrição do prompt" in pedido

    def test_no_modo_mascote_as_fichas_voltam(self, robo):
        capa_do_canal.salvar_foto("pensativo.jpg", PNG)
        capa_do_canal.gravar_estilo("mascote", 95, 40)

        asyncio.run(capa_no_chatgpt.gerar_imagem(self.PROMPT, "16:9"))

        pedido, anexos = robo[0]
        assert [a.name for a in anexos] == ["poses-do-sapo.png"]
        assert "fichas anexas" in pedido


# --------------------------------------------------------------------------- #
# Claridade da capa publicada
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def banco(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(claridade_da_capa, "AsyncSessionLocal", factory)
    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path / "projetos")

    pasta = tmp_path / "projetos" / "proj-1" / "thumbs"
    pasta.mkdir(parents=True)
    escura = Image.new("L", (160, 90), 20)
    escura.paste(230, (0, 0, 40, 90))  # um quarto claro, o resto na penumbra
    escura.save(pasta / "escura.png")

    async with factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        for corte_id, thumb in (("c1", "thumbs/escura.png"), ("c2", "")):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="proj-1",
                    numero=1,
                    titulo_proposto="t",
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    transcricao_final=json.dumps([]),
                )
            )
            db.add(MetadadoCorte(id=f"m-{corte_id}", corte_id=corte_id, thumbnail_path=thumb))
        await db.commit()
    yield factory
    await engine.dispose()


class TestClaridade:
    @pytest.mark.asyncio
    async def test_capa_na_penumbra_fica_abaixo_da_meta(self, canal, banco):
        medida = await claridade_da_capa.claridade_da_capa("c1")

        assert medida == {
            "luminancia": 72.5,
            "escuros_pct": 75.0,
            "luminancia_minima": 95.0,
            "escuros_maximo": 40.0,
            "abaixo_da_meta": True,
        }

    @pytest.mark.asyncio
    async def test_a_meta_do_canal_decide(self, canal, banco):
        capa_do_canal.gravar_estilo("mascote", 60, 80)

        assert (await claridade_da_capa.claridade_da_capa("c1"))["abaixo_da_meta"] is False

    @pytest.mark.asyncio
    async def test_sem_capa_nao_ha_medida(self, canal, banco):
        assert await claridade_da_capa.claridade_da_capa("c2") is None
        assert await claridade_da_capa.claridade_da_capa("nao-existe") is None


# --------------------------------------------------------------------------- #
# Rotas
# --------------------------------------------------------------------------- #


@pytest.fixture
def cliente(canal):
    app = FastAPI()
    app.include_router(router_capa.router, prefix="/api/capa-chatgpt")
    app.include_router(avaliacoes_thumbnail.router, prefix="/api/avaliacoes-thumbnail")
    return TestClient(app)


class TestRotas:
    def test_estilo_le_grava_e_recusa_protagonista_desconhecido(self, cliente):
        assert cliente.get("/api/capa-chatgpt/estilo").json()["protagonista"] == "mascote"

        corpo = {"protagonista": "apresentador", "luminancia_minima": 98, "escuros_maximo": 38}
        gravado = cliente.put("/api/capa-chatgpt/estilo", json=corpo).json()
        assert (gravado["protagonista"], gravado["luminancia_minima"]) == ("apresentador", 98)

        corpo["protagonista"] = "convidado"
        assert cliente.put("/api/capa-chatgpt/estilo", json=corpo).status_code == 422

    def test_foto_sobe_aparece_e_sai(self, cliente):
        subida = cliente.post(
            "/api/capa-chatgpt/apresentador", files={"arquivo": ("Rindo.png", PNG, "image/png")}
        )
        assert subida.json()["fotos_do_apresentador"] == ["rindo.png"]
        assert cliente.get("/api/capa-chatgpt/apresentador/rindo.png").content == PNG

        removida = cliente.delete("/api/capa-chatgpt/apresentador/rindo.png").json()
        assert removida["fotos_do_apresentador"] == []

    def test_claridade_sem_capa_responde_vazio(self, cliente, monkeypatch):
        async def sem_capa(_corte_id):
            return None

        monkeypatch.setattr(avaliacoes_thumbnail, "claridade_da_capa", sem_capa)

        resposta = cliente.get("/api/avaliacoes-thumbnail/corte/c9/claridade")
        assert resposta.json() == {"claridade": None}
