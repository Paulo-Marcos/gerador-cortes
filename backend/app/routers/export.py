import asyncio
import json
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.channel_paths import (
    para_relativo_ao_projeto,
    projetos_dir,
    resolver_do_projeto,
)
from app.database import AsyncSessionLocal, get_db
from app.domain.cinema_filters import FILTROS_CINEMA
from app.models import Corte, MetadadoCorte, Projeto, StatusCorte
from app.routers.errors import erro_interno
from app.services.app_logging import operational_info
from app.services.export import ExportService
from app.services.render_progress import RenderProgressStore
from app.services.tasks import fire_and_forget
from app.services.youtube import YouTubeService
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/projeto/{projeto_id}/losslesscut.csv")
async def exportar_losslesscut(projeto_id: str, db: AsyncSession = Depends(get_db)):
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    csv_path = await ExportService.gerar_csv_losslesscut(projeto_id, db)
    return FileResponse(
        csv_path, media_type="text/csv", filename=f"losslesscut_{projeto_id[:8]}.csv"
    )


def _contar_cenas_remotion(payload: str | None) -> int:
    if not payload:
        return 0
    try:
        data = json.loads(payload)
        if isinstance(data, list):
            return len(data)
        if isinstance(data, dict):
            return len(data.get("cenas", []))
    except Exception:
        pass
    return 0


_OVERLAY_CHUNK_GLOBS = ("chunk_*.webm", "chunk_*.mov", "ov_*.webm", "ov_*.mov")


def _overlays_existem(overlays_dir: Path) -> bool:
    if not overlays_dir.exists():
        return False
    for pattern in _OVERLAY_CHUNK_GLOBS:
        for candidate in overlays_dir.glob(pattern):
            try:
                if candidate.stat().st_size > 1024 * 1024:
                    return True
            except OSError:
                continue
    return False


@router.get("/projeto/{projeto_id}/status")
async def status_export(projeto_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Corte)
        .where(Corte.projeto_id == projeto_id)
        .where(
            Corte.status.in_(
                [
                    StatusCorte.APROVADO,
                    StatusCorte.EDITADO,
                    StatusCorte.PROCESSADO,
                ]
            )
        )
        .order_by(Corte.numero)
    )
    cortes = result.scalars().all()

    items = []
    for corte in cortes:
        meta_result = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id == corte.id)
        )
        meta = meta_result.scalar_one_or_none()

        corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
        final_video_path = corte_dir / "upload_ready" / "video.mp4"
        graded_path = corte_dir / "graded" / "clip_graded.mp4"
        overlays_dir = corte_dir / "overlays"

        final_pronto = final_video_path.exists()
        # Quando final existe, todas as fases anteriores foram percorridas — mesmo
        # que o retention tenha limpado um intermediário, vale marcar como pronto.
        grade_pronta = final_pronto or graded_path.exists()
        overlays_prontos = final_pronto or _overlays_existem(overlays_dir)

        items.append(
            {
                "corte_id": corte.id,
                "numero": corte.numero,
                "titulo": corte.titulo_proposto,
                "raw_pronto": bool(corte.arquivo_clip_path),
                "grade_pronta": grade_pronta,
                "overlays_prontos": overlays_prontos,
                "video_pronto": final_pronto,
                "thumbnail_pronta": bool(meta and meta.thumbnail_path),
                "metadados_completos": bool(
                    meta and meta.titulo_youtube and meta.descricao_youtube
                ),
                "pronto_publicar": bool(
                    final_pronto and meta and meta.titulo_youtube and meta.thumbnail_path
                ),
                "titulo_youtube": meta.titulo_youtube if meta else None,
                "descricao_youtube": meta.descricao_youtube if meta else None,
                "thumbnail_path": meta.thumbnail_path if meta else None,
                "youtube_video_id": corte.youtube_video_id or "",
                "youtube_url_publicado": corte.youtube_url_publicado or "",
                "youtube_scheduled_at": corte.youtube_scheduled_at or "",
                "cenas_geradas": _contar_cenas_remotion(corte.cenas_remotion) > 0,
                "cenas_validadas": bool(corte.cenas_validadas),
            }
        )
    return {"projeto_id": projeto_id, "cortes": items}


