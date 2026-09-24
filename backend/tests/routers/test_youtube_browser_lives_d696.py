"""As lives do canal na YouTube Data API e o enfileiramento (D-696).

Teste de caracterização, antes de as chamadas HTTP e o caso de uso saírem do
router para a infraestrutura e um service. Entra pelas funções dos endpoints,
que não mudam de nome; troca só as bordas: banco em memória, a rede (pelo
transporte do próprio httpx), a chave da API, o canal ativo e a ingestão.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import httpx
import pytest
import pytest_asyncio
from app.domain.compartilhado.erros import ErroDeDominio
from app.models import Base, Projeto
from app.routers import youtube_browser
from app.routers.errors import responder_erro_de_dominio
from app.services import lives_do_canal
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_API = "www.googleapis.com"


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with fabrica() as sessao:
        yield sessao
    await engine.dispose()


@pytest.fixture
def canal(monkeypatch):
    """Chave da API e canal ativo configurados; a ingestão só é registrada."""
    import app.config

    monkeypatch.setattr(app.config.settings, "youtube_api_key", "chave-x")
    identidade = SimpleNamespace(youtube_channel_id="@canal")
    monkeypatch.setattr("app.services.channels.identidade_do_canal_ativo", lambda: identidade)
    ingestoes: list = []

    def registrar(coro, *, name):
        coro.close()
        ingestoes.append(name)

    monkeypatch.setattr(lives_do_canal, "fire_and_forget", registrar)
    return identidade, ingestoes


@pytest.fixture
def api(monkeypatch):
    """A API simulada: cada caminho (`channels`, `search`, `videos`) responde pelo dict."""
    pedidos: list[httpx.Request] = []
    respostas: dict = {}
    cliente_real = httpx.AsyncClient

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        assert pedido.url.host == _API
        return respostas[pedido.url.path.rsplit("/", 1)[-1]](pedido)

    def cliente(*args, **kwargs):
        return cliente_real(*args, transport=httpx.MockTransport(responder), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", cliente)
    return pedidos, respostas


async def _http_de(erro: ErroDeDominio) -> tuple[int, str]:
    """O que o tratador global responde para o erro (D-697)."""
    resposta = await responder_erro_de_dominio(None, erro)
    return resposta.status_code, json.loads(resposta.body)["detail"]


def _video(video_id: str, publicado: str) -> dict:
    return {
        "id": video_id,
        "snippet": {
            "title": f"Live {video_id}",
            "publishedAt": publicado,
            "thumbnails": {"medium": {"url": f"https://i.ytimg.com/{video_id}.jpg"}},
        },
        "contentDetails": {"duration": "PT2H"},
    }


def _responder_padrao(respostas: dict) -> None:
    respostas["channels"] = lambda _: httpx.Response(200, json={"items": [{"id": "UC123"}]})
    respostas["search"] = lambda _: httpx.Response(
        200, json={"items": [{"id": {"videoId": "a1"}}, {"id": {"videoId": "b2"}}]}
    )
    respostas["videos"] = lambda _: httpx.Response(
        200,
        json={
            "items": [_video("a1", "2026-09-01T20:00:00Z"), _video("b2", "2026-09-10T20:00:00Z")]
        },
    )


@pytest.mark.asyncio
async def test_lista_as_lives_mais_novas_primeiro_e_marca_as_ja_baixadas(db, canal, api):
    pedidos, respostas = api
    _responder_padrao(respostas)
    db.add(Projeto(id="p1", youtube_url="https://www.youtube.com/watch?v=a1", data_live="20260801"))
    await db.commit()

    resultado = await youtube_browser.listar_lives_canal(after_date="", max_results=10, db=db)

    assert resultado["channel_id"] == "UC123"
    assert resultado["after_date"] == "20260801"
    assert [live["video_id"] for live in resultado["lives"]] == ["b2", "a1"]
    assert resultado["lives"][1]["ja_baixado"] is True
    assert resultado["lives"][0] == {
        "video_id": "b2",
        "titulo": "Live b2",
        "data_publicacao": "2026-09-10T20:00:00Z",
        "data_publicacao_yyyymmdd": "20260910",
        "thumbnail_url": "https://i.ytimg.com/b2.jpg",
        "duracao_iso": "PT2H",
        "youtube_url": "https://www.youtube.com/watch?v=b2",
        "ja_baixado": False,
    }
    busca = next(p for p in pedidos if p.url.path.endswith("/search"))
    assert busca.url.params["channelId"] == "UC123"
    assert busca.url.params["eventType"] == "completed"
    assert busca.url.params["maxResults"] == "10"
    assert busca.url.params["publishedAfter"] == "2026-08-01T00:00:00Z"
    assert busca.url.params["key"] == "chave-x"


@pytest.mark.asyncio
async def test_canal_sem_lives_devolve_lista_vazia(db, canal, api):
    _, respostas = api
    _responder_padrao(respostas)
    respostas["search"] = lambda _: httpx.Response(200, json={"items": []})

    resultado = await youtube_browser.listar_lives_canal(after_date="20260901", db=db)

    assert resultado == {"lives": [], "after_date": "20260901"}


@pytest.mark.parametrize(
    ("etapa", "resposta", "status", "detalhe"),
    [
        (
            "channels",
            httpx.Response(403, text="negado"),
            502,
            "Não foi possível resolver o handle '@canal': negado",
        ),
        (
            "channels",
            httpx.Response(200, json={"items": []}),
            404,
            "Canal '@canal' não encontrado na YouTube API",
        ),
        (
            "search",
            httpx.Response(500, text="quebrou"),
            502,
            "Erro na YouTube API (search): quebrou",
        ),
        ("videos", httpx.Response(500, text="caiu"), 502, "Erro na YouTube API (videos): caiu"),
    ],
)
@pytest.mark.asyncio
async def test_falhas_da_api_viram_o_http_de_sempre(
    db, canal, api, etapa, resposta, status, detalhe
):
    _, respostas = api
    _responder_padrao(respostas)
    respostas[etapa] = lambda _: resposta

    with pytest.raises(ErroDeDominio) as erro:
        await youtube_browser.listar_lives_canal(after_date="20260901", db=db)

    assert await _http_de(erro.value) == (status, detalhe)


@pytest.mark.asyncio
async def test_sem_chave_da_api_recusa_sem_ir_a_rede(db, canal, api, monkeypatch):
    import app.config

    pedidos, _ = api
    monkeypatch.setattr(app.config.settings, "youtube_api_key", "")

    with pytest.raises(ErroDeDominio) as erro:
        await youtube_browser.listar_lives_canal(after_date="", db=db)

    assert (await _http_de(erro.value))[0] == 500
    assert pedidos == []


@pytest.mark.asyncio
async def test_enfileirar_cria_projetos_com_a_data_da_live_e_pula_os_que_existem(db, canal, api):
    _, ingestoes = canal
    _, respostas = api
    respostas["videos"] = lambda _: httpx.Response(
        200, json={"items": [_video("a1", "2026-09-01T20:30:15Z")]}
    )
    db.add(Projeto(id="p0", youtube_url="https://www.youtube.com/watch?v=b2"))
    await db.commit()

    resultado = await youtube_browser.enfileirar_downloads(
        youtube_browser.EnfileirarRequest(video_ids=["a1", "b2"], canal_origem="@canal"), db=db
    )

    assert [c["video_id"] for c in resultado["criados"]] == ["a1"]
    assert resultado["ignorados"] == ["b2"]
    projeto = (await db.execute(select(Projeto).where(Projeto.id != "p0"))).scalar_one()
    assert (projeto.data_live, projeto.canal_origem) == ("20260901203015", "@canal")
    assert len(ingestoes) == 1


@pytest.mark.asyncio
async def test_enfileirar_segue_sem_data_quando_a_api_falha(db, canal, api):
    _, respostas = api
    respostas["videos"] = lambda _: httpx.Response(500, text="caiu")

    resultado = await youtube_browser.enfileirar_downloads(
        youtube_browser.EnfileirarRequest(video_ids=["a1"]), db=db
    )

    assert len(resultado["criados"]) == 1
    projeto = (await db.execute(select(Projeto))).scalar_one()
    assert projeto.data_live == ""
