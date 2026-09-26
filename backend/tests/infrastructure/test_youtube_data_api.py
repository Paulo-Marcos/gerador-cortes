"""O cliente da YouTube Data API, com a API respondendo de mentira (D-719).

O módulo tinha 43% de cobertura: o que sobrava sem teste era justamente a
conversa com a API — resolver o canal, paginar a busca, casar a duração,
ler estatísticas e comentários, e separar "cota acabou" de "deu erro". O
`MockTransport` do httpx responde como a API responderia; nenhuma chamada sai
da máquina.
"""

from datetime import UTC, datetime

import httpx
import pytest
from app.infrastructure import youtube_data_api as api

_AsyncClient = httpx.AsyncClient


@pytest.fixture
def youtube(monkeypatch):
    """Instala a API falsa. `rotas` mapeia o fim do caminho para uma função que
    recebe os parâmetros e devolve `(status, json)`; `pedidos` guarda o que foi pedido."""
    monkeypatch.setattr(api.settings, "youtube_api_key", "chave-teste")
    estado = {"rotas": {}, "pedidos": []}

    def responder(request: httpx.Request) -> httpx.Response:
        rota = request.url.path.rsplit("/", 1)[-1]
        params = dict(request.url.params)
        estado["pedidos"].append((rota, params))
        status, corpo = estado["rotas"][rota](params)
        return httpx.Response(status, json=corpo)

    transporte = httpx.MockTransport(responder)
    monkeypatch.setattr(
        api.httpx, "AsyncClient", lambda **kw: _AsyncClient(transport=transporte, **kw)
    )
    return estado


def _erro(*razoes):
    return {"error": {"errors": [{"reason": r} for r in razoes]}}


# ─── A chave e o canal ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sem_chave_da_api_nao_chama_nada(monkeypatch):
    monkeypatch.setattr(api.settings, "youtube_api_key", "")

    with pytest.raises(api.YoutubeDataApiError, match="youtube_api_key"):
        await api.buscar_stats_videos(["v1"])


@pytest.mark.asyncio
async def test_channel_id_ja_resolvido_passa_direto(youtube):
    assert await api.resolver_canal_id("UCabc") == "UCabc"
    assert youtube["pedidos"] == []


@pytest.mark.parametrize(
    ("entrada", "parametro"), [("@canal", "forHandle"), ("canal", "forUsername")]
)
@pytest.mark.asyncio
async def test_handle_e_nome_viram_o_channel_id(youtube, entrada, parametro):
    youtube["rotas"]["channels"] = lambda p: (200, {"items": [{"id": "UCxyz"}]})

    assert await api.resolver_canal_id(entrada) == "UCxyz"
    (_, params) = youtube["pedidos"][0]
    assert params[parametro] == entrada.lstrip("@") if parametro == "forUsername" else entrada


@pytest.mark.asyncio
async def test_canal_que_a_api_nao_conhece(youtube):
    youtube["rotas"]["channels"] = lambda p: (200, {"items": []})

    with pytest.raises(api.YoutubeDataApiError, match="não encontrado"):
        await api.resolver_canal_id("@sumiu")


@pytest.mark.asyncio
async def test_canal_vazio_e_recusado(youtube):
    with pytest.raises(api.YoutubeDataApiError, match="canal vazio"):
        await api.resolver_canal_id("   ")


# ─── Cota x erro ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("corpo", "e_cota"),
    [
        (_erro("quotaExceeded"), True),
        (_erro("rateLimitExceeded"), True),
        (_erro("forbidden"), False),
        ({"sem": "estrutura"}, False),
    ],
)
@pytest.mark.asyncio
async def test_erro_da_api_diz_se_foi_cota(youtube, corpo, e_cota):
    youtube["rotas"]["videos"] = lambda p: (403, corpo)

    with pytest.raises(api.YoutubeDataApiError) as exc:
        await api.buscar_stats_videos(["v1"])

    assert exc.value.quota_excedida is e_cota
    assert "HTTP 403" in str(exc.value)


# ─── Busca de vídeos ─────────────────────────────────────────────────────────


def _item_da_busca(vid, titulo, publicado="2026-09-01T12:00:00Z", thumbs=None):
    return {
        "id": {"videoId": vid},
        "snippet": {
            "title": titulo,
            "channelId": "UC1",
            "channelTitle": "Canal",
            "publishedAt": publicado,
            "thumbnails": thumbs if thumbs is not None else {"medium": {"url": f"m/{vid}"}},
        },
    }