@router.post("/corte/{corte_id}/cortar")
async def iniciar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    if ExportService.get_tarefa_corte_status(corte_id) == "cortando":
        return {"message": "Corte já em andamento", "corte_id": corte_id}

    ExportService.set_tarefa_corte_status(corte_id, "cortando")

    async def _run():
        resultado = await ExportService.cortar_clip_lossless(corte_id)
        if resultado.get("status") == "pronto":
            ExportService.set_tarefa_corte_status(corte_id, "pronto")
        else:
            msg = resultado.get("mensagem", "erro desconhecido")
            ExportService.set_tarefa_corte_status(corte_id, f"erro: {msg}")

    fire_and_forget(_run(), name=f"cortar-{corte_id[:8]}")
    return {"message": "Corte iniciado", "corte_id": corte_id}


@router.get("/corte/{corte_id}/cortar/status")
async def status_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    status = ExportService.get_tarefa_corte_status(corte_id)

    corte = await db.get(Corte, corte_id)
    clip_path = corte.arquivo_clip_path if corte else None
    clip_resolvido = (
        resolver_do_projeto(clip_path, corte.projeto_id) if corte and clip_path else None
    )

    return {
        "corte_id": corte_id,
        "status": status,
        "clip_path": clip_path,
        "clip_gerado": bool(clip_resolvido and clip_resolvido.exists()),
    }


@router.post("/projeto/{projeto_id}/cortar-todos")
async def cortar_todos(projeto_id: str, db: AsyncSession = Depends(get_db)):
    iniciados = await ExportService.cortar_todos_impl(projeto_id)
    return {"message": f"{len(iniciados)} cortes iniciados", "cortes": iniciados}


@router.post("/corte/{corte_id}/gerar-csv-desvios")
async def gerar_csv_desvios_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    try:
        caminho = await ExportService.gerar_csv_desvios_corte(corte_id)
        return {"message": "CSV de desvios gerado", "caminho": caminho}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar CSV de desvios: {e}") from e


@router.post("/projeto/{projeto_id}/gerar-scripts-losslesscut")
async def gerar_scripts_losslesscut(projeto_id: str, db: AsyncSession = Depends(get_db)):
    res = await ExportService.gerar_scripts_losslesscut_logic(projeto_id)
    return res


