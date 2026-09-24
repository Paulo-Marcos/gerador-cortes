"""Os retratos buscados na web: Wikipedia, download por URL e os erros (D-696).

Teste de caracterização, antes de as chamadas HTTP saírem do service e do
router para um adaptador da infraestrutura. A rede é simulada pelo transporte do
próprio httpx, para que as exceções sejam as reais; o teste entra pelo service e
pela função do router, que não mudam de lugar.
"""

from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from app.routers import retratos
from app.services import retrato_wikipedia
from fastapi import HTTPException

_PNG = b"\x89PNG\r\n\x1a\nbytes-do-retrato"


@pytest.fixture
def banco(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr(retrato_wikipedia.channel_paths, "retratos_dir", lambda: tmp_path)
    return tmp_path


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch):
    """Troca a rede: cada pedido cai em `rotas[host]`, que devolve a resposta."""
    pedidos: list[httpx.Request] = []
    rotas: dict = {}
    cliente_real = httpx.AsyncClient

    def responder(pedido: httpx.Request) -> httpx.Response:
        pedidos.append(pedido)
        return rotas[pedido.url.host](pedido)

    def cliente(*args, **kwargs):
        return cliente_real(*args, transport=httpx.MockTransport(responder), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", cliente)
    return pedidos, rotas


def _pageimage(url_imagem: str | None) -> httpx.Response:
    pagina = {"fullurl": "https://en.wikipedia.org/wiki/Karl_Marx"}
    if url_imagem:
        pagina["thumbnail"] = {"source": url_imagem}
    else:
        pagina["missing"] = ""
    return httpx.Response(200, json={"query": {"pages": {"1": pagina}}})


@pytest.mark.asyncio
async def test_sem_foto_em_portugues_busca_em_ingles_e_baixa(banco, web):
    pedidos, rotas = web
    rotas["pt.wikipedia.org"] = lambda _: _pageimage(None)
    rotas["en.wikipedia.org"] = lambda _: _pageimage("https://upload.wikimedia.org/marx.png")
    rotas["upload.wikimedia.org"] = lambda _: httpx.Response(200, content=_PNG)

    achado = await retrato_wikipedia.buscar_wikipedia("Karl Marx", tamanho=400)

    assert achado.fonte == "wikipedia-en"
    assert achado.pagina_wikipedia == "https://en.wikipedia.org/wiki/Karl_Marx"
    assert achado.caminho_arquivo.read_bytes() == _PNG
    assert achado.caminho_arquivo.suffix == ".png"
    consulta = pedidos[0]
    assert consulta.url.params["titles"] == "Karl Marx"
    assert consulta.url.params["pithumbsize"] == "400"
    assert consulta.headers["user-agent"] == retrato_wikipedia._USER_AGENT


@pytest.mark.asyncio
async def test_erro_de_rede_num_idioma_passa_para_o_outro(banco, web):
    _, rotas = web

    def fora_do_ar(pedido):
        raise httpx.ConnectError("sem rota", request=pedido)

    rotas["pt.wikipedia.org"] = fora_do_ar
    rotas["en.wikipedia.org"] = lambda _: _pageimage("https://upload.wikimedia.org/marx.jpg")
    rotas["upload.wikimedia.org"] = lambda _: httpx.Response(200, content=b"jpeg")

    achado = await retrato_wikipedia.buscar_wikipedia("Karl Marx")

    assert achado.fonte == "wikipedia-en"


@pytest.mark.asyncio
async def test_sem_foto_em_idioma_nenhum_devolve_none(banco, web):
    _, rotas = web
    rotas["pt.wikipedia.org"] = lambda _: _pageimage(None)
    rotas["en.wikipedia.org"] = lambda _: _pageimage(None)

    assert await retrato_wikipedia.buscar_wikipedia("Ninguem Conhecido") is None


@pytest.mark.asyncio
async def test_url_que_responde_erro_vira_502_com_o_status_da_origem(banco, web):
    _, rotas = web
    rotas["exemplo.com"] = lambda _: httpx.Response(404)

    with pytest.raises(HTTPException) as erro:
        await retratos.salvar_url(
            retratos.SalvarUrlRequest(nome="Marx", url="https://exemplo.com/x.png")
        )

    assert erro.value.status_code == 502
    assert erro.value.detail == "Origem respondeu 404 ao baixar imagem."


@pytest.mark.asyncio
async def test_url_inalcancavel_vira_502_com_o_motivo(banco, web):
    _, rotas = web

    def fora_do_ar(pedido):
        raise httpx.ConnectError("sem rota", request=pedido)

    rotas["exemplo.com"] = fora_do_ar

    with pytest.raises(HTTPException) as erro:
        await retratos.salvar_url(
            retratos.SalvarUrlRequest(nome="Marx", url="https://exemplo.com/x.png")
        )

    assert erro.value.status_code == 502
    assert erro.value.detail == "Falha ao baixar imagem: sem rota"


@pytest.mark.asyncio
async def test_url_relativa_vira_400_sem_ir_a_rede(banco, web):
    pedidos, _ = web

    with pytest.raises(HTTPException) as erro:
        await retratos.salvar_url(retratos.SalvarUrlRequest(nome="Marx", url="/x.png"))

    assert erro.value.status_code == 400
    assert pedidos == []
