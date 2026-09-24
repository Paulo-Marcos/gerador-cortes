import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from app.channel_paths import (
    projetos_dir,
    resolver_do_projeto,
)
from app.database import get_db
from app.models import Corte, MetadadoCorte, StatusCorte
from app.routers.errors import erro_interno
from app.services.app_logging import operational_info

# Via o service de configurações: o router não fala com a infraestrutura (D-696).
from app.services.app_settings import FILTROS_CINEMA
from app.services.cancelamento_jobs import (
    CancelamentoNaoSuportado,
    JobNaoEstaEmVoo,
    cancelar_job,
)
from app.services.export import ExportService
from app.services.jobs_globais import JobsGlobais
from app.services.liberacao_publicacao import liberar_publicacao
from app.services.tasks import fire_and_forget
from app.services.youtube import YouTubeService
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


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


def _artefatos_de_cada_corte(cortes) -> dict[str, tuple[bool, bool, bool]]:
    """Por corte: (vídeo final, grade, overlays) existem no disco? (D-651).

    Síncrono de propósito — o chamador roda tudo de uma vez numa thread.
    """
    resultado: dict[str, tuple[bool, bool, bool]] = {}
    base = projetos_dir()
    for corte in cortes:
        corte_dir = base / corte.projeto_id / "cortes" / corte.id
        final_pronto = (corte_dir / "upload_ready" / "video.mp4").exists()
        # Quando final existe, todas as fases anteriores foram percorridas — mesmo
        # que o retention tenha limpado um intermediário, vale marcar como pronto.
        grade_pronta = final_pronto or (corte_dir / "graded" / "clip_graded.mp4").exists()
        overlays_prontos = final_pronto or _overlays_existem(corte_dir / "overlays")
        resultado[corte.id] = (final_pronto, grade_pronta, overlays_prontos)
    return resultado


@router.get("/projeto/{projeto_id}/status")
async def status_export(projeto_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Corte)
        .where(Corte.projeto_id == projeto_id)
        .where(
            Corte.status.in_(
                [
                    StatusCorte.APROVADO,
                    StatusCorte.PROCESSADO,
                ]
            )
        )
        .order_by(Corte.numero)
    )
    cortes = result.scalars().all()

    # D-651: era uma consulta de metadados POR CORTE (N+1) — num projeto com 30
    # cortes aprovados, 30 idas ao banco para montar uma tela só. Uma consulta
    # com `IN` traz todos de uma vez.
    metadados = {}
    if cortes:
        linhas = await db.execute(
            select(MetadadoCorte).where(MetadadoCorte.corte_id.in_([c.id for c in cortes]))
        )
        metadados = {meta.corte_id: meta for meta in linhas.scalars()}

    # D-651/D-645: a varredura de disco (um `exists` e um `glob` por corte) sai do
    # event loop. São dezenas de idas ao disco numa rota que a tela repete.
    artefatos = await asyncio.to_thread(_artefatos_de_cada_corte, cortes)

    items = []
    for corte in cortes:
        meta = metadados.get(corte.id)
        final_pronto, grade_pronta, overlays_prontos = artefatos[corte.id]

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
                # D-516: o TikTok e publicacao MANUAL — so o operador sabe que
                # aconteceu, e ele diz isso pelo botao "publiquei" (D-512). Sem
                # trafegar a marca, a tela esquece a confirmacao ao reabrir e
                # pergunta de novo por um corte que ja subiu.
                "tiktok_publicado_em": (
                    corte.tiktok_publicado_em.isoformat() if corte.tiktok_publicado_em else ""
                ),
            }
        )
    return {"projeto_id": projeto_id, "cortes": items}


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


class LiberarPublicacaoRequest(BaseModel):
    """Qual destino deixou de ter este vídeo. Default no YouTube: é o destino
    que bloqueia o re-upload, e o motivo de 9 em 10 chamadas."""

    destino: str = "youtube"


@router.post("/corte/{corte_id}/publicacao/liberar")
async def liberar_publicacao_do_corte(corte_id: str, body: LiberarPublicacaoRequest):
    """Desfaz a marca de publicação de um destino (D-566).

    O espelho de `marcar-publicado`: aquele ensina o app que o vídeo está lá
    fora, este ensina que não está mais. Existe porque apagar o vídeo no
    YouTube para reprocessar deixava o corte preso — o botão de enviar some
    quando há URL publicada, a lista de massa filtra publicados fora e o
    próprio upload responde "já publicado; upload ignorado".

    Não apaga nada na plataforma nem no disco: só a memória do app.
    """
    operational_info(
        "router",
        f"📥 Solicitação: liberar publicação de '{corte_id}' em {body.destino}",
    )
    try:
        resultado = await liberar_publicacao(corte_id, body.destino)
    except Exception as e:
        raise erro_interno(e) from e

    if resultado.get("status") == "erro":
        mensagem = resultado.get("mensagem", "Erro ao liberar a publicação do corte.")
        mensagem_lower = mensagem.lower()
        if "não encontrado" in mensagem_lower or "nao encontrado" in mensagem_lower:
            raise HTTPException(status_code=404, detail=mensagem)
        raise HTTPException(status_code=400, detail=mensagem)

    return resultado


class BulkProcessarRequest(BaseModel):
    corte_ids: list[str]
    filtro: str = "nenhum"


@router.get("/fila-global")
async def fila_global(db: AsyncSession = Depends(get_db)):
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
        # D-417: inventário item a item de todo trabalho pesado (bruto, pós,
        # render, YouTube, consultas de IA e demais tarefas de background) que
        # alimenta a fila global do Workbench. Os contadores acima seguem
        # intactos para quem já os consome.
        "jobs": await JobsGlobais.coletar_descritos(db),
    }


class CancelarJobRequest(BaseModel):
    job_id: str


@router.post("/fila-global/cancelar")
async def cancelar_job_da_fila(body: CancelarJobRequest):
    """Interrompe um job da fila global (D-426).

    Antes disso, a única saída para um render travado era derrubar a
    aplicação. O `job_id` é o mesmo que `/fila-global` publica.
    """
    try:
        return cancelar_job(body.job_id)
    except CancelamentoNaoSuportado as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except JobNaoEstaEmVoo as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
