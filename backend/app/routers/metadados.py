import json
from datetime import datetime

from app.database import get_db
from app.models import Corte, MetadadoCorte
from app.routers.errors import erro_interno
from app.services.metadados import MetadadosService
from app.services.tasks import fire_and_forget
from app.services.thumbnail import ThumbnailService
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
    meta = result.scalar_one_or_none()
    if not meta:
        return {
            "id": None,
            "corte_id": corte_id,
            "is_fire": False,
            "titulo_youtube": "",
            "descricao_youtube": "",
            "tags_youtube": [],
            "opcoes_titulo": [],
            "opcoes_texto_capa": [],
            "texto_capa": "",
            "prompt_thumbnail": "",
            "thumbnail_path": "",
        }
    return {
        **{c: getattr(meta, c) for c in meta.__table__.columns.keys()},
        "tags_youtube": json.loads(meta.tags_youtube or "[]"),
        "opcoes_titulo": json.loads(meta.opcoes_titulo or "[]"),
        "opcoes_texto_capa": json.loads(meta.opcoes_texto_capa or "[]"),
    }


@router.post("/corte/{corte_id}/gerar")
async def gerar_metadados(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara geração de metadados via n8n."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    fire_and_forget(MetadadosService.gerar_metadados(corte_id), name=f"metadados-{corte_id[:8]}")
    return {"message": "Geração de metadados iniciada", "corte_id": corte_id}


@router.patch("/corte/{corte_id}")
async def atualizar_metadado(
    corte_id: str, body: AtualizarMetadadoRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(MetadadoCorte).where(MetadadoCorte.corte_id == corte_id))
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


@router.post("/corte/{corte_id}/toggle-fire")
async def toggle_fire(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Alterna o status 🔥 do título e do metadado. Cria o metadado se não existir."""
    try:
        resultado = await MetadadosService.toggle_fire(corte_id)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/corte/{corte_id}/gerar-thumbnail")
async def gerar_thumbnail(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera thumbnail via Gemini Imagen a partir do prompt."""
    fire_and_forget(ThumbnailService.gerar(corte_id), name=f"thumbnail-{corte_id[:8]}")
    return {"message": "Geração de thumbnail iniciada", "corte_id": corte_id}


@router.post("/corte/{corte_id}/gerar-prompt")
async def gerar_prompt_route(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara geração do prompt da thumbnail via n8n usando texto e opções escolhidas."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    fire_and_forget(
        MetadadosService.gerar_prompt_thumbnail(corte_id), name=f"prompt-thumb-{corte_id[:8]}"
    )
    return {"message": "Geração de prompt de thumbnail iniciada", "corte_id": corte_id}


@router.post("/corte/{corte_id}/thumbnail-manual")
async def upload_thumbnail_manual(
    corte_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    """Upload manual de thumbnail gerada fora da plataforma."""
    try:
        content = await file.read()
        thumb_path = await ThumbnailService.upload_manual(corte_id, content, file.filename)
        return {"message": "Thumbnail enviada com sucesso", "thumbnail_path": thumb_path}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/corte/{corte_id}/meta/prompt")
async def exportar_prompt_meta(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna o prompt de geração de metadados sem chamar o n8n."""
    try:
        return await MetadadosService.montar_prompt_meta(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


class ImportarMetaRequest(BaseModel):
    opcoes_titulo: list = []
    opcoes_texto_capa: list = []
    sinopse: str = ""
    hashtags: list = []
    titulo: str | None = None


@router.post("/corte/{corte_id}/meta/importar")
async def importar_meta(
    corte_id: str, body: ImportarMetaRequest, db: AsyncSession = Depends(get_db)
):
    """Importa metadados gerados por IA externa e salva."""
    try:
        await MetadadosService.importar_resultado_meta(corte_id, body.model_dump())
        return {"message": "Metadados importados com sucesso"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/corte/{corte_id}/prompt-thumbnail/prompt")
async def exportar_prompt_thumbnail(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna o prompt de geração de thumbnail sem chamar o n8n."""
    try:
        return await MetadadosService.montar_prompt_thumbnail_externo(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/corte/{corte_id}/thumbnail-agent/prompt")
async def exportar_prompt_thumbnail_agente(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna o prompt para o GPT capista gerar thumbnails diretamente."""
    try:
        return await MetadadosService.montar_prompt_thumbnail_agente(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/corte/{corte_id}/thumbnail-agent-livre/prompt")
async def exportar_prompt_thumbnail_agente_livre(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Variante permissiva do prompt para o GPT capista: libera composicao e texto."""
    try:
        return await MetadadosService.montar_prompt_thumbnail_agente_livre(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


class ImportarPromptThumbnailRequest(BaseModel):
    prompt_thumbnail: str
    personagens_identificados: list | None = None
    cenario_factual: str | None = None


@router.post("/corte/{corte_id}/prompt-thumbnail/importar")
async def importar_prompt_thumbnail(
    corte_id: str, body: ImportarPromptThumbnailRequest, db: AsyncSession = Depends(get_db)
):
    """Importa prompt de thumbnail gerado por IA externa e salva."""
    try:
        await MetadadosService.importar_prompt_thumbnail(corte_id, body.prompt_thumbnail)
        return {"message": "Prompt de thumbnail importado com sucesso"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/corte/{corte_id}/comprimir-thumbnail")
async def comprimir_thumbnail_manual(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Comprime manualmente a thumbnail se ela exceder 2MB e salva sob a antiga."""
    try:
        resultado = await ThumbnailService.comprimir_manual(corte_id)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.delete("/corte/{corte_id}/thumbnail")
async def remover_thumbnail(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Remove a thumbnail atual do corte (arquivo + caminho no metadado)."""
    try:
        return await ThumbnailService.remover(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e
