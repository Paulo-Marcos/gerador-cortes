"""A miniatura de 64 px da capa, para a aurora do front (D-1130, E-069 B-3).

Rota irmã de `/videos/<projeto>/<arquivo>`: mesmo caminho da capa, devolvido em
miniatura de até 4 KB. O CORS é o do app inteiro (origens locais).
"""

from __future__ import annotations

from app.core.channel_paths import projetos_dir
from app.services.miniatura_da_capa import miniatura_da_capa as gerar_miniatura
from fastapi import APIRouter, HTTPException, Response

router = APIRouter()

_EXTENSOES = (".png", ".jpg", ".jpeg", ".webp")


@router.get(
    "/{projeto_id}/{filename:path}",
    response_class=Response,
    include_in_schema=False,  # imagem, como a rota irmã `/videos`: o cliente gerado não a usa
)
async def miniatura_da_capa(projeto_id: str, filename: str):
    """A capa em 64 px de largura, JPEG de até 4 KB."""
    raiz = projetos_dir().resolve()
    base = (raiz / projeto_id).resolve()
    candidato = (base / filename).resolve()
    if not (base.is_relative_to(raiz) and candidato.is_relative_to(base)):
        raise HTTPException(status_code=403, detail="Acesso negado")
    if candidato.suffix.lower() not in _EXTENSOES or not candidato.is_file():
        raise HTTPException(status_code=404, detail=f"Capa não encontrada: {filename}")
    dados = await gerar_miniatura(candidato)
    return Response(
        content=dados,
        media_type="image/jpeg",
        # A capa é regravada no mesmo arquivo: o navegador revalida em vez de guardar.
        headers={"Cache-Control": "no-cache"},
    )
