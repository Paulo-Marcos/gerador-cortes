"""Vídeo e capa do short, e a publicação assistida no TikTok (D-706).

Teste de caracterização, antes de os casos de uso saírem do router de shorts.
Servir o vídeo (prévia ou final) e a capa acha o arquivo gravado e o entrega sem
cache velho; marcar o corte como publicado no TikTok grava a hora; a publicação
assistida monta a legenda, entrega o roteiro ao navegador, fica de olho na aba
quando o pacote é de um corte e responde 422 com o passo quando o roteiro para.
Troca só as bordas: banco em memória, a pasta dos projetos e o navegador. As
referências que o movimento troca ficam no topo.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.domain.publicacao.tiktok_studio import Passo, RoteiroInterrompido
from app.models import Base, Corte, MetadadoShort, Projeto, Short, StatusCorte
from app.routers import shorts as rota_shorts
from app.routers.errors import registrar_tratadores
from app.services import janela_do_robo, publicacao_no_tiktok, tiktok_studio
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

assistir_no_tiktok = rota_shorts._assistir_no_tiktok
# Onde a vigília da aba é disparada.
_VIGILIA_EM = (publicacao_no_tiktok, "vigiar_publicacao")


@pytest.fixture(autouse=True)
def sem_janela_do_robo(monkeypatch):
    """D-799: a aba pronta traz a janela do robô para a tela; aqui não há Chrome."""
    monkeypatch.setattr(janela_do_robo, "mostrar", lambda perfil: True)


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
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=60.0,
                status=StatusCorte.PROCESSADO,
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                arquivo_short_path="shorts/s1/short.mp4",
                arquivo_previa_path="",
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


@pytest.fixture
def cliente(fabrica, monkeypatch, tmp_path):
    monkeypatch.setattr("app.core.channel_paths.projetos_dir", lambda: tmp_path)
    app = FastAPI()
    app.include_router(rota_shorts.router, prefix="/api/shorts")
    registrar_tratadores(app)
    return TestClient(app, follow_redirects=False)


def _arquivo(tmp_path, relativo: str, mtime: int = 1_000) -> Path:
    arquivo = tmp_path / "p1" / relativo
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_bytes(b"x")
    os.utime(arquivo, (mtime, mtime))
    return arquivo


# ─── Vídeo e capa ────────────────────────────────────────────────────────────


def test_o_video_final_redireciona_com_o_cache_buster(cliente, tmp_path):
    _arquivo(tmp_path, "shorts/s1/short.mp4", 4_242)

    resposta = cliente.get("/api/shorts/s1/video")

    assert resposta.status_code == 307
    assert resposta.headers["location"] == "/videos/p1/shorts/s1/short.mp4?v=4242"
    assert resposta.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("caminho", "detalhe"),
    [
        ("/api/shorts/s1/video?estagio=previa", "Este short ainda nao tem previa."),
        ("/api/shorts/s1/video?estagio=rascunho", "Estagio 'rascunho' desconhecido."),
        ("/api/shorts/s1/video", "O arquivo foi registrado mas nao esta mais em disco."),
        ("/api/shorts/nao-tem/video", "Short nao encontrado"),
    ],
)
def test_video_sem_arquivo_da_404_dizendo_por_que(cliente, caminho, detalhe):
    resposta = cliente.get(caminho)

    assert (resposta.status_code, resposta.json()["detail"]) == (404, detalhe)


@pytest.mark.asyncio
async def test_a_capa_e_servida_sem_cache(cliente, fabrica, tmp_path):
    _arquivo(tmp_path, "shorts/s1/capa.jpg")
    async with fabrica() as db:
        db.add(MetadadoShort(id="m1", short_id="s1", capa_path="shorts/s1/capa.jpg"))
        await db.commit()

    resposta = cliente.get("/api/shorts/s1/capa/imagem")

    assert resposta.status_code == 200
    assert (resposta.content, resposta.headers["cache-control"]) == (b"x", "no-store")


def test_short_sem_capa_da_404(cliente):
    resposta = cliente.get("/api/shorts/s1/capa/imagem")

    assert (resposta.status_code, resposta.json()["detail"]) == (
        404,
        "Este short ainda nao tem capa.",
    )


# ─── Marca de publicado no TikTok ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_confirmar_marca_o_corte_como_publicado_no_tiktok(cliente, fabrica):
    corpo = cliente.post("/api/shorts/corte/c1/publicar/tiktok-horizontal/confirmar").json()

    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
    assert corte.tiktok_publicado_em is not None
    assert corpo == {"tiktok_publicado_em": corte.tiktok_publicado_em.isoformat()}


def test_confirmar_corte_inexistente_da_404(cliente):
    resposta = cliente.post("/api/shorts/corte/nao-tem/publicar/tiktok-horizontal/confirmar")

    assert resposta.status_code == 404


# ─── Publicação assistida ────────────────────────────────────────────────────


@pytest.fixture
def navegador(monkeypatch):
    pedidos: list[dict] = []
    vigiados: list[str] = []

    async def subir(**kwargs):
        pedidos.append(kwargs)
        return {"passos": ["arquivo", "legenda"]}

    monkeypatch.setattr(tiktok_studio, "subir_assistido", subir)
    monkeypatch.setattr(*_VIGILIA_EM, lambda corte_id, _marca="": vigiados.append(corte_id))
    return pedidos, vigiados


@pytest.mark.asyncio
async def test_assistir_monta_a_legenda_entrega_ao_navegador_e_vigia(navegador):
    pedidos, vigiados = navegador
    pacote = {"titulo": "Título", "descricao": "Descrição", "video": "v.mp4", "capa": "c.jpg"}

    resultado = await assistir_no_tiktok(pacote, corte_id="c1")

    (pedido,) = pedidos
    assert pedido["video"] == Path("v.mp4") and pedido["capa"] == Path("c.jpg")
    assert resultado["legenda"] == pedido["legenda"]
    assert "Título" in pedido["legenda"]
    assert resultado["passos"] == ["arquivo", "legenda"] and resultado["vigiando"] is True
    assert resultado["titulo"] == "Título"
    assert vigiados == ["c1"]


@pytest.mark.asyncio
async def test_assistir_sem_corte_e_sem_capa_nao_vigia(navegador):
    pedidos, vigiados = navegador

    resultado = await assistir_no_tiktok({"titulo": "T", "descricao": "", "video": "v.mp4"})

    assert pedidos[0]["capa"] is None
    assert resultado["vigiando"] is False
    assert vigiados == []


@pytest.mark.asyncio
async def test_roteiro_interrompido_vira_422_com_o_passo(monkeypatch, navegador):
    async def para(**_kwargs):
        raise RoteiroInterrompido(Passo.SESSAO, "faça login")

    monkeypatch.setattr(tiktok_studio, "subir_assistido", para)

    with pytest.raises(HTTPException) as exc:
        await assistir_no_tiktok({"titulo": "T", "video": "v.mp4"}, corte_id="c1")

    assert exc.value.status_code == 422
    assert exc.value.detail["passo"] == "sessao"
    assert navegador[1] == [], "roteiro parado não abre vigília"


# ─── Publicar sozinho no envio avulso (D-834) ────────────────────────────────


def test_o_pedido_da_tela_chega_ao_robo(cliente, navegador, monkeypatch):
    """O interruptor do lote, agora no botão de cada corte."""

    async def pacote(_corte_id):
        return {"titulo": "T", "descricao": "", "video": "v.mp4"}

    monkeypatch.setattr(rota_shorts, "publicar_corte_no_tiktok", pacote)

    cliente.post(
        "/api/shorts/corte/c1/publicar/tiktok-horizontal/assistido",
        json={"publicar_sozinho": True},
    )
    cliente.post("/api/shorts/corte/c1/publicar/tiktok-horizontal/assistido")

    assert [p["publicar_sozinho"] for p in navegador[0]] == [True, False]


@pytest.mark.asyncio
async def test_publicado_pelo_robo_marca_o_corte_sem_vigiar(fabrica, navegador, monkeypatch):
    """Quem apertou Publicar foi o robô: não há o que esperar na aba (como no lote)."""
    pedidos, vigiados = navegador
    mostradas = []
    monkeypatch.setattr(janela_do_robo, "mostrar", mostradas.append)

    async def publica(**kwargs):
        pedidos.append(kwargs)
        return {"passos": ["publicar"], "publicado": True}

    monkeypatch.setattr(tiktok_studio, "subir_assistido", publica)

    resultado = await assistir_no_tiktok(
        {"titulo": "T", "video": "v.mp4"}, corte_id="c1", publicar_sozinho=True
    )

    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
    assert corte.tiktok_publicado_em is not None
    assert resultado["publicado"] is True and resultado["vigiando"] is False
    assert vigiados == [] and mostradas == []


@pytest.mark.asyncio
async def test_falha_depois_do_publicar_mostra_a_aba_e_vigia(monkeypatch, navegador):
    """D-893: parar no passo PUBLICAR é parar depois do clique — o post pode ter saído.

    O 422 manda "conferir na aba que ficou aberta"; antes, a janela continuava
    fora da tela (D-799) e ninguém marcava o corte, então o botão voltava a
    publicar o mesmo vídeo. Agora a aba volta para a tela e fica vigiada.
    """
    _, vigiados = navegador
    mostradas = []
    monkeypatch.setattr(janela_do_robo, "mostrar", mostradas.append)

    async def para_no_publicar(**_kwargs):
        raise RoteiroInterrompido(Passo.PUBLICAR, "a pagina nao saiu do upload em 120s")

    monkeypatch.setattr(tiktok_studio, "subir_assistido", para_no_publicar)

    with pytest.raises(HTTPException) as exc:
        await assistir_no_tiktok(
            {"titulo": "T", "video": "v.mp4"}, corte_id="c1", publicar_sozinho=True
        )

    assert exc.value.status_code == 422 and exc.value.detail["passo"] == "publicar"
    assert vigiados == ["c1"] and len(mostradas) == 1


@pytest.mark.asyncio
async def test_sem_capa_o_robo_nao_publica_e_a_aba_fica_vigiada(fabrica, navegador):
    """RN-26: pedido de publicar sozinho não passa por cima da capa que faltou."""
    _, vigiados = navegador

    resultado = await assistir_no_tiktok(
        {"titulo": "T", "video": "v.mp4"}, corte_id="c1", publicar_sozinho=True
    )

    async with fabrica() as db:
        corte = await db.get(Corte, "c1")
    assert corte.tiktok_publicado_em is None
    assert resultado["vigiando"] is True and vigiados == ["c1"]


# ─── D-893: etiqueta da aba e um envio por vez ───────────────────────────────


@pytest.mark.asyncio
async def test_o_envio_avulso_etiqueta_a_aba_e_a_vigilia_procura_essa_etiqueta(
    monkeypatch, navegador
):
    """Como o lote (D-564): sem etiqueta, a vigília olhava a PRIMEIRA aba de
    upload — a de outro corte — e marcava este sem ele ter saído (D-512)."""
    pedidos, _ = navegador
    vigias = []
    monkeypatch.setattr(*_VIGILIA_EM, lambda corte_id, marca="": vigias.append((corte_id, marca)))

    await assistir_no_tiktok({"titulo": "T", "video": "v.mp4"}, corte_id="c1")
    await assistir_no_tiktok({"titulo": "T", "video": "v.mp4"}, corte_id="c2")

    marcas = [p["marca"] for p in pedidos]
    assert all(m.startswith("cortadorlive-") for m in marcas) and marcas[0] != marcas[1]
    assert vigias == [("c1", marcas[0]), ("c2", marcas[1])]


@pytest.mark.asyncio
async def test_corte_com_vigilia_em_curso_nao_e_enviado_de_novo(monkeypatch, navegador):
    """Fechar e reabrir o modal esquece o erro na tela; quem recusa é o servidor."""
    from app.domain.compartilhado.erros import PedidoInvalido

    monkeypatch.setattr(publicacao_no_tiktok, "_VIGIADOS", {"c1"})

    with pytest.raises(PedidoInvalido, match="esperando a publica"):
        await publicacao_no_tiktok.publicar_assistido(
            {"titulo": "T", "video": "v.mp4"}, corte_id="c1"
        )

    assert navegador[0] == [], "o robô nem foi chamado"
    # Outro corte segue livre.
    await publicacao_no_tiktok.publicar_assistido({"titulo": "T", "video": "v.mp4"}, corte_id="c2")
    assert len(navegador[0]) == 1
