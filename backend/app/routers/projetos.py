import json
import logging
import uuid
from datetime import UTC, datetime

from app.channel_paths import projetos_dir
from app.database import get_db
from app.models import Corte, MetadadoCorte, Projeto, StatusCorte, StatusProjeto
from app.routers.errors import erro_interno
from app.services import channels
from app.services.analise import AnaliseService
from app.services.app_logging import operational_error, operational_info
from app.services.app_settings import AppSettingsService
from app.services.export import ExportService
from app.services.ingestao import IngestaoService
from app.services.pipeline_render import FONTE_PRESETS_VALIDOS
from app.services.projeto import ProjetoService
from app.services.tasks import fire_and_forget
from app.services.youtube_palco import ensure_palco_png
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy import delete as sa_delete
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────


class CriarProjetoRequest(BaseModel):
    youtube_url: str
    canal_origem: str | None = None


class ProjetoResponse(BaseModel):
    id: str
    youtube_url: str
    titulo_live: str
    canal_origem: str
    duracao_segundos: int
    data_live: str = ""
    status: str
    progresso_download: float
    arquivo_video_path: str
    # I-023: filtro_padrao por projeto removido (vivia em Projeto.filtro_padrao).
    # Quem precisa do filtro de render usa GET /api/settings → filtro_global_padrao.
    arquivos_limpos: bool = False
    criado_em: datetime
    ultima_analise_em: datetime | None = None
    # Renderer V1 desativado — projetos sempre operam em V2.
    versao_renderer: str = "v2"
    sombra_nivel_padrao: str = "nenhuma"
    layout_card_padrao: str = "vertical"
    layout_youtube_padrao: str | None = None
    fonte_preset: str = "atual"
    # F-052: pontuação herdada do ranking de lives no momento do download.
    pontuacao_ranking: float = 0.0
    total_cortes: int = 0
    total_publicados: int = 0
    total_aprovados: int = 0
    total_com_raw: int = 0
    total_video_pronto: int = 0
    total_com_meta: int = 0
    total_publicos: int = 0  # cortes já visíveis ao público
    proxima_publicacao: str = ""  # ISO8601 do próximo corte que ainda não é público
    erro_msg: str | None = None

    class Config:
        from_attributes = True


class AtualizarRenderConfigRequest(BaseModel):
    """Patch de configuração de render por projeto: versão (v1/v2) e/ou
    nível padrão de sombra para cenas com sombra_nivel='auto'."""

    versao_renderer: str | None = None  # "v1" | "v2"
    sombra_nivel_padrao: str | None = None  # "nenhuma" | "leve" | "media" | "forte"
    layout_card_padrao: str | None = None  # "horizontal" | "vertical"
    layout_youtube_padrao: str | None = None
    global_update: bool = False
    fonte_preset: str | None = None


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.post("", response_model=ProjetoResponse, status_code=201)
async def criar_projeto(body: CriarProjetoRequest, db: AsyncSession = Depends(get_db)):
    """Cria um novo projeto e inicia o download em background."""
    # I-023: filtro_padrao por projeto removido. O render lê
    # AppSettings.filtro_global_padrao direto em runtime.
    projeto = Projeto(
        id=str(uuid.uuid4()),
        youtube_url=body.youtube_url,
        canal_origem=body.canal_origem or channels.identidade_do_canal_ativo().handle,
        status=StatusProjeto.PENDENTE,
    )
    db.add(projeto)
    await db.commit()
    await db.refresh(projeto)

    # Dispara download em background (não bloqueia a resposta)
    fire_and_forget(
        IngestaoService.processar_projeto(projeto.id, body.youtube_url),
        name=f"ingestao-{projeto.id[:8]}",
    )

    return projeto


