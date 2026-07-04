"""
Endpoints para gerenciar retratos usados nas cenas `ficha_biografica`.

Fluxo:
  - POST /api/retratos/buscar?nome=X         busca foto na Wikipedia e cacheia
  - POST /api/retratos/salvar-url            baixa imagem de URL externa para o banco
  - POST /api/retratos/upload (multipart)    fallback manual para sobrescrever
  - GET  /api/retratos/{slug}                serve o arquivo
  - DELETE /api/retratos/{slug}              remove do cache
"""

from __future__ import annotations

import httpx
from app import channel_paths
from app.services import retrato_wikipedia
from fastapi import APIRouter, Body, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter()

_VALIDOS_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _serializar(retrato: retrato_wikipedia.RetratoEncontrado) -> dict[str, object]:
    # URL absoluta: o Remotion roda em outra origem e nao resolve `/api/...`.
    # Mantemos `slug` para quem quiser montar caminho relativo manualmente.
    return {
        "nome": retrato.nome,
        "slug": retrato.slug,
        "url": retrato_wikipedia.url_para_remotion(retrato.url_publica),
        "fonte": retrato.fonte,
        "pagina_wikipedia": retrato.pagina_wikipedia,
    }


@router.post("/buscar")
async def buscar(
    nome: str,
    tamanho: int = 600,
    forcar: bool = False,
) -> dict[str, object]:
    """
    Procura `nome` na Wikipedia (PT primeiro, EN fallback) e baixa o
    thumbnail principal para cache local. Idempotente.
    """
    if not nome.strip():
        raise HTTPException(status_code=400, detail="Nome vazio")

    resultado = await retrato_wikipedia.buscar_wikipedia(
        nome=nome.strip(),
        tamanho=tamanho,
        forcar_redownload=forcar,
    )
    if resultado is None:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhuma imagem encontrada na Wikipedia para '{nome}'. "
            "Use POST /api/retratos/upload para enviar manualmente.",
        )
    return _serializar(resultado)


class SalvarUrlRequest(BaseModel):
    nome: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


@router.post("/salvar-url")
async def salvar_url(payload: SalvarUrlRequest = Body(...)) -> dict[str, object]:
    """
    Baixa a imagem de uma URL externa e adiciona ao banco de retratos.

    Usado quando nem a Wikipedia nem o banco local tem foto para `nome`: o usuario
    cola um link manual e a aplicacao guarda a imagem para reutilizar nas proximas
    cenas que citarem a mesma pessoa.
    """
    try:
        resultado = await retrato_wikipedia.salvar_de_url(
            nome=payload.nome,
            url=payload.url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Origem respondeu {exc.response.status_code} ao baixar imagem.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Falha ao baixar imagem: {exc}",
        ) from exc

    return _serializar(resultado)


@router.post("/upload")
async def upload(
    nome: str = Form(...),
    arquivo: UploadFile = File(...),
) -> dict[str, object]:
    """Fallback manual. Sobrescreve cache anterior do mesmo `nome`."""
    if not nome.strip():
        raise HTTPException(status_code=400, detail="Nome vazio")

    content_type = (arquivo.content_type or "").lower()
    if content_type not in _VALIDOS_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Content-type invalido: {content_type or 'desconhecido'}. "
            f"Aceitos: {', '.join(sorted(_VALIDOS_CONTENT_TYPES))}",
        )

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    resultado = await retrato_wikipedia.salvar_upload(
        nome=nome.strip(),
        conteudo=conteudo,
        content_type=content_type,
    )
    return _serializar(resultado)


@router.get("/{slug}")
def servir(slug: str):
    """Devolve o arquivo de imagem cacheado para o slug informado."""
    retratos_dir = channel_paths.retratos_dir()
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        caminho = retratos_dir / f"{slug}{ext}"
        if caminho.exists():
            media_type = {
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
            }[ext]
            return FileResponse(str(caminho), media_type=media_type)
    raise HTTPException(status_code=404, detail=f"Retrato '{slug}' nao encontrado")


@router.delete("/{slug}")
def remover(slug: str) -> Response:
    if not retrato_wikipedia.remover(slug):
        raise HTTPException(status_code=404, detail=f"Retrato '{slug}' nao existe")
    return Response(status_code=204)
