"""
Router de Metadados — geração e edição de metadados YouTube por corte
"""

import json
import asyncio
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import os
import aiofiles

from app.database import get_db
from app.models import MetadadoCorte, Corte
from app.config import settings

router = APIRouter()


class MetadadoResponse(BaseModel):
    id: str
    corte_id: str
    titulo_youtube: str
    descricao_youtube: str
    tags_youtube: list
    opcoes_titulo: list
    opcoes_texto_capa: list
    texto_capa: str
    link_live_com_timestamp: str
    canal_credito: str
    prompt_thumbnail: str
    thumbnail_path: str
    numero_serie: int
    cor_serie: str
    criado_em: datetime

    class Config:
        from_attributes = True


class AtualizarMetadadoRequest(BaseModel):
    titulo_youtube: str | None = None
    descricao_youtube: str | None = None
    tags_youtube: list | None = None
    opcoes_titulo: list | None = None
    opcoes_texto_capa: list | None = None
    texto_capa: str | None = None
    prompt_thumbnail: str | None = None
    numero_serie: int | None = None
    cor_serie: str | None = None


@router.get("/corte/{corte_id}")
async def obter_metadado(corte_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(
        select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
    )
    meta = result.scalar_one_or_none()
    if not meta:
        raise HTTPException(status_code=404, detail="Metadados ainda não gerados")
    return {**{c: getattr(meta, c) for c in meta.__table__.columns.keys()},
            "tags_youtube": json.loads(meta.tags_youtube or "[]"),
            "opcoes_titulo": json.loads(meta.opcoes_titulo or "[]"),
            "opcoes_texto_capa": json.loads(meta.opcoes_texto_capa or "[]")}


@router.post("/corte/{corte_id}/gerar")
async def gerar_metadados(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara geração de metadados via n8n."""
    from app.services.metadados import MetadadosService
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    asyncio.create_task(MetadadosService.gerar_metadados(corte_id))
    return {"message": "Geração de metadados iniciada", "corte_id": corte_id}


@router.patch("/corte/{corte_id}")
async def atualizar_metadado(corte_id: str, body: AtualizarMetadadoRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import select
    result = await db.execute(
        select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
    )
    meta = result.scalar_one_or_none()
    if not meta:
        raise HTTPException(status_code=404, detail="Metadados não encontrados")

    if body.titulo_youtube is not None:
        meta.titulo_youtube = body.titulo_youtube
    if body.descricao_youtube is not None:
        meta.descricao_youtube = body.descricao_youtube
    if body.tags_youtube is not None:
        meta.tags_youtube = json.dumps(body.tags_youtube)
    if body.opcoes_titulo is not None:
        meta.opcoes_titulo = json.dumps(body.opcoes_titulo)
    if body.opcoes_texto_capa is not None:
        meta.opcoes_texto_capa = json.dumps(body.opcoes_texto_capa)
    if body.texto_capa is not None:
        meta.texto_capa = body.texto_capa
    if body.prompt_thumbnail is not None:
        meta.prompt_thumbnail = body.prompt_thumbnail
    if body.numero_serie is not None:
        meta.numero_serie = body.numero_serie
    if body.cor_serie is not None:
        meta.cor_serie = body.cor_serie

    await db.commit()
    return {"message": "Metadados atualizados"}


@router.post("/corte/{corte_id}/gerar-thumbnail")
async def gerar_thumbnail(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera thumbnail via Gemini Imagen a partir do prompt."""
    from app.services.thumbnail import ThumbnailService
    asyncio.create_task(ThumbnailService.gerar(corte_id))
    return {"message": "Geração de thumbnail iniciada", "corte_id": corte_id}


@router.post("/corte/{corte_id}/gerar-prompt")
async def gerar_prompt_route(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara geração do prompt da thumbnail via n8n usando texto e opções escolhidas."""
    from app.services.metadados import MetadadosService
    from app.models import Corte
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    asyncio.create_task(MetadadosService.gerar_prompt_thumbnail(corte_id))
    return {"message": "Geração de prompt de thumbnail iniciada", "corte_id": corte_id}

@router.post("/corte/{corte_id}/thumbnail-manual")
async def upload_thumbnail_manual(corte_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Upload manual de thumbnail gerada fora da plataforma."""
    from sqlalchemy import select
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    
    result = await db.execute(
        select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id)
    )
    meta = result.scalar_one_or_none()
    if not meta:
        raise HTTPException(status_code=404, detail="Metadados não encontrados")

    # Garante a pasta do projeto
    thumb_dir = os.path.join(settings.projetos_dir, corte.projeto_id, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    
    extension = file.filename.split(".")[-1]
    # Salva sempre como .jpg ou a extensao original para ser usada
    thumb_path = os.path.join(thumb_dir, f"thumb_{corte.id[:8]}.{extension}")

    async with aiofiles.open(thumb_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)

    meta.thumbnail_path = thumb_path
    await db.commit()

    return {"message": "Thumbnail enviada com sucesso", "thumbnail_path": thumb_path}

