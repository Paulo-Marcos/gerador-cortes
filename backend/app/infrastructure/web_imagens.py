"""Imagens buscadas na web: a Wikipedia e as URLs que o operador cola (D-696).

As chamadas HTTP dos retratos moravam no service e no router. Aqui elas falam
com o httpx, e quem chama só conhece `SessaoWeb` e `DownloadFalhou`: uma falha
chega com o status da origem quando houve resposta, e sem status quando nem
isso (rede, DNS, tempo esgotado).
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx


class DownloadFalhou(RuntimeError):
    """O pedido não chegou ao fim. `status` é o código HTTP da origem, ou `None`
    quando não houve resposta."""

    def __init__(self, detalhe: str, *, status: int | None = None):
        super().__init__(detalhe)
        self.status = status


@dataclass(frozen=True)
class Download:
    conteudo: bytes
    content_type: str


class SessaoWeb:
    """Uma conexão reaproveitada entre os pedidos da mesma busca — a consulta em
    cada idioma e o download da imagem —, com o User-Agent de quem pede."""

    def __init__(self, user_agent: str):
        self._contexto = httpx.AsyncClient(
            headers={"User-Agent": user_agent}, follow_redirects=True
        )
        self._cliente = None

    async def __aenter__(self) -> SessaoWeb:
        self._cliente = await self._contexto.__aenter__()
        return self

    async def __aexit__(self, *erro) -> None:
        await self._contexto.__aexit__(*erro)

    async def consultar_pageimage(
        self, nome: str, idioma: str, tamanho: int
    ) -> tuple[str, str] | None:
        """(url_imagem, url_pagina) da página da Wikipedia mais relevante para
        `nome` no idioma, ou `None` se ela não tiver pageimage."""
        api = f"https://{idioma}.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "prop": "pageimages|info",
            "titles": nome,
            "format": "json",
            "pithumbsize": str(tamanho),
            "inprop": "url",
            "redirects": "1",
        }
        response = await self._pedir(api, params=params, timeout=15.0)
        data = response.json()

        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            if page.get("missing") is not None:
                continue
            thumb = page.get("thumbnail")
            if thumb and thumb.get("source"):
                return thumb["source"], page.get("fullurl", "")
        return None

    async def baixar(self, url: str, *, timeout: float) -> Download:
        response = await self._pedir(url, timeout=timeout)
        return Download(response.content, response.headers.get("content-type") or "")

    async def _pedir(self, url: str, **opcoes) -> httpx.Response:
        try:
            response = await self._cliente.get(url, **opcoes)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise DownloadFalhou(str(exc), status=exc.response.status_code) from exc
        except httpx.HTTPError as exc:
            raise DownloadFalhou(str(exc)) from exc
        return response
