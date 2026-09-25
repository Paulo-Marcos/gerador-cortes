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
from app.services import tiktok_studio
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

assistir_no_tiktok = rota_shorts._assistir_no_tiktok
# Onde a vigília da aba é disparada.
_VIGILIA_EM = (rota_shorts, "_vigiar_publicacao_no_tiktok")


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
    monkeypatch.setattr(*_VIGILIA_EM, vigiados.append)
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
