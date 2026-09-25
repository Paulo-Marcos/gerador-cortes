"""Criar, enfileirar, listar e reanalisar projetos, pela porta HTTP (D-703).

Teste de caracterização, antes de a regra sair dos routers para os services.
Entra pelas rotas de sempre, com os dois routers montados como no app; troca só
as bordas: banco em memória, a pasta dos projetos, o canal ativo e as tarefas de
fundo (ingestão e análise), que só são registradas. As referências que o
movimento troca ficam no topo.
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import pytest
import pytest_asyncio
from app.database import get_db
from app.models import (
    Base,
    Corte,
    LiveCandidata,
    MetadadoCorte,
    Projeto,
    StatusCorte,
    StatusLiveCandidata,
    StatusProjeto,
)
from app.routers import projetos as rota_projetos
from app.routers import ranking_lives as rota_ranking
from app.services.analise import AnaliseService
from app.services.ingestao import IngestaoService
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Onde cada caso de uso abre a sessão e lê a pasta dos projetos.
_SESSAO_ABERTA_EM = ["app.routers.ranking_lives", "app.services.ranking_lives"]
_PROJETOS_DIR_LIDO_EM = ["app.routers.projetos"]


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
    for modulo in _SESSAO_ABERTA_EM:
        monkeypatch.setattr(f"{modulo}.AsyncSessionLocal", f)
    yield f
    await engine.dispose()


@pytest.fixture
def fundo(monkeypatch):
    """As tarefas de fundo só são registradas: (qual, argumentos)."""
    chamadas: list[tuple] = []

    def registrar(nome):
        def criar(*args):
            chamadas.append((nome, args))

            async def nada():
                return None

            return nada()

        return criar

    monkeypatch.setattr(IngestaoService, "processar_projeto", registrar("ingestao"))
    monkeypatch.setattr(AnaliseService, "analisar_transcricao", registrar("analise"))
    return chamadas


@pytest.fixture
def cliente(fabrica, fundo, monkeypatch, tmp_path):
    monkeypatch.setattr(
        "app.services.channels.identidade_do_canal_ativo",
        lambda: SimpleNamespace(handle="@canal-ativo"),
    )
    for modulo in _PROJETOS_DIR_LIDO_EM:
        monkeypatch.setattr(f"{modulo}.projetos_dir", lambda: tmp_path)

    async def sessao():
        async with fabrica() as db:
            yield db
            await db.commit()

    app = FastAPI()
    app.include_router(rota_projetos.router, prefix="/api/projetos")
    app.include_router(rota_ranking.router, prefix="/api/ranking-lives")
    app.dependency_overrides[get_db] = sessao
    return TestClient(app)


async def _gravar(fabrica, *objetos):
    async with fabrica() as db:
        db.add_all(objetos)
        await db.commit()


async def _todos(fabrica, modelo):
    async with fabrica() as db:
        return (await db.execute(select(modelo))).scalars().all()


# ─── Criar à mão ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_criar_a_mao_cria_pendente_no_canal_ativo_e_dispara_a_ingestao(
    cliente, fabrica, fundo
):
    resposta = cliente.post("/api/projetos", json={"youtube_url": "https://youtu.be/abc"})

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["status"], corpo["canal_origem"]) == ("pendente", "@canal-ativo")
    assert fundo == [("ingestao", (corpo["id"], "https://youtu.be/abc"))]
    assert [p.id for p in await _todos(fabrica, Projeto)] == [corpo["id"]]


# ─── Enfileirar do ranking ───────────────────────────────────────────────────


def _candidata(**campos) -> LiveCandidata:
    base = {
        "id": "cand-1",
        "video_id": "vid1",
        "titulo": "Live boa",
        "canal_origem": "@fonte",
        "data_publicacao": datetime(2026, 9, 1, 20, 30, 15),
        "pontuacao_total": 81.5,
    }
    return LiveCandidata(**(base | campos))


@pytest.mark.asyncio
async def test_enfileirar_cria_o_projeto_com_os_dados_da_candidata(cliente, fabrica, fundo):
    await _gravar(fabrica, _candidata())

    resposta = cliente.post("/api/ranking-lives/vid1/enfileirar")

    corpo = resposta.json()
    assert (corpo["video_id"], corpo["ja_existia"], corpo["pontuacao_ranking"]) == (
        "vid1",
        False,
        81.5,
    )
    (projeto,) = await _todos(fabrica, Projeto)
    assert projeto.id == corpo["projeto_id"]
    assert (projeto.youtube_url, projeto.titulo_live, projeto.canal_origem) == (
        "https://www.youtube.com/watch?v=vid1",
        "Live boa",
        "@fonte",
    )
    assert (projeto.data_live, projeto.status) == ("20260901203015", StatusProjeto.PENDENTE)
    (candidata,) = await _todos(fabrica, LiveCandidata)
    assert (candidata.status, candidata.projeto_id) == (StatusLiveCandidata.PROMOVIDA, projeto.id)
    assert fundo == [("ingestao", (projeto.id, "https://www.youtube.com/watch?v=vid1"))]


@pytest.mark.asyncio
async def test_enfileirar_live_que_ja_tem_projeto_so_promove(cliente, fabrica, fundo):
    await _gravar(
        fabrica,
        _candidata(),
        Projeto(id="p-velho", youtube_url="https://www.youtube.com/watch?v=vid1"),
    )

    corpo = cliente.post("/api/ranking-lives/vid1/enfileirar").json()

    assert (corpo["projeto_id"], corpo["ja_existia"]) == ("p-velho", True)
    assert len(await _todos(fabrica, Projeto)) == 1
    (candidata,) = await _todos(fabrica, LiveCandidata)
    assert (candidata.status, candidata.projeto_id) == (StatusLiveCandidata.PROMOVIDA, "p-velho")
    assert fundo == []


@pytest.mark.asyncio
async def test_enfileirar_candidata_ja_promovida_devolve_o_projeto_dela(cliente, fabrica, fundo):
    await _gravar(fabrica, _candidata(status=StatusLiveCandidata.PROMOVIDA, projeto_id="p-9"))

    corpo = cliente.post("/api/ranking-lives/vid1/enfileirar").json()

    assert corpo == {"projeto_id": "p-9", "video_id": "vid1", "ja_existia": True}
    assert fundo == []


def test_enfileirar_candidata_inexistente_da_404(cliente):
    resposta = cliente.post("/api/ranking-lives/nao-tem/enfileirar")

    assert resposta.status_code == 404


# ─── Listar ──────────────────────────────────────────────────────────────────


def _corte(cid, projeto, status, *, yt="", agendado="", clip="", **extra) -> Corte:
    return Corte(
        id=cid,
        projeto_id=projeto,
        numero=1,
        inicio_seg=0.0,
        fim_seg=60.0,
        status=status,
        youtube_video_id=yt,
        youtube_scheduled_at=agendado,
        arquivo_clip_path=clip,
        **extra,
    )


@pytest.mark.asyncio
async def test_listar_conta_o_estado_de_cada_projeto_do_mais_novo_ao_mais_velho(
    cliente, fabrica, tmp_path
):
    aprovado, proposto = StatusCorte.APROVADO, StatusCorte.PROPOSTO
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u1", data_live="20260910"),
        Projeto(id="p2", youtube_url="u2", data_live="20260901"),
        Projeto(id="p3", youtube_url="u3", data_live="20260920"),
        # público sem agendamento, com clip, metadado e Fire pendente
        _corte("c1", "p1", aprovado, yt="yt1", clip="c1.mp4"),
        MetadadoCorte(id="m1", corte_id="c1", titulo_youtube="Título", is_fire=True),
        _corte("c2", "p1", aprovado, yt="yt2", agendado="2999-01-01T00:00:00Z"),  # futuro
        _corte("c3", "p1", aprovado, clip="c3.mp4"),  # vídeo pronto só no disco
        _corte("c4", "p1", proposto),
        _corte("c5", "p1", aprovado, yt="yt5", agendado="2000-01-01T00:00:00Z"),  # passado
        _corte("c6", "p1", aprovado, yt="yt6", agendado="lixo"),  # sem parse: acessível
        _corte("c7", "p2", proposto),
    )
    video = tmp_path / "p1" / "cortes" / "c3" / "upload_ready"
    video.mkdir(parents=True)
    (video / "video.mp4").write_bytes(b"mp4")

    lista = cliente.get("/api/projetos").json()

    assert [p["id"] for p in lista] == ["p3", "p1", "p2"]
    contagens = [
        "total_cortes",
        "total_publicados",
        "total_aprovados",
        "total_com_raw",
        "total_com_meta",
        "total_video_pronto",
        "total_publicos",
        "proxima_publicacao",
        "fires_pendentes",
    ]
    por_id = {p["id"]: [p[c] for c in contagens] for p in lista}
    assert por_id["p1"] == [6, 4, 5, 2, 1, 5, 3, "2999-01-01T00:00:00Z", 1]
    assert por_id["p2"] == [1, 0, 0, 0, 0, 0, 0, "", 0]
    assert por_id["p3"] == [0, 0, 0, 0, 0, 0, 0, "", 0]


def test_listar_sem_projeto_devolve_lista_vazia(cliente):
    assert cliente.get("/api/projetos").json() == []


# ─── Reanalisar ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_reanalisar_apaga_os_cortes_volta_a_pronto_e_dispara_a_analise(
    cliente, fabrica, fundo
):
    await _gravar(
        fabrica,
        Projeto(id="p1", youtube_url="u", transcricao_raw="[1]", status=StatusProjeto.ANALISADO),
        _corte("c1", "p1", StatusCorte.PROPOSTO),
        _corte("c2", "p1", StatusCorte.APROVADO),
    )

    resposta = cliente.post("/api/projetos/p1/reanalisar")

    assert resposta.json() == {
        "message": "Reanálise iniciada",
        "projeto_id": "p1",
        "cortes_removidos": 2,
    }
    assert await _todos(fabrica, Corte) == []
    (projeto,) = await _todos(fabrica, Projeto)
    assert projeto.status == StatusProjeto.PRONTO
    assert fundo == [("analise", ("p1",))]


@pytest.mark.asyncio
async def test_reanalisar_projeto_sem_transcricao_da_400(cliente, fabrica, fundo):
    await _gravar(fabrica, Projeto(id="p1", youtube_url="u", transcricao_raw=""))

    resposta = cliente.post("/api/projetos/p1/reanalisar")

    assert (resposta.status_code, resposta.json()["detail"]) == (
        400,
        "Projeto ainda sem transcrição",
    )
    assert fundo == []


def test_reanalisar_projeto_inexistente_da_404(cliente):
    resposta = cliente.post("/api/projetos/nao-tem/reanalisar")

    assert (resposta.status_code, resposta.json()["detail"]) == (404, "Projeto não encontrado")
