"""
Router de Export — CSV LosslessCut, corte lossless ffmpeg, processamento (áudio + intro/outro)
"""

import json
import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Projeto, Corte, StatusCorte

router = APIRouter()


@router.get("/projeto/{projeto_id}/losslesscut.csv")
async def exportar_losslesscut(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Gera CSV de segmentos compatível com LosslessCut."""
    from app.services.export import ExportService
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    csv_path = await ExportService.gerar_csv_losslesscut(projeto_id, db)
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename=f"losslesscut_{projeto_id[:8]}.csv"
    )


@router.get("/projeto/{projeto_id}/status")
async def status_export(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna status de cada corte para o dashboard de publicação."""
    # Inclui cortes Aprovados, Editados e Processados (desvios que viraram cortes)
    result = await db.execute(
        select(Corte)
        .where(Corte.projeto_id == projeto_id)
        .where(Corte.status.in_([
            StatusCorte.APROVADO,
            StatusCorte.EDITADO,
            StatusCorte.PROCESSADO,
        ]))
        .order_by(Corte.numero)
    )
    cortes = result.scalars().all()

    items = []
    for corte in cortes:
        from sqlalchemy import select as sel
        from app.models import MetadadoCorte
        import os
        from pathlib import Path
        from app.config import settings

        meta_result = await db.execute(
            sel(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id)
        )
        meta = meta_result.scalar_one_or_none()

        final_video_path = Path(settings.projetos_dir) / corte.projeto_id / "cortes" / corte.id / "upload_ready" / "video.mp4"
        final_pronto = final_video_path.exists()

        items.append({
            "corte_id": corte.id,
            "numero": corte.numero,
            "titulo": corte.titulo_proposto,
            "raw_pronto": bool(corte.arquivo_clip_path),
            "video_pronto": final_pronto,
            "thumbnail_pronta": bool(meta and meta.thumbnail_path),
            "metadados_completos": bool(meta and meta.titulo_youtube and meta.descricao_youtube),
            "pronto_publicar": bool(
                final_pronto and
                meta and meta.titulo_youtube and meta.thumbnail_path
            ),
            "titulo_youtube": meta.titulo_youtube if meta else None,
            "descricao_youtube": meta.descricao_youtube if meta else None,
            "thumbnail_path": meta.thumbnail_path if meta else None,
        })
    return {"projeto_id": projeto_id, "cortes": items}


# ─── Corte Lossless (substitui LosslessCut) ──────────────────────────────────

# Rastreia tarefas em andamento: corte_id → "cortando" | "pronto" | "erro: ..."
_tarefas_corte: dict[str, str] = {}


@router.post("/corte/{corte_id}/cortar")
async def iniciar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    """
    Dispara o corte lossless em background via ffmpeg.
    Remove os desvios e salva clip_raw.mp4 na pasta do corte.
    """
    from app.services.export import ExportService

    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    if _tarefas_corte.get(corte_id) == "cortando":
        return {"message": "Corte já em andamento", "corte_id": corte_id}

    _tarefas_corte[corte_id] = "cortando"

    async def _run():
        resultado = await ExportService.cortar_clip_lossless(corte_id)
        if resultado.get("status") == "pronto":
            _tarefas_corte[corte_id] = "pronto"
        else:
            msg = resultado.get("mensagem", "erro desconhecido")
            _tarefas_corte[corte_id] = f"erro: {msg}"

    asyncio.create_task(_run())
    return {"message": "Corte iniciado", "corte_id": corte_id}


@router.get("/corte/{corte_id}/cortar/status")
async def status_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna o status atual do corte em processamento."""
    status = _tarefas_corte.get(corte_id, "nao_iniciado")

    # Verifica também no banco
    corte = await db.get(Corte, corte_id)
    clip_path = corte.arquivo_clip_path if corte else None

    return {
        "corte_id": corte_id,
        "status": status,
        "clip_path": clip_path,
        "clip_gerado": bool(clip_path and Path(clip_path).exists()),
    }


@router.post("/projeto/{projeto_id}/cortar-todos")
async def cortar_todos(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara o corte lossless de TODOS os cortes aprovados do projeto."""
    from app.services.export import ExportService

    result = await db.execute(
        select(Corte)
        .where(Corte.projeto_id == projeto_id)
        .where(Corte.status == StatusCorte.APROVADO)
        .where(Corte.arquivo_clip_path == None)  # só os que ainda não foram cortados
    )
    cortes = result.scalars().all()

    iniciados = []
    for corte in cortes:
        if _tarefas_corte.get(corte.id) != "cortando":
            _tarefas_corte[corte.id] = "cortando"
            asyncio.create_task(ExportService.cortar_clip_lossless(corte.id))
            iniciados.append(corte.id)

    return {"message": f"{len(iniciados)} cortes iniciados", "cortes": iniciados}


@router.post("/corte/{corte_id}/importar-clip")
async def importar_clip(corte_id: str, clip_path: str, db: AsyncSession = Depends(get_db)):
    """Registra o caminho do arquivo de clip exportado manualmente."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    if not Path(clip_path).exists():
        raise HTTPException(status_code=400, detail="Arquivo não encontrado no caminho informado")
    corte.arquivo_clip_path = clip_path
    await db.commit()
    return {"message": "Clip registrado com sucesso", "clip_path": clip_path}


@router.post("/corte/{corte_id}/processar")
async def processar_clip(corte_id: str, filtro: str = "nenhum", db: AsyncSession = Depends(get_db)):
    """Processa o clip: normaliza áudio, aplica filtro visual e adiciona intro/outro via ffmpeg."""
    from app.services.export import ExportService
    asyncio.create_task(ExportService.processar_clip(corte_id, filtro=filtro))
    return {"message": "Processamento iniciado", "corte_id": corte_id}


@router.get("/filtros")
async def listar_filtros():
    """Retorna a listagem completa de filtros cinematográficos disponíveis."""
    from app.services.export import ExportService
    filtros = [
        {
            "id": k,
            "nome": v["nome"],
            "descricao": v["descricao"],
            "tem_filtro_visual": v["vf"] is not None
        }
        for k, v in ExportService.FILTROS_CINEMA.items()
    ]
    return {"filtros": filtros}


@router.get("/corte/{corte_id}/versoes")
async def listar_versoes(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Lista as versões (preview e completas) disponíveis para o corte."""
    from app.config import settings
    from app.models import Corte as CorteModel
    corte = await db.get(CorteModel, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    base_dir = Path(settings.projetos_dir) / corte.projeto_id / "cortes" / corte_id / "versoes"
    versoes = []
    if base_dir.exists():
        for pasta in sorted(base_dir.iterdir()):
            if pasta.is_dir():
                preview_file = pasta / "preview.mp4"
                video_file = pasta / "video.mp4"
                meta = pasta / "meta.json"

                arquivo = preview_file if preview_file.exists() else (video_file if video_file.exists() else None)
                if arquivo:
                    info: dict = {
                        "filtro": pasta.name,
                        "nome": pasta.name,
                        "descricao": "",
                        "e_preview": preview_file.exists(),
                        "completo_disponivel": video_file.exists(),
                    }
                    if meta.exists():
                        import json as _json
                        try:
                            info.update(_json.loads(meta.read_text()))
                        except Exception:
                            pass
                    info["tamanho_mb"] = round(arquivo.stat().st_size / 1_000_000, 1)
                    versoes.append(info)
    return {"corte_id": corte_id, "versoes": versoes}


class ProcessarMultiversionRequest(BaseModel):
    filtros: list[str] | None = None

@router.post("/corte/{corte_id}/processar-multiversion")
async def processar_multiversion(
    corte_id: str,
    body: ProcessarMultiversionRequest = None,
    preview: bool = True,
    preview_segundos: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """Gera múltiplas versões. preview=True (padrão) gera clips de N segundos para avaliação rápida."""
    from app.services.export import ExportService
    if body and body.filtros:
        filtros = body.filtros
    else:
        filtros = list(ExportService.FILTROS_CINEMA.keys())

    asyncio.create_task(ExportService.processar_multiversion(
        corte_id, filtros=filtros, preview=preview, preview_segundos=preview_segundos
    ))
    modo = f"preview ({preview_segundos}s)" if preview else "completo"
    return {"message": f"{len(filtros)} versões [{modo}] sendo geradas em paralelo", "filtros": filtros}