@router.post("/corte/{corte_id}/auto-editor")
async def aplicar_auto_editor(corte_id: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await ExportService.aplicar_auto_editor(corte_id)
        if result.get("status") == "erro":
            raise HTTPException(status_code=400, detail=result.get("mensagem"))
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no auto-editor: {e}") from e


@router.post("/corte/{corte_id}/importar-clip")
async def importar_clip(corte_id: str, clip_path: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    if not Path(clip_path).exists():
        raise HTTPException(status_code=400, detail="Arquivo não encontrado no caminho informado")
    # D-158: guarda relativo ao projeto quando o clip vive dentro da pasta do
    # projeto (reancorável pelo canal ativo); fora dela, mantém o valor informado.
    corte.arquivo_clip_path = para_relativo_ao_projeto(clip_path, corte.projeto_id)
    await db.commit()
    return {"message": "Clip registrado com sucesso", "clip_path": clip_path}


@router.post("/corte/{corte_id}/processar")
async def processar_clip(corte_id: str, filtro: str = "nenhum", db: AsyncSession = Depends(get_db)):
    if RenderProgressStore.is_running(corte_id):
        return {"message": "Processamento ja em andamento", "corte_id": corte_id}

    operational_info("router", f"📥 Solicitação: Processar '{corte_id}' | Filtro: '{filtro}'")
    started_at = time.time()
    RenderProgressStore.start(corte_id)
    RenderProgressStore.update(corte_id, 2, "Render final enfileirado")
    operational_info("Render final", "2% - Render final enfileirado", started_at=started_at)

    async def _run_with_progress():
        task = asyncio.create_task(ExportService.processar_clip(corte_id, filtro=filtro))
        progress = 5
        try:
            while not task.done():
                RenderProgressStore.update(corte_id, progress, "Render final em processamento")
                operational_info(
                    "Render final",
                    f"{progress}% - Render final em processamento",
                    started_at=started_at,
                )
                progress = min(progress + 5, 95)
                await asyncio.sleep(5)

            await task
            async with AsyncSessionLocal() as check_db:
                corte = await check_db.get(Corte, corte_id)
                final_path = (
                    projetos_dir()
                    / corte.projeto_id
                    / "cortes"
                    / corte_id
                    / "upload_ready"
                    / "video.mp4"
                    if corte
                    else None
                )
            if final_path and final_path.exists():
                RenderProgressStore.done(corte_id)
                operational_info(
                    "Render final", "100% - Render final concluido", started_at=started_at
                )
            else:
                RenderProgressStore.error(
                    corte_id, "Video final nao foi encontrado apos processamento"
                )
        except Exception as exc:
            RenderProgressStore.error(corte_id, str(exc))
            operational_info("Render final", f"erro - {exc}", started_at=started_at)

    fire_and_forget(_run_with_progress(), name=f"render-final-{corte_id[:8]}")
    return {"message": "Processamento iniciado", "corte_id": corte_id}


@router.post("/corte/{corte_id}/faststart")
async def aplicar_faststart(corte_id: str, db: AsyncSession = Depends(get_db)):
    result = await ExportService.aplicar_faststart(corte_id)
    if result.get("status") == "erro":
        raise HTTPException(status_code=500, detail=result.get("mensagem"))
    return result


@router.get("/filtros")
async def listar_filtros():
    filtros = [
        {
            "id": k,
            "nome": v["nome"],
            "descricao": v["descricao"],
            "tem_filtro_visual": v["vf"] is not None,
        }
        for k, v in FILTROS_CINEMA.items()
    ]
    return {"filtros": filtros}


@router.get("/corte/{corte_id}/versoes")
async def listar_versoes(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    base_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id / "versoes"
    versoes = []
    if base_dir.exists():
        for pasta in sorted(base_dir.iterdir()):
            if pasta.is_dir():
                preview_file = pasta / "preview.mp4"
                video_file = pasta / "video.mp4"
                meta = pasta / "meta.json"

                arquivo = (
                    preview_file
                    if preview_file.exists()
                    else (video_file if video_file.exists() else None)
                )
                if arquivo:
                    info: dict = {
                        "filtro": pasta.name,
                        "nome": pasta.name,
                        "descricao": "",
                        "e_preview": preview_file.exists(),
                        "completo_disponivel": video_file.exists(),
                    }
                    if meta.exists():
                        try:
                            info.update(json.loads(meta.read_text()))
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
    if body and body.filtros:
        filtros = body.filtros
    else:
        filtros = list(FILTROS_CINEMA.keys())

    fire_and_forget(
        ExportService.processar_multiversion(
            corte_id, filtros=filtros, preview=preview, preview_segundos=preview_segundos
        ),
        name=f"multiversion-{corte_id[:8]}",
    )
    modo = f"preview ({preview_segundos}s)" if preview else "completo"
    return {
        "message": f"{len(filtros)} versões [{modo}] sendo geradas em paralelo",
        "filtros": filtros,
    }


class YouTubeUploadRequest(BaseModel):
    scheduled_at: str | None = None


@router.post("/corte/{corte_id}/youtube")
async def upload_to_youtube(
    corte_id: str, body: YouTubeUploadRequest = None, db: AsyncSession = Depends(get_db)
):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    scheduled_at = body.scheduled_at if body else None
    operational_info(
        "router", f"📥 Solicitação: YouTube Upload para '{corte_id}' | Agendado: {scheduled_at}"
    )
    try:
        resultado = await YouTubeService.upload_video(corte_id, scheduled_at=scheduled_at)
        if resultado.get("status") == "erro":
            raise HTTPException(status_code=500, detail=resultado.get("mensagem"))
        return resultado
    except Exception as e:
        raise erro_interno(e) from e


class MarcarPublicadoRequest(BaseModel):
    youtube_url: str


@router.post("/corte/{corte_id}/youtube/marcar-publicado")
async def marcar_corte_publicado(
    corte_id: str, body: MarcarPublicadoRequest, db: AsyncSession = Depends(get_db)
):
    operational_info(
        "router",
        f"📥 Solicitação: Marcar publicado manualmente '{corte_id}' | URL: {body.youtube_url}",
    )
    try:
        resultado = await YouTubeService.marcar_corte_publicado(corte_id, body.youtube_url)
    except HTTPException:
        raise
    except Exception as e:
        raise erro_interno(e) from e

    if resultado.get("status") == "erro":
        mensagem = resultado.get("mensagem", "Erro ao marcar corte como publicado.")
        mensagem_lower = mensagem.lower()
        if "não encontrado" in mensagem_lower or "nao encontrado" in mensagem_lower:
            raise HTTPException(status_code=404, detail=mensagem)
        raise HTTPException(status_code=400, detail=mensagem)

    return resultado


class BulkProcessarRequest(BaseModel):
    corte_ids: list[str]
    filtro: str = "nenhum"


@router.post("/projeto/{projeto_id}/bulk-processar")
async def bulk_processar(
    projeto_id: str, body: BulkProcessarRequest, db: AsyncSession = Depends(get_db)
):
    await ExportService.bulk_processar_impl(projeto_id, body.corte_ids, body.filtro)
    return {
        "message": f"{len(body.corte_ids)} cortes enfileirados para processamento",
        "filtro": body.filtro,
    }


@router.get("/projeto/{projeto_id}/fila-processamento")
async def status_fila_processamento(projeto_id: str):
    fila = ExportService.get_fila_processamento().get(projeto_id, {})
    total = len(fila)
    concluidos = sum(1 for s in fila.values() if s == "concluido")
    processando = sum(1 for s in fila.values() if s == "processando")
    aguardando = sum(1 for s in fila.values() if s == "aguardando")
    erros = sum(1 for s in fila.values() if s == "erro")
    return {
        "ativo": total > 0,
        "total": total,
        "concluidos": concluidos,
        "processando": processando,
        "aguardando": aguardando,
        "erros": erros,
        "pct": round(concluidos / total * 100) if total > 0 else 0,
        "detalhes": fila,
    }


@router.get("/filas-processamento")
async def status_todas_filas():
    filas_info = {}
    for proj_id, fila in ExportService.get_fila_processamento().items():
        total = len(fila)
        concluidos = sum(1 for s in fila.values() if s == "concluido")
        processando = sum(1 for s in fila.values() if s == "processando")
        aguardando = sum(1 for s in fila.values() if s == "aguardando")
        erros = sum(1 for s in fila.values() if s == "erro")
        if total > 0:
            filas_info[proj_id] = {
                "ativo": True,
                "total": total,
                "concluidos": concluidos,
                "processando": processando,
                "aguardando": aguardando,
                "erros": erros,
                "pct": round(concluidos / total * 100) if total > 0 else 0,
            }
    return filas_info


@router.get("/fila-global")
async def fila_global():
    pos_total = pos_processando = pos_aguardando = pos_concluidos = pos_erros = 0
    for fila in ExportService.get_fila_processamento().values():
        pos_total += len(fila)
        pos_processando += sum(1 for s in fila.values() if s == "processando")
        pos_aguardando += sum(1 for s in fila.values() if s == "aguardando")
        pos_concluidos += sum(1 for s in fila.values() if s == "concluido")
        pos_erros += sum(1 for s in fila.values() if s == "erro")

    yt_total = yt_processando = yt_concluidos = yt_erros = 0
    for fila in ExportService.get_fila_youtube().values():
        yt_total += len(fila)
        yt_processando += sum(1 for s in fila.values() if s == "enviando")
        yt_concluidos += sum(1 for s in fila.values() if s == "concluido")
        yt_erros += sum(1 for s in fila.values() if s == "erro")

    return {
        "pos_producao": {
            "total": pos_total,
            "processando": pos_processando,
            "aguardando": pos_aguardando,
            "concluidos": pos_concluidos,
            "erros": pos_erros,
            "ativo": pos_total > 0 and pos_concluidos < pos_total,
        },
        "upload_youtube": {
            "total": yt_total,
            "processando": yt_processando,
            "concluidos": yt_concluidos,
            "erros": yt_erros,
            "ativo": yt_total > 0 and yt_concluidos < yt_total,
        },
    }


class BulkYouTubeRequest(BaseModel):
    corte_ids: list[str]
    agendar: bool = False
    videos_por_dia: int = 3
    data_inicio: str | None = None
    hora_publicacao: str = "15:00"
    scheduled_dates: list[str | None] | None = None


@router.post("/projeto/{projeto_id}/bulk-youtube")
async def bulk_upload_youtube(
    projeto_id: str, body: BulkYouTubeRequest, db: AsyncSession = Depends(get_db)
):
    scheduled_dates: list[str | None] = []
    if body.scheduled_dates is not None:
        scheduled_dates = [
            body.scheduled_dates[i] if i < len(body.scheduled_dates) else None
            for i, _ in enumerate(body.corte_ids)
        ]
    elif body.agendar:
        hora_h, hora_m = map(int, body.hora_publicacao.split(":"))

        data_inicio_str = (
            body.data_inicio if body.data_inicio and body.data_inicio.strip() else None
        )

        if data_inicio_str:
            base_dt = datetime.fromisoformat(data_inicio_str.replace("Z", "+00:00"))
            if base_dt.tzinfo is None:
                base_dt = base_dt.replace(tzinfo=UTC)
            if "T" not in data_inicio_str:
                base_dt = base_dt.replace(hour=hora_h, minute=hora_m, second=0, microsecond=0)
        else:
            base_dt = datetime.now(UTC) + timedelta(hours=1)
            base_dt = base_dt.replace(hour=hora_h, minute=hora_m, second=0, microsecond=0)

        for i, _ in enumerate(body.corte_ids):
            dia_offset = i // body.videos_por_dia
            pub_dt = base_dt + timedelta(days=dia_offset)
            scheduled_dates.append(pub_dt.strftime("%Y-%m-%dT%H:%M:%SZ"))
    else:
        scheduled_dates = [None] * len(body.corte_ids)

    await ExportService.bulk_upload_youtube_impl(projeto_id, body.corte_ids, scheduled_dates)

    preview = [
        {"corte_id": cid, "scheduled_at": sched}
        for cid, sched in zip(body.corte_ids, scheduled_dates, strict=False)
    ]
    return {"message": f"{len(body.corte_ids)} vídeos enfileirados para upload", "agenda": preview}


# I-023: PATCH /projeto/{id}/filtro-padrao removido. O filtro de render
# é fonte única em AppSettings.filtro_global_padrao (PUT /api/settings).


@router.post("/projeto/{projeto_id}/gerar-todos-brutos-e-scripts")
async def gerar_todos_brutos_e_scripts(projeto_id: str):
    fire_and_forget(
        ExportService.gerar_todos_brutos_e_scripts_impl(projeto_id),
        name=f"brutos-scripts-{projeto_id[:8]}",
    )
    return {"message": "Processo de geração massiva de brutos e scripts iniciado em background."}
