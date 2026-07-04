"""
Busca de retratos via Wikipedia / Wikimedia Commons.

Estrategia:
  1. Procura pagina via REST API (pt.wikipedia.org primeiro, en fallback)
  2. Obtem URL da imagem principal via pageimages (tamanho configurave)
  3. Baixa o arquivo e salva em backend/assets/retratos/<slug>.<ext>

Cache:
  - Mesmo `slug` ja salvo retorna direto sem consultar Wikipedia
  - Para forcar redownload, exclua o arquivo manualmente

Servico stateless; nao toca em banco.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import httpx
from app import channel_paths

_TAMANHO_DEFAULT = 600
_USER_AGENT = "CortadorLive/1.0 (https://github.com/paulo-marcos/gerador-cortes)"
_BACKEND_PUBLIC_URL = "http://localhost:8000"


def url_para_remotion(url: str | None) -> str | None:
    """
    Converte uma URL local de retrato (`/api/retratos/<slug>`) para a forma
    absoluta que o Remotion consegue carregar (ele roda em outra origem).
    URLs absolutas (http/https/data/file) e vazias passam intactas.
    """
    if not url:
        return url
    if url.startswith(("http://", "https://", "data:", "file:")):
        return url
    if url.startswith("/"):
        return f"{_BACKEND_PUBLIC_URL}{url}"
    return url


def _slugify(nome: str) -> str:
    """Normaliza um nome para uso como filename. Acentos viram ASCII."""
    nfkd = unicodedata.normalize("NFKD", nome)
    sem_acento = "".join(c for c in nfkd if not unicodedata.combining(c))
    slug = re.sub(r"[^a-zA-Z0-9]+", "_", sem_acento).strip("_").lower()
    return slug or "sem_nome"


def _diretorio() -> Path:
    # Resolve a cada chamada para seguir o canal ATIVO (D-156); não congela o
    # caminho no import.
    retratos_dir = channel_paths.retratos_dir()
    retratos_dir.mkdir(parents=True, exist_ok=True)
    return retratos_dir


@dataclass
class RetratoEncontrado:
    nome: str
    slug: str
    caminho_arquivo: Path
    url_publica: str
    fonte: str  # "wikipedia-pt" | "wikipedia-en" | "cache" | "upload"
    pagina_wikipedia: str | None = None


def _path_cache(slug: str, ext: str = ".jpg") -> Path:
    return _diretorio() / f"{slug}{ext}"


def _path_existente(slug: str) -> Path | None:
    diretorio = _diretorio()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        candidato = diretorio / f"{slug}{ext}"
        if candidato.exists():
            return candidato
    return None


def _url_publica_para(caminho: Path) -> str:
    """URL que o frontend/Remotion usam para acessar o arquivo via /api/retratos/{slug}."""
    slug = caminho.stem
    return f"/api/retratos/{slug}"


async def _consultar_pageimage(
    nome: str,
    idioma: str,
    tamanho: int,
    client: httpx.AsyncClient,
) -> tuple[str, str] | None:
    """
    Devolve (url_imagem, url_pagina) da pagina Wikipedia mais relevante para
    `nome` no idioma, ou None se nao houver pageimage.
    """
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
    response = await client.get(api, params=params, timeout=15.0)
    response.raise_for_status()
    data = response.json()

    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        if page.get("missing") is not None:
            continue
        thumb = page.get("thumbnail")
        if thumb and thumb.get("source"):
            return thumb["source"], page.get("fullurl", "")
    return None


def _extensao_da_url(url: str) -> str:
    base = url.split("?")[0].lower()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        if base.endswith(ext):
            return ext
    return ".jpg"


async def buscar_wikipedia(
    nome: str,
    tamanho: int = _TAMANHO_DEFAULT,
    forcar_redownload: bool = False,
) -> RetratoEncontrado | None:
    """
    Procura `nome` na Wikipedia (PT depois EN) e baixa o thumbnail principal.

    Retorna None quando nem PT nem EN tem pageimage para a pessoa.
    """
    slug = _slugify(nome)

    existente = _path_existente(slug)
    if existente and not forcar_redownload:
        return RetratoEncontrado(
            nome=nome,
            slug=slug,
            caminho_arquivo=existente,
            url_publica=_url_publica_para(existente),
            fonte="cache",
        )

    headers = {"User-Agent": _USER_AGENT}
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        resultado = None
        fonte: str | None = None
        for idioma in ("pt", "en"):
            try:
                achado = await _consultar_pageimage(nome, idioma, tamanho, client)
            except httpx.HTTPError:
                achado = None
            if achado is not None:
                resultado = achado
                fonte = f"wikipedia-{idioma}"
                break

        if resultado is None or fonte is None:
            return None

        url_imagem, url_pagina = resultado
        ext = _extensao_da_url(url_imagem)
        destino = _path_cache(slug, ext)
        # remove versoes antigas com extensao diferente
        for ext_outra in (".jpg", ".jpeg", ".png", ".webp"):
            if ext_outra != ext:
                obsoleto = _path_cache(slug, ext_outra)
                if obsoleto.exists():
                    obsoleto.unlink()

        download = await client.get(url_imagem, timeout=30.0)
        download.raise_for_status()
        destino.write_bytes(download.content)

    return RetratoEncontrado(
        nome=nome,
        slug=slug,
        caminho_arquivo=destino,
        url_publica=_url_publica_para(destino),
        fonte=fonte,
        pagina_wikipedia=url_pagina or None,
    )


async def salvar_upload(nome: str, conteudo: bytes, content_type: str) -> RetratoEncontrado:
    """
    Persiste um upload manual sobrescrevendo qualquer cache previo.
    Usado como fallback quando Wikipedia nao tem foto ou o usuario nao gostou.
    """
    slug = _slugify(nome)
    ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(content_type.lower(), ".jpg")

    # remove qualquer outra extensao previa do mesmo slug
    for ext_outra in (".jpg", ".jpeg", ".png", ".webp"):
        if ext_outra != ext:
            obsoleto = _path_cache(slug, ext_outra)
            if obsoleto.exists():
                obsoleto.unlink()

    destino = _path_cache(slug, ext)
    destino.write_bytes(conteudo)

    return RetratoEncontrado(
        nome=nome,
        slug=slug,
        caminho_arquivo=destino,
        url_publica=_url_publica_para(destino),
        fonte="upload",
    )


_CONTENT_TYPE_PARA_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/pjpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


async def salvar_de_url(nome: str, url: str) -> RetratoEncontrado:
    """
    Baixa a imagem da `url` externa e persiste no banco de retratos sob `slug(nome)`.

    Usado quando o usuario cola um link manual numa ficha biografica: deixa o
    banco preenchido para que a proxima busca pelo mesmo nome acerte direto.
    """
    nome_normalizado = nome.strip()
    url_normalizada = url.strip()
    if not nome_normalizado:
        raise ValueError("Nome vazio")
    if not url_normalizada.startswith(("http://", "https://")):
        raise ValueError("URL precisa ser absoluta (http/https)")

    slug = _slugify(nome_normalizado)
    headers = {"User-Agent": _USER_AGENT}
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        response = await client.get(url_normalizada, timeout=30.0)
        response.raise_for_status()
        conteudo = response.content
        content_type = (response.headers.get("content-type") or "").split(";")[0].strip().lower()

    if not conteudo:
        raise ValueError("Resposta vazia ao baixar imagem")

    ext = _CONTENT_TYPE_PARA_EXT.get(content_type) or _extensao_da_url(url_normalizada)

    for ext_outra in (".jpg", ".jpeg", ".png", ".webp"):
        if ext_outra != ext:
            obsoleto = _path_cache(slug, ext_outra)
            if obsoleto.exists():
                obsoleto.unlink()

    destino = _path_cache(slug, ext)
    destino.write_bytes(conteudo)

    return RetratoEncontrado(
        nome=nome_normalizado,
        slug=slug,
        caminho_arquivo=destino,
        url_publica=_url_publica_para(destino),
        fonte="url",
    )


def remover(nome_ou_slug: str) -> bool:
    """Apaga o retrato cacheado para o nome dado. Retorna False se nao existia."""
    slug = _slugify(nome_ou_slug)
    existente = _path_existente(slug)
    if existente is None:
        return False
    existente.unlink()
    return True
