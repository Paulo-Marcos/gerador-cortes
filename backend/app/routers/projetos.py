"""
Router de Projetos — CRUD e controle de download/transcrição
"""

import uuid
import asyncio
import json
import logging
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)


def _handle_task_exception(task: asyncio.Task):
    """Loga exceções de background tasks que seriam silenciadas."""
    if not task.cancelled() and task.exception():
        logger.exception("Erro em background task '%s'", task.get_name(), exc_info=task.exception())

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Projeto, StatusProjeto
from app.services.ingestao import IngestaoService
from app.config import settings

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────

class CriarProjetoRequest(BaseModel):
    youtube_url: str
    canal_origem: str = "@ateuinforma"


class ProjetoResponse(BaseModel):
    id: str
    youtube_url: str
    titulo_live: str
    canal_origem: str
    duracao_segundos: int
    status: str
    progresso_download: float
    arquivo_video_path: str
    criado_em: datetime

    class Config:
        from_attributes = True


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("", response_model=ProjetoResponse, status_code=201)
async def criar_projeto(body: CriarProjetoRequest, db: AsyncSession = Depends(get_db)):
    """Cria um novo projeto e inicia o download em background."""
    projeto = Projeto(
        id=str(uuid.uuid4()),
        youtube_url=body.youtube_url,
        canal_origem=body.canal_origem,
        status=StatusProjeto.PENDENTE,
    )
    db.add(projeto)
    await db.commit()
    await db.refresh(projeto)

    # Dispara download em background (não bloqueia a resposta)
    task = asyncio.create_task(
        IngestaoService.processar_projeto(projeto.id, body.youtube_url),
        name=f"ingestao-{projeto.id[:8]}",
    )
    task.add_done_callback(_handle_task_exception)

    return projeto


@router.get("", response_model=list[ProjetoResponse])
async def listar_projetos(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Projeto).order_by(Projeto.criado_em.desc()))
    return result.scalars().all()


@router.get("/{projeto_id}", response_model=ProjetoResponse)
async def obter_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return projeto


@router.delete("/{projeto_id}")
async def deletar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    
    await db.delete(projeto)
    await db.commit()
    
    return {"message": "Projeto excluído com sucesso"}


@router.get("/{projeto_id}/transcricao")
async def obter_transcricao(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna a transcrição raw com timestamps."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=404, detail="Transcrição ainda não disponível")
    return {"transcricao": json.loads(projeto.transcricao_raw)}


@router.get("/{projeto_id}/losslesscut.csv")
async def exportar_losslesscut(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Gera CSV de segmentos compatível com LosslessCut."""
    from app.services.export import ExportService
    csv_path = await ExportService.gerar_csv_losslesscut(projeto_id)
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename=f"projeto_{projeto_id[:8]}_losslesscut.csv"
    )


@router.post("/{projeto_id}/analisar")
async def analisar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara análise da transcrição via n8n."""
    from app.services.analise import AnaliseService
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")

    task = asyncio.create_task(
        AnaliseService.analisar_transcricao(projeto_id),
        name=f"analise-{projeto_id[:8]}",
    )
    task.add_done_callback(_handle_task_exception)
    return {"message": "Análise iniciada", "projeto_id": projeto_id}


@router.websocket("/{projeto_id}/ws")
async def websocket_progresso(websocket: WebSocket, projeto_id: str):
    """WebSocket para acompanhar progresso de download em tempo real."""
    await websocket.accept()
    try:
        from app.services.ingestao import IngestaoService
        async for update in IngestaoService.stream_progresso(projeto_id):
            await websocket.send_json(update)
            if update.get("status") in ("pronto", "erro"):
                break
    except WebSocketDisconnect:
        pass