@pytest.mark.asyncio
async def test_busca_pagina_casa_a_duracao_e_pula_o_que_nao_e_video(youtube):
    paginas = {
        None: {
            "items": [_item_da_busca("v1", "Live 1"), {"id": {"kind": "youtube#channel"}}],
            "nextPageToken": "p2",
        },
        "p2": {
            "items": [
                _item_da_busca("v2", "Live 2", thumbs={"default": {"url": "d/v2"}}),
            ]
        },
    }
    youtube["rotas"]["search"] = lambda p: (200, paginas[p.get("pageToken")])
    youtube["rotas"]["videos"] = lambda p: (
        200,
        {
            "items": [
                {"id": v, "contentDetails": {"duration": f"PT{v}"}} for v in p["id"].split(",")
            ]
        },
    )
    depois_de = datetime(2026, 8, 1, 9, 30, tzinfo=UTC)

    resumos = await api.buscar_videos_do_canal("UC1", published_after=depois_de, max_results=80)

    assert [(r.video_id, r.titulo, r.duracao_iso, r.thumbnail_url) for r in resumos] == [
        ("v1", "Live 1", "PTv1", "m/v1"),
        ("v2", "Live 2", "PTv2", "d/v2"),
    ]
    assert resumos[0].publicado_em == datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    buscas = [p for rota, p in youtube["pedidos"] if rota == "search"]
    # A 1ª página guarda os dois itens, inclusive o que não é vídeo: 80 - 2 = 78.
    assert [b["maxResults"] for b in buscas] == ["50", "50"]
    assert buscas[0]["publishedAfter"] == "2026-08-01T09:30:00Z"


@pytest.mark.asyncio
async def test_busca_sem_resultado_nao_pede_duracao(youtube):
    youtube["rotas"]["search"] = lambda p: (200, {"items": []})

    assert await api.buscar_videos_do_canal("UC1") == []
    assert [rota for rota, _ in youtube["pedidos"]] == ["search"]


# ─── Estatísticas e comentários ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_estatisticas_vazias_viram_zero_e_lotes_de_cinquenta(youtube):
    youtube["rotas"]["videos"] = lambda p: (
        200,
        {
            "items": [
                {"id": v, "statistics": {"viewCount": "10", "likeCount": "2"}}
                for v in p["id"].split(",")
            ]
        },
    )
    ids = [f"v{i}" for i in range(60)]

    stats = await api.buscar_stats_videos(ids)

    assert len(stats) == 60
    assert stats["v0"] == api.VideoStats("v0", views=10, likes=2, comentarios=0)
    assert [len(p["id"].split(",")) for _, p in youtube["pedidos"]] == [50, 10]


@pytest.mark.asyncio
async def test_sem_videos_nao_pede_estatisticas(youtube):
    assert await api.buscar_stats_videos([]) == {}
    assert youtube["pedidos"] == []


@pytest.mark.asyncio
async def test_comentarios_do_topo(youtube):
    youtube["rotas"]["commentThreads"] = lambda p: (
        200,
        {
            "items": [
                {
                    "snippet": {
                        "topLevelComment": {
                            "snippet": {
                                "authorDisplayName": "Ana",
                                "textOriginal": "boa live",
                                "likeCount": 7,
                                "publishedAt": "2026-09-02T10:00:00Z",
                            }
                        }
                    }
                },
                {"snippet": {"topLevelComment": {"snippet": {"textDisplay": "só exibição"}}}},
            ]
        },
    )

    comentarios = await api.buscar_top_comentarios("v1", max_comentarios=500)

    assert [(c.autor, c.texto, c.likes) for c in comentarios] == [
        ("Ana", "boa live", 7),
        ("", "só exibição", 0),
    ]
    assert comentarios[1].publicado_em == datetime(1970, 1, 1, tzinfo=UTC)
    (_, params) = youtube["pedidos"][0]
    assert params["maxResults"] == "100"


@pytest.mark.parametrize("razao", ["commentsDisabled", "videoNotFound"])
@pytest.mark.asyncio
async def test_comentarios_desligados_sao_lista_vazia(youtube, razao):
    youtube["rotas"]["commentThreads"] = lambda p: (403, _erro(razao))

    assert await api.buscar_top_comentarios("v1") == []


@pytest.mark.asyncio
async def test_outro_403_nos_comentarios_e_erro(youtube):
    youtube["rotas"]["commentThreads"] = lambda p: (403, _erro("quotaExceeded"))

    with pytest.raises(api.YoutubeDataApiError) as exc:
        await api.buscar_top_comentarios("v1")

    assert exc.value.quota_excedida is True
