"""Testes para retrato_wikipedia — banco local de imagens.

Foco: `salvar_de_url` precisa persistir a imagem baixada com o slug correto e
expor URL publica que o `_buscar_url_retrato` do servico de cenas vai reler do
cache na proxima chamada.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services import retrato_wikipedia


@pytest.fixture
def banco_temp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    # D-156: o diretório de retratos passou a ser resolvido pelo canal ativo via
    # channel_paths.retratos_dir(); aponta para tmp_path no teste.
    monkeypatch.setattr(retrato_wikipedia.channel_paths, "retratos_dir", lambda: tmp_path)
    return tmp_path


@pytest.mark.asyncio
async def test_salvar_de_url_persiste_no_banco(banco_temp: Path) -> None:
    response = MagicMock()
    response.content = b"\x89PNG\r\n\x1a\nfake-bytes"
    response.headers = {"content-type": "image/png"}
    response.raise_for_status = MagicMock()

    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=None)

    with patch.object(retrato_wikipedia.httpx, "AsyncClient", return_value=ctx):
        retrato = await retrato_wikipedia.salvar_de_url(
            nome="Karl Marx",
            url="https://exemplo.com/marx.png",
        )

    assert retrato.slug == "karl_marx"
    assert retrato.fonte == "url"
    assert retrato.url_publica == "/api/retratos/karl_marx"
    assert (
        retrato_wikipedia.url_para_remotion(retrato.url_publica)
        == "http://localhost:8000/api/retratos/karl_marx"
    )
    assert retrato.caminho_arquivo.exists()
    assert retrato.caminho_arquivo.suffix == ".png"
    assert retrato.caminho_arquivo.read_bytes() == response.content


@pytest.mark.asyncio
async def test_salvar_de_url_proxima_busca_pega_do_cache(banco_temp: Path) -> None:
    response = MagicMock()
    response.content = b"jpeg-bytes"
    response.headers = {"content-type": "image/jpeg"}
    response.raise_for_status = MagicMock()

    client = MagicMock()
    client.get = AsyncMock(return_value=response)
    ctx = MagicMock()
    ctx.__aenter__ = AsyncMock(return_value=client)
    ctx.__aexit__ = AsyncMock(return_value=None)

    with patch.object(retrato_wikipedia.httpx, "AsyncClient", return_value=ctx):
        await retrato_wikipedia.salvar_de_url(
            nome="Hannah Arendt",
            url="https://exemplo.com/arendt.jpg",
        )

    # buscar_wikipedia precisa devolver do cache local sem tocar na Wikipedia.
    achado = await retrato_wikipedia.buscar_wikipedia(nome="Hannah Arendt")

    assert achado is not None
    assert achado.fonte == "cache"
    assert achado.url_publica == "/api/retratos/hannah_arendt"


@pytest.mark.asyncio
async def test_salvar_de_url_rejeita_url_relativa(banco_temp: Path) -> None:
    with pytest.raises(ValueError, match="absoluta"):
        await retrato_wikipedia.salvar_de_url(nome="X", url="/relativa.jpg")


@pytest.mark.asyncio
async def test_salvar_de_url_rejeita_nome_vazio(banco_temp: Path) -> None:
    with pytest.raises(ValueError, match="vazio"):
        await retrato_wikipedia.salvar_de_url(nome="   ", url="https://x.test/a.png")


def test_url_para_remotion_absolutiza_caminho_local() -> None:
    assert (
        retrato_wikipedia.url_para_remotion("/api/retratos/karl_marx")
        == "http://localhost:8000/api/retratos/karl_marx"
    )


def test_url_para_remotion_preserva_url_absoluta() -> None:
    assert (
        retrato_wikipedia.url_para_remotion("https://exemplo.com/a.jpg")
        == "https://exemplo.com/a.jpg"
    )


def test_url_para_remotion_preserva_vazio_e_none() -> None:
    assert retrato_wikipedia.url_para_remotion("") == ""
    assert retrato_wikipedia.url_para_remotion(None) is None