@router.post("/{projeto_id}/reiniciar-download")
async def reiniciar_download(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Reseta projeto com erro/baixando para pendente e reinicia o download."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if projeto.status not in (StatusProjeto.ERRO, StatusProjeto.BAIXANDO, StatusProjeto.PENDENTE):
        raise HTTPException(
            status_code=400,
            detail=f"Projeto está em status '{projeto.status}' — só é possível reiniciar quando em erro, baixando ou pendente",
        )

    projeto.status = StatusProjeto.PENDENTE
    projeto.erro_msg = ""
    projeto.arquivo_video_path = ""
    projeto.transcricao_raw = None
    projeto.titulo_live = ""
    projeto.duracao_segundos = 0
    projeto.progresso_download = 0
    await db.commit()

    fire_and_forget(
        IngestaoService.processar_projeto(projeto_id, projeto.youtube_url),
        name=f"ingestao-retry-{projeto_id[:8]}",
    )
    return {"message": "Download reiniciado", "projeto_id": projeto_id}


@router.post("/reiniciar-downloads-falhados")
async def reiniciar_downloads_falhados(db: AsyncSession = Depends(get_db)):
    """Reinicia o download de todos os projetos com status 'erro' que não têm vídeo."""
    result = await db.execute(
        select(Projeto).where(
            Projeto.status == StatusProjeto.ERRO,
            (Projeto.arquivo_video_path.is_(None) | (Projeto.arquivo_video_path == "")),
        )
    )
    projetos = result.scalars().all()
    operational_info("REINICIAR-FALHADOS", f"candidatos encontrados: {len(projetos)}")
    if not projetos:
        return {"message": "Nenhum projeto com falha de download encontrado", "total": 0, "ids": []}

    ids = []
    for projeto in projetos:
        projeto.status = StatusProjeto.PENDENTE
        projeto.erro_msg = ""
        projeto.arquivo_video_path = ""
        projeto.transcricao_raw = ""
        projeto.titulo_live = ""
        projeto.duracao_segundos = 0
        projeto.progresso_download = 0
        ids.append(projeto.id)

    await db.commit()

    for projeto_id in ids:
        projeto = await db.get(Projeto, projeto_id)
        fire_and_forget(
            IngestaoService.processar_projeto(projeto_id, projeto.youtube_url),
            name=f"ingestao-retry-{projeto_id[:8]}",
        )

    return {"message": f"{len(ids)} downloads reiniciados", "total": len(ids), "ids": ids}


@router.get("", response_model=list[ProjetoResponse])
async def listar_projetos(db: AsyncSession = Depends(get_db)):
    """
    Lista todos os projetos ordenados por data_live.
    Usa 2 queries SQL com GROUP BY para evitar o padrão N+1.
    """

    result = await db.execute(
        select(Projeto).order_by(
            Projeto.data_live.desc(),
            Projeto.criado_em.desc(),
        )
    )
    projetos = result.scalars().all()
    if not projetos:
        return []

    corte_stats_res = await db.execute(
        select(
            Corte.projeto_id,
            func.count(case((Corte.status != StatusCorte.REJEITADO, 1))).label("total"),
            func.count(
                case(
                    (
                        and_(
                            Corte.status != StatusCorte.REJEITADO,
                            Corte.youtube_video_id.is_not(None),
                            Corte.youtube_video_id != "",
                        ),
                        1,
                    )
                )
            ).label("publicados"),
            func.count(case((Corte.status == StatusCorte.APROVADO, 1))).label("aprovados"),
            func.count(
                case(
                    (
                        and_(
                            Corte.status == StatusCorte.APROVADO,
                            Corte.arquivo_clip_path.is_not(None),
                            Corte.arquivo_clip_path != "",
                        ),
                        1,
                    )
                )
            ).label("com_raw"),
        )
        .where(Corte.projeto_id.in_([p.id for p in projetos]))
        .group_by(Corte.projeto_id)
    )
    corte_stats = {row.projeto_id: row for row in corte_stats_res.all()}

    meta_stats_res = await db.execute(
        select(
            Corte.projeto_id,
            func.count(MetadadoCorte.id).label("com_meta"),
        )
        .join(MetadadoCorte, MetadadoCorte.corte_id == Corte.id)
        .where(
            Corte.projeto_id.in_([p.id for p in projetos]),
            Corte.status == StatusCorte.APROVADO,
            MetadadoCorte.titulo_youtube != "",
            MetadadoCorte.titulo_youtube.is_not(None),
        )
        .group_by(Corte.projeto_id)
    )
    meta_stats = {row.projeto_id: row.com_meta for row in meta_stats_res.all()}

    aprovados_res = await db.execute(
        select(
            Corte.projeto_id,
            Corte.id,
            Corte.youtube_video_id,
            Corte.youtube_scheduled_at,
        ).where(
            Corte.projeto_id.in_([p.id for p in projetos]),
            Corte.status == StatusCorte.APROVADO,
        )
    )
    aprovados_rows = aprovados_res.all()

    _projetos_dir = projetos_dir()
    _agora = datetime.now(UTC)

    video_pronto_count: dict[str, int] = {}
    publicos_count: dict[str, int] = {}
    proxima_pub: dict[str, str] = {}  # projeto_id -> ISO8601 mais próximo no futuro

    for proj_id, corte_id, yt_id, scheduled_at in aprovados_rows:
        video_pronto_count.setdefault(proj_id, 0)
        publicos_count.setdefault(proj_id, 0)

        if yt_id:
            video_pronto_count[proj_id] += 1
            # Determina se já é público
            if not scheduled_at:
                # Upload sem agendamento -> unlisted (quem tem link assiste) -> conta como acessível
                publicos_count[proj_id] += 1
            else:
                try:
                    pub_dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
                    if pub_dt.tzinfo is None:
                        pub_dt = pub_dt.replace(tzinfo=UTC)
                    if _agora >= pub_dt:
                        publicos_count[proj_id] += 1
                    else:
                        # Ainda no futuro -> candidato à próxima publicação
                        atual = proxima_pub.get(proj_id)
                        if not atual or scheduled_at < atual:
                            proxima_pub[proj_id] = scheduled_at
                except Exception:
                    publicos_count[proj_id] += 1  # se não deu parse, considera acessível
        else:
            upload_ready = (
                _projetos_dir / proj_id / "cortes" / corte_id / "upload_ready" / "video.mp4"
            )
            if upload_ready.exists():
                video_pronto_count[proj_id] += 1

    resp = []
    for p in projetos:
        stats = corte_stats.get(p.id)
        d = {c: getattr(p, c) for c in p.__table__.columns.keys()}
        d["total_cortes"] = stats.total if stats else 0
        d["total_publicados"] = stats.publicados if stats else 0
        d["total_aprovados"] = stats.aprovados if stats else 0
        d["total_com_raw"] = stats.com_raw if stats else 0
        d["total_com_meta"] = meta_stats.get(p.id, 0)
        d["total_video_pronto"] = video_pronto_count.get(p.id, 0)
        d["total_publicos"] = publicos_count.get(p.id, 0)
        d["proxima_publicacao"] = proxima_pub.get(p.id, "")
        resp.append(d)

    return resp


@router.get("/{projeto_id}/transcricao-preview")
async def get_transcricao_preview(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna os primeiros segmentos da transcrição bruta para conferência de sincronia no UI."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto or not projeto.transcricao_raw:
        return []
    try:
        trans = json.loads(projeto.transcricao_raw)
        # Retorna apenas os 5 primeiros para preview leve
        return trans[:5]
    except Exception:
        return []


@router.patch("/{projeto_id}/transcricao")
async def atualizar_transcricao_projeto(
    projeto_id: str, body: dict, db: AsyncSession = Depends(get_db)
):
    """Atualiza a transcrição bruta do projeto e sincroniza todos os cortes."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    nova_trans = body.get("transcricao")
    if nova_trans is None:
        raise HTTPException(status_code=400, detail="Campo 'transcricao' é obrigatório")

    projeto.transcricao_raw = json.dumps(nova_trans, ensure_ascii=False)

    # Sincroniza todos os cortes vinculados para refletir a mudança (texto ou tempo)
    from app.services.corte import CorteService

    # Carrega cortes se necessário
    res_cortes = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
    cortes = res_cortes.scalars().all()

    for corte in cortes:
        await CorteService.sincronizar_transcricao_corte(corte.id, db=db)

    await db.commit()
    return {
        "message": "Transcrição do projeto atualizada com sucesso",
        "total_cortes_sincronizados": len(cortes),
    }


@router.get("/{projeto_id}", response_model=ProjetoResponse)
async def obter_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    return projeto


@router.get("/{projeto_id}/auditoria-analise")
async def obter_auditoria_analise(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """I-034: retorna o audit trail da última análise IA do projeto.

    - `cortes`: lista enxuta de cortes com `justificativa`, `duracao_min`,
      `tema_central` — pensada para um painel de auditoria.
    - `descartados`: blocos NÃO_RECOMENDADOS marcados pela skill cortador-expert.
    - `total_cortes`: cardinality.
    - `duracao_media_min`: média ponderada para diagnóstico (cortes encolhendo?).
    """
    import json as _json

    from sqlalchemy import select as sa_select

    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    result = await db.execute(
        sa_select(Corte).where(Corte.projeto_id == projeto_id).order_by(Corte.numero)
    )
    cortes = result.scalars().all()

    cortes_payload = []
    soma_dur = 0.0
    for c in cortes:
        dur_seg = max(0.0, (c.fim_seg or 0.0) - (c.inicio_seg or 0.0))
        soma_dur += dur_seg
        cortes_payload.append(
            {
                "id": c.id,
                "numero": c.numero,
                "titulo_proposto": c.titulo_proposto or "",
                "tema_central": c.tema_central or "",
                "justificativa": c.justificativa or "",
                "inicio_hms": c.inicio_hms,
                "fim_hms": c.fim_hms,
                "duracao_min": round(dur_seg / 60.0, 1),
                "status": c.status,
            }
        )

    try:
        descartados = _json.loads(projeto.descartados_analise or "[]")
        if not isinstance(descartados, list):
            descartados = []
    except (ValueError, TypeError):
        descartados = []

    return {
        "projeto_id": projeto_id,
        "ultima_analise_em": projeto.ultima_analise_em,
        "total_cortes": len(cortes_payload),
        "duracao_media_min": (
            round(soma_dur / len(cortes_payload) / 60.0, 1) if cortes_payload else 0.0
        ),
        "cortes": cortes_payload,
        "descartados": descartados,
    }


@router.patch("/{projeto_id}/render-config", response_model=ProjetoResponse)
async def atualizar_render_config(
    projeto_id: str,
    body: AtualizarRenderConfigRequest,
    db: AsyncSession = Depends(get_db),
):
    """Atualiza versao_renderer e/ou sombra_nivel_padrao do projeto.

    Ambos os campos são opcionais — só os enviados são atualizados.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    sombras_validas = {"nenhuma", "leve", "media", "forte"}
    layouts_validos = {"horizontal", "vertical"}

    # V1 desativada — ignoramos silenciosamente `body.versao_renderer` mesmo
    # quando o frontend continua mandando o campo (clientes antigos / drafts
    # em cache). Persistimos sempre "v2" via default do model.

    if body.sombra_nivel_padrao is not None:
        if body.sombra_nivel_padrao not in sombras_validas:
            raise HTTPException(
                status_code=400,
                detail=f"sombra_nivel_padrao inválida. Aceitos: {sorted(sombras_validas)}",
            )
        projeto.sombra_nivel_padrao = body.sombra_nivel_padrao

    if body.layout_card_padrao is not None:
        if body.layout_card_padrao not in layouts_validos:
            raise HTTPException(
                status_code=400,
                detail=f"layout_card_padrao inválido. Aceitos: {sorted(layouts_validos)}",
            )
        projeto.layout_card_padrao = body.layout_card_padrao

    if body.layout_youtube_padrao is not None:
        if body.global_update:
            # F-020: o layout COMPARTILHADO e um preset PER-SHOW (formato per-show),
            # nao per-projeto. Toda live usa a mesma composicao de fundo/placa/
            # posicoes. Por isso "Definir como Padrao" propaga para TODOS os projetos
            # — assim "Usar Padrao" em qualquer corte de qualquer projeto encontra
            # o preset, e o auto-init na primeira abertura do corte tambem.
            await db.execute(
                sa_update(Projeto).values(layout_youtube_padrao=body.layout_youtube_padrao)
            )
            # F-024: ALEM de replicar em todos os projetos (mantem F-020 ativo),
            # persistir no AppSettings global para que "Usar Global" no frontend
            # tenha uma fonte explicita do escopo global. Permite ao usuario
            # ter "Padrao Projeto" diferente de "Padrao Global".
            AppSettingsService.update_youtube_layout_padrao_global(body.layout_youtube_padrao)
        else:
            # F-021: Permite definir o layout padrão apenas para o projeto atual
            projeto.layout_youtube_padrao = body.layout_youtube_padrao

    if hasattr(body, "fonte_preset") and body.fonte_preset is not None:
        if body.fonte_preset not in FONTE_PRESETS_VALIDOS:
            raise HTTPException(
                status_code=400,
                detail=f"fonte_preset inválido. Aceitos: {sorted(FONTE_PRESETS_VALIDOS)}",
            )
        projeto.fonte_preset = body.fonte_preset

    await db.commit()
    await db.refresh(projeto)

    # Pré-gera o PNG do "palco" (fundo+chrome+placa) p/ o layout padrão em
    # background — assim o render final acha o PNG em cache (Variante A, F-020).
    # Idempotente + dedupe no service; render cai no fallback se ainda não pronto.
    if body.layout_youtube_padrao is not None:
        fire_and_forget(
            ensure_palco_png(projeto.layout_youtube_padrao),
            name=f"palco-png-{projeto.id[:8]}",
        )

    return projeto


@router.get("/{projeto_id}/video-proxy")
async def video_proxy(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Serve o vídeo original do projeto para uso no player de edição."""
    from fastapi.responses import RedirectResponse

    video_path = await ProjetoService.obter_video_proxy_path(projeto_id, db)
    if not video_path:
        raise HTTPException(status_code=404, detail="Vídeo original do projeto não encontrado")

    return RedirectResponse(url=f"/videos/{projeto_id}/{video_path.name}")


@router.delete("/{projeto_id}")
async def deletar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    sucesso = await ProjetoService.deletar_projeto(projeto_id, db)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    return {"message": "Projeto excluído com sucesso"}


@router.post("/{projeto_id}/limpar-arquivos")
async def limpar_arquivos_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    resultado = await ProjetoService.limpar_arquivos_projeto(projeto_id, db)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    return resultado


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
    csv_path = await ExportService.gerar_csv_losslesscut(projeto_id)
    return FileResponse(
        csv_path, media_type="text/csv", filename=f"projeto_{projeto_id[:8]}_losslesscut.csv"
    )


@router.get("/{projeto_id}/analise/prompt")
async def exportar_prompt_analise(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Retorna o prompt de análise de transcrição sem chamar o n8n."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")
    try:
        return await AnaliseService.montar_prompt(projeto_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


class SincroniaLegendaRequest(BaseModel):
    offset_segundos: float


@router.put("/{projeto_id}/sincronia-legenda")
async def atualizar_sincronia_legenda(
    projeto_id: str, body: SincroniaLegendaRequest, db: AsyncSession = Depends(get_db)
):
    """Atualiza o offset manual da legenda e reprocessa a transcrição do vídeo."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    projeto.legenda_offset_ms = int(body.offset_segundos * 1000)

    # Atualiza a transcrição raw no banco
    try:

        from app.services.ingestao import IngestaoService

        projeto_dir = projetos_dir() / projeto_id
        if not projeto_dir.exists():
            raise Exception("Diretório do projeto não encontrado")

        nova_transcricao = await IngestaoService._extrair_legenda(
            projeto.id,
            projeto.youtube_url,
            projeto.arquivo_video_path,
            legenda_offset_ms=projeto.legenda_offset_ms,
        )
        import json

        projeto.transcricao_raw = json.dumps(nova_transcricao, ensure_ascii=False)

        # 3. Sincronizar os cortes existentes para aplicar o novo offset neles também
        from app.models import Corte
        from app.services.corte import CorteService
        from sqlalchemy import select

        result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
        cortes = result.scalars().all()
        for corte in cortes:
            await CorteService.sincronizar_transcricao_corte(corte.id, db=db)

        await db.commit()

    except Exception as e:
        operational_error("ProjetosRouter", f"Erro ao reprocessar legenda: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao reprocessar legenda: {str(e)}") from e

    return {
        "message": "Sincronia atualizada e transcrição reprocessada para todo o projeto",
        "offset_ms": projeto.legenda_offset_ms,
        "cortes_sincronizados": len(cortes) if "cortes" in locals() else 0,
    }


class ImportarAnaliseRequest(BaseModel):
    cortes: list


@router.post("/{projeto_id}/analise/importar")
async def importar_analise(
    projeto_id: str, body: ImportarAnaliseRequest, db: AsyncSession = Depends(get_db)
):
    """Importa cortes gerados por IA externa e salva como se fosse resultado do n8n."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    try:
        await AnaliseService.importar_resultado(projeto_id, body.cortes)
        return {"message": "Análise importada com sucesso", "total_cortes": len(body.cortes)}
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{projeto_id}/analisar")
async def analisar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara análise da transcrição via n8n."""
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")

    fire_and_forget(
        AnaliseService.analisar_transcricao(projeto_id),
        name=f"analise-{projeto_id[:8]}",
    )
    return {"message": "Análise iniciada", "projeto_id": projeto_id}


@router.post("/{projeto_id}/reanalisar")
async def reanalisar_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """
    Apaga todos os cortes existentes e reinicia a análise da transcrição do zero.
    Útil quando se quer gerar novos cortes com o guia atualizado.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")

    result = await db.execute(sa_delete(Corte).where(Corte.projeto_id == projeto_id))
    cortes_removidos = result.rowcount

    # Volta status para 'pronto' para que a análise possa ser disparada
    projeto.status = StatusProjeto.PRONTO
    await db.commit()

    logger.info(
        f"[Reanálise] Projeto {projeto_id[:8]}: {cortes_removidos} cortes removidos. "
        f"Disparando nova análise..."
    )

    fire_and_forget(
        AnaliseService.analisar_transcricao(projeto_id),
        name=f"reanalise-{projeto_id[:8]}",
    )

    return {
        "message": "Reanálise iniciada",
        "projeto_id": projeto_id,
        "cortes_removidos": cortes_removidos,
    }


class AnalisarIntervaloRequest(BaseModel):
    inicio_hms: str  # ex: "02:00:00"
    fim_hms: str  # ex: "04:00:00"


@router.post("/{projeto_id}/analisar-intervalo")
async def analisar_intervalo(
    projeto_id: str,
    body: AnalisarIntervaloRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Gera novos cortes para um intervalo de tempo específico da transcrição
    e os adiciona ao projeto sem remover os cortes existentes.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.transcricao_raw:
        raise HTTPException(status_code=400, detail="Projeto ainda sem transcrição")

    from app.domain.time_convert import hms_to_seg

    try:
        inicio_seg = hms_to_seg(body.inicio_hms)
        fim_seg = hms_to_seg(body.fim_hms)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    if fim_seg <= inicio_seg:
        raise HTTPException(status_code=422, detail="fim_hms deve ser maior que inicio_hms")

    try:
        resultado = await AnaliseService.analisar_intervalo(projeto_id, inicio_seg, fim_seg)
        return {
            "message": f"{resultado['novos_cortes']} novos cortes adicionados a partir do #{resultado['primeiro_numero']}",
            **resultado,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro na análise do intervalo: {e}") from e


@router.get("/{projeto_id}/analise-intervalo/prompt")
async def exportar_prompt_analise_intervalo(
    projeto_id: str,
    inicio_hms: str,
    fim_hms: str,
    blocos: int | None = None,
):
    """
    Retorna o prompt particionado para análise de um intervalo específico.
    """
    from app.domain.time_convert import hms_to_seg

    try:
        inicio_seg = hms_to_seg(inicio_hms)
        fim_seg = hms_to_seg(fim_hms)
        if fim_seg <= inicio_seg:
            raise ValueError("fim_hms deve ser maior que inicio_hms")
        if blocos is not None and (blocos < 1 or blocos > 20):
            raise ValueError("blocos deve estar entre 1 e 20")
        return await AnaliseService.montar_prompt_intervalo(projeto_id, inicio_seg, fim_seg, blocos)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{projeto_id}/analise-intervalo/importar")
async def importar_analise_intervalo(projeto_id: str, body: ImportarAnaliseRequest):
    """
    Importa o resultado de uma análise manual de intervalo.
    Funciona igual ao importar global, pois os cortes são sempre apendados ao projeto (no AnaliseService isso é decidido,
    mas AnaliseService.importar_resultado não remove os existentes).
    """
    try:
        await AnaliseService.importar_resultado(projeto_id, body.cortes)
        return {"message": f"{len(body.cortes)} cortes importados com sucesso para o intervalo."}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{projeto_id}/refazer-transcricao")
async def refazer_transcricao(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """
    Baixa novamente a transcrição (agora via json3) e sincroniza os cortes existentes.
    """
    projeto = await db.get(Projeto, projeto_id)
    if not projeto:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if not projeto.youtube_url or not projeto.arquivo_video_path:
        raise HTTPException(
            status_code=400,
            detail="Projeto precisa ter um vídeo já baixado para refazer a transcrição.",
        )

    try:
        from app.services.corte import CorteService

        # 1. Extrair nova transcrição via IngestaoService
        transcricao = await IngestaoService._extrair_legenda(
            projeto_id,
            projeto.youtube_url,
            projeto.arquivo_video_path,
            legenda_offset_ms=projeto.legenda_offset_ms,
        )

        # 2. Atualizar transcrição no projeto
        projeto.transcricao_raw = json.dumps(transcricao, ensure_ascii=False)
        await db.commit()

        # 3. Sincronizar os cortes existentes
        result = await db.execute(select(Corte).where(Corte.projeto_id == projeto_id))
        cortes = result.scalars().all()
        for corte in cortes:
            await CorteService.sincronizar_transcricao_corte(corte.id, db=db)

        return {
            "message": "Transcrição atualizada com sucesso.",
            "total_cortes_sincronizados": len(cortes),
        }
    except Exception as e:
        logger.exception("Erro ao refazer transcrição")
        raise erro_interno(e) from e


@router.websocket("/{projeto_id}/ws")
async def websocket_progresso(websocket: WebSocket, projeto_id: str):
    """WebSocket para acompanhar progresso de download em tempo real."""
    await websocket.accept()
    try:
        async for update in IngestaoService.stream_progresso(projeto_id):
            await websocket.send_json(update)
            if update.get("status") in ("pronto", "erro"):
                break
    except WebSocketDisconnect:
        pass


