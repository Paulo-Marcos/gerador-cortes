import json
import logging
import os
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from app.channel_paths import projetos_dir, resolver_do_projeto
from app.database import get_db
from app.domain.corte_mapper import (
    extrair_cenas_remotion,
)
from app.domain.youtube_layout import aplicar_layout_card_por_contexto, normalizar_layout_youtube
from app.models import Corte, Projeto, StatusCorte
from app.routers.cortes_helpers import (
    _corte_to_dict,
    _hms_to_seg,
    _limpar_pasta_corte_pos_sync,
)
from app.routers.cortes_schemas import (
    AdicionarDesvioRequest,
    AtualizarCorteRequest,
    CorteResponse,
    CriarCorteDesvioRequest,
    CriarCorteManualRequest,
    DecisaoSegmentoRequest,
    DividirCorteRequest,
    GerarBrutoRequest,
    ImportarCenasRequest,
    ImportarDesviosRequest,
    RemoverDesvioRequest,
    RenderPipelineRequest,
    ReordenarCortesRequest,
    ValidarCenasRequest,
)
from app.routers.errors import erro_interno
from app.services.cenas_remotion import CenasRemotionService
from app.services.corte import AtualizarCorteDTO, CorteService
from app.services.deteccao_segmentos import (
    VALORES_ACEITOS_DECISAO,
    aplicar_decisao_segmento,
    deteccao_em_andamento,
    executar_deteccao_segmentos,
    materializar_regiao_em_layout,
)
from app.services.export import ExportService
from app.services.media_proxy import MediaProxyService
from app.services.remotion_render import RemotionRenderService
from app.services.render_progress import RenderProgressStore
from app.services.tasks import fire_and_forget
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

router = APIRouter()


# Schemas e helpers puros vivem em cortes_schemas / cortes_helpers (E-006).


# ─── Variável global para props ativas do Remotion ──────────────────────────
_remotion_active_props: dict = {}


# ─── Endpoints (rotas fixas ANTES das rotas com {corte_id}) ─────────────────


@router.get("/remotion/active-props")
async def obter_remotion_active_props():
    """Retorna as props ativas para o Remotion Studio buscar automaticamente."""
    if not _remotion_active_props:
        return {}  # Retorna vazio ao invés de 404 para não poluir os logs do Uvicorn durante o render
    return _remotion_active_props


@router.get("/{corte_id}", response_model=CorteResponse)
async def obter_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    corte = result.scalar_one_or_none()
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    return _corte_to_dict(corte)


@router.post("/{corte_id}/sincronizar-transcricao", response_model=CorteResponse)
async def sincronizar_transcricao(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Força o recálculo da transcrição final (limpa) com base nos cortes atuais."""
    try:
        await CorteService.sincronizar_transcricao_corte(corte_id)
        result = await db.execute(
            select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        )
        corte = result.scalar_one_or_none()
        if not corte:
            raise HTTPException(status_code=404, detail="Corte não encontrado")
        return _corte_to_dict(corte)
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/projeto/{projeto_id}", response_model=list[CorteResponse])
async def listar_cortes_do_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Corte)
        .options(selectinload(Corte.metadado))
        .where(Corte.projeto_id == projeto_id)
        .order_by(Corte.numero)
    )

    return [_corte_to_dict(c) for c in result.scalars().all()]


@router.post("/projeto/{projeto_id}/manual", response_model=CorteResponse)
async def criar_corte_manual(
    projeto_id: str,
    body: CriarCorteManualRequest,
    db: AsyncSession = Depends(get_db),
):
    """Cria um corte manualmente a partir de [inicio_hms, fim_hms] (F-056).

    Sincroniza a transcrição automaticamente para popular `transcricao_corte`
    e `transcricao_final`. A busca de trechos a remover (Gemini) fica a cargo
    do frontend, chamando POST /cortes/{id}/analisar-desvios-ia em seguida.
    """
    try:
        corte = await CorteService.criar_manual(
            db, projeto_id, body.inicio_hms, body.fim_hms, body.titulo_proposto
        )
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return _corte_to_dict(corte)


@router.post("/projeto/{projeto_id}/reordenar", response_model=list[CorteResponse])
async def reordenar_cortes(
    projeto_id: str,
    body: ReordenarCortesRequest,
    db: AsyncSession = Depends(get_db),
):
    """F-057: renumera os cortes do projeto seguindo a ordem informada.

    Body deve listar exatamente os ids existentes (mesmo conjunto). Retorna
    a lista ja na nova ordem.
    """
    try:
        cortes = await CorteService.reordenar(db, projeto_id, body.cortes_ids)
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return [_corte_to_dict(c) for c in cortes]


@router.patch("/{corte_id}", response_model=CorteResponse)
async def atualizar_corte(
    corte_id: str, body: AtualizarCorteRequest, db: AsyncSession = Depends(get_db)
):
    dados = AtualizarCorteDTO(**body.model_dump())
    try:
        corte = await CorteService.atualizar(db, corte_id, dados)
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return _corte_to_dict(corte)


@router.post("/{corte_id}/aprovar")
async def aprovar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    corte.status = StatusCorte.APROVADO
    await db.commit()
    return {"message": "Corte aprovado", "corte_id": corte_id}


@router.delete("/{corte_id}")
async def deletar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    projeto_id = corte.projeto_id

    await db.delete(corte)
    await db.commit()

    corte_dir = projetos_dir() / projeto_id / "cortes" / corte_id
    if corte_dir.exists():
        shutil.rmtree(corte_dir, ignore_errors=True)

    return {"message": "Corte deletado com sucesso", "corte_id": corte_id}


@router.post("/{corte_id}/remover-desvio", response_model=CorteResponse)
async def remover_desvio(
    corte_id: str, body: RemoverDesvioRequest, db: AsyncSession = Depends(get_db)
):
    """Remove um desvio do corte sem criar novo corte."""
    try:
        corte = await CorteService.remover_desvio(db, corte_id, body.desvio_index)
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return _corte_to_dict(corte)


@router.post("/{corte_id}/adicionar-desvio", response_model=CorteResponse)
async def adicionar_desvio(
    corte_id: str, body: AdicionarDesvioRequest, db: AsyncSession = Depends(get_db)
):
    """Adiciona um desvio criado manualmente ao corte."""
    try:
        corte = await CorteService.adicionar_desvio(
            db, corte_id, body.inicio_hms, body.fim_hms, body.motivo
        )
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return _corte_to_dict(corte)


@router.post("/{corte_id}/corte-do-desvio", response_model=CorteResponse)
async def criar_corte_do_desvio(
    corte_id: str, body: CriarCorteDesvioRequest, db: AsyncSession = Depends(get_db)
):
    """Cria um novo Corte a partir de um desvio e remove o desvio do corte original."""
    try:
        novo_corte = await CorteService.criar_corte_do_desvio(
            db, corte_id, body.desvio_index, body.titulo
        )
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e
    return _corte_to_dict(novo_corte)


@router.post("/{corte_id}/dividir", response_model=list[CorteResponse])
async def dividir_corte(
    corte_id: str, body: DividirCorteRequest, db: AsyncSession = Depends(get_db)
):
    """F-061: divide um corte em dois no ponto informado (ponteiro do player).

    O corte original passa a terminar no ponto; um novo corte é criado a partir
    do ponto até o fim original, herdando os trechos a remover (desvios) da
    metade direita (o desvio que cruza o ponto é fatiado). Os cortes posteriores
    são renumerados. Retorna `[corte_original_atualizado, corte_novo]`.
    """
    if body.ponto_seg is None and not body.ponto_hms:
        raise HTTPException(status_code=400, detail="Informe ponto_seg ou ponto_hms.")
    ponto = body.ponto_seg if body.ponto_seg is not None else _hms_to_seg(body.ponto_hms)

    try:
        original_id, novo_id = await CorteService.dividir_corte(corte_id, float(ponto))
    except ValueError as e:
        msg = str(e)
        status = 404 if "não encontrado" in msg else 400
        raise HTTPException(status_code=status, detail=msg) from e

    result = await db.execute(
        select(Corte)
        .options(selectinload(Corte.metadado))
        .where(Corte.id.in_([original_id, novo_id]))
    )
    por_id = {c.id: c for c in result.scalars().all()}
    return [_corte_to_dict(por_id[original_id]), _corte_to_dict(por_id[novo_id])]


@router.post("/{corte_id}/gerar-resumo")
async def gerar_resumo_ia(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera um novo resumo maduro via n8n usando a transcrição do corte."""
    try:
        await CorteService.gerar_resumo_ia(corte_id)

        # Recupera o corte atualizado para o frontend reativar tudo automaticamente
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise HTTPException(status_code=404, detail="Corte não encontrado após IA")

        return _corte_to_dict(corte)
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/analisar-desvios")
async def analisar_desvios_corte(
    corte_id: str, limpar_anteriores: bool = False, db: AsyncSession = Depends(get_db)
):
    """Análise Técnica: Usa FFmpeg para detectar silêncios e recalcular a transcrição."""
    try:
        await CorteService.detectar_silencios_tecnico(corte_id, limpar_anteriores=limpar_anteriores)

        stmt = select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        result = await db.execute(stmt)
        corte = result.scalar_one_or_none()

        if not corte:
            raise HTTPException(status_code=404, detail="Corte não encontrado após análise")

        return _corte_to_dict(corte)
    except Exception as e:
        logger.exception("[RouterCortes] ERRO em analisar-desvios/%s: %s", corte_id, e)
        raise erro_interno(e) from e


@router.post("/projeto/{projeto_id}/analisar-desvios-todos")
async def analisar_desvios_todos(projeto_id: str, db: AsyncSession = Depends(get_db)):
    """Dispara análise de desvios via IA para todos os cortes do projeto (em background)."""
    fire_and_forget(
        CorteService.analisar_desvios_todos_impl(projeto_id), name=f"desvios-todos-{projeto_id[:8]}"
    )
    return {"message": f"Análise de desvios iniciada para o projeto {projeto_id}"}


@router.get("/{corte_id}/audio-proxy")
async def audio_proxy_corte(
    corte_id: str, refresh: bool = False, db: AsyncSession = Depends(get_db)
):
    """Gera e serve um arquivo de áudio FLAC apenas do período do corte (com buffer) para o Wavesurfer."""
    try:
        proxy_path = await MediaProxyService.gerar_audio_proxy(corte_id, db, force=refresh)
        if not Path(proxy_path).exists():
            raise HTTPException(status_code=404, detail="Proxy de áudio não pôde ser gerado.")
        # FLAC (proxy_v4) — lossless e sample-accurate, sem priming do MP3
        return FileResponse(proxy_path, media_type="audio/flac")
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/{corte_id}/waveform-peaks")
async def waveform_peaks_corte(
    corte_id: str,
    refresh: bool = False,
    points: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Gera e serve picos reais do áudio para renderizar a waveform sem decodificar FLAC no browser."""
    try:
        return await MediaProxyService.gerar_waveform_peaks(
            corte_id, db, force=refresh, points=points
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/processar-desvios")
async def processar_desvios(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Caminho A: Re-renderiza o vídeo removendo todos os desvios automaticamente."""
    try:
        resultado = await ExportService.processar_desvios_rerender(corte_id)
        if resultado.get("status") == "erro":
            raise HTTPException(status_code=500, detail=resultado.get("mensagem"))

        # Recarrega o corte com os metadados para evitar erro de lazy loading no _corte_to_dict
        stmt = select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
        result = await db.execute(stmt)
        corte = result.scalar_one_or_none()

        if not corte:
            raise HTTPException(status_code=404, detail="Corte não encontrado após processamento")

        return _corte_to_dict(corte)
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/{corte_id}/exportar-losslesscut")
async def exportar_losslesscut(corte_id: str):
    """Caminho B: Gera arquivo LLC do LosslessCut e retorna o caminho do diretório."""
    try:
        csv_path = await ExportService.gerar_csv_desvios_corte(corte_id)
        llc_path = str(csv_path).replace(".csv", "-proj.llc")
        dir_path = os.path.dirname(os.path.abspath(llc_path))

        return {
            "status": "ok",
            "mensagem": "Arquivo .llc gerado com sucesso.",
            "dir_path": dir_path,
            "llc_path": llc_path,
        }
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/{corte_id}/caminho-pasta")
async def obter_caminho_pasta(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Apenas retorna o caminho da pasta do corte (sem gerar arquivos extras)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    dir_path = str(projetos_dir() / corte.projeto_id / "cortes" / corte_id)

    return {"dir_path": dir_path}


@router.get("/{corte_id}/video-renderizado")
async def obter_video_renderizado(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Serve o arquivo de vídeo final re-renderizado (clip_raw.mkv ou clip_raw.mp4)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    path = None
    if corte.arquivo_clip_path:
        path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)

    if not path or not path.exists():
        corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
        for candidate in ["clip_raw.mp4", "clip_raw.mkv", "clip_raw_base.mp4", "clip_raw_base.mkv"]:
            p = corte_dir / candidate
            if p.exists():
                path = p
                break

    if not path or not path.exists():
        raise HTTPException(
            status_code=404, detail="Arquivo físico do vídeo não encontrado no servidor"
        )

    relative_path = f"cortes/{corte_id}/{path.name}"
    from fastapi.responses import RedirectResponse

    return RedirectResponse(url=f"/videos/{corte.projeto_id}/{relative_path}")


@router.get("/{corte_id}/video-bruto")
async def obter_video_bruto(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Serve o arquivo de vídeo bruto (original do corte antes dos tratamentos).

    Acrescenta `?v=<mtime>` na URL de redirecionamento para fazer cache-busting
    automático sempre que o arquivo é regerado.  Sem isso, o navegador
    serve o conteúdo cacheado (duração e metadados antigos) mesmo com o
    `clip_raw.mkv` já atualizado no disco.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    from fastapi.responses import RedirectResponse

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id

    def _redirect_with_cache_buster(file_path: Path) -> RedirectResponse:
        relative_path = f"cortes/{corte_id}/{file_path.name}"
        try:
            mtime = int(file_path.stat().st_mtime)
        except OSError:
            mtime = 0
        url = f"/videos/{corte.projeto_id}/{relative_path}?v={mtime}"
        # Garante que o redirect em si não seja cacheado — apenas o destino é.
        headers = {"Cache-Control": "no-store"}
        return RedirectResponse(url=url, headers=headers)

    # Prefer the file recorded in the DB (most recently generated by gerar_bruto_via_worker)
    if corte.arquivo_clip_path:
        p = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
        if p.exists():
            return _redirect_with_cache_buster(p)

    # Fallback: procura no filesystem.  Inclui glob `clip_raw_*.mkv` para
    # pegar nomes únicos gerados por estratégia (clip_raw_A_<ts>.mkv etc).
    # Mais recente por mtime tem prioridade.
    glob_matches = sorted(
        list(corte_dir.glob("clip_raw_*.mkv")) + list(corte_dir.glob("clip_raw_*.mp4")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    candidates = [
        *glob_matches,
        corte_dir / "clip_raw.mkv",
        corte_dir / "clip_raw.mp4",
        corte_dir / "clip_raw_base.mkv",
        corte_dir / "clip_raw_base.mp4",
        corte_dir / "clip_raw_backup_com_silencios.mkv",
        corte_dir / "clip_raw_backup_com_silencios.mp4",
    ]

    for c in candidates:
        if c.exists():
            return _redirect_with_cache_buster(c)

    raise HTTPException(status_code=404, detail="Vídeo bruto não encontrado")


def _corte_tem_bruto(corte: Corte) -> bool:
    """True se o corte já tem vídeo bruto em disco (regeração vs 1ª vez, D-160).

    Usa `_find_clip_raw` (mesma fonte de verdade do pipeline de render), robusto
    a nomes com timestamp e à relocação da pasta — não confia num caminho stale
    no banco.
    """
    from app.services.pipeline_render import _find_clip_raw

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
    return _find_clip_raw(corte_dir) is not None


@router.post("/{corte_id}/gerar-bruto")
async def gerar_bruto(
    corte_id: str,
    body: GerarBrutoRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Dispara geração assíncrona do vídeo bruto.

    Retorna imediatamente; o status pode ser consultado via
    `GET /export/corte/{corte_id}/cortar/status`. Após sucesso, o corte
    é atualizado no banco com `arquivo_clip_path`, `duracao_clip_seg` e
    `transcricao_final` re-sincronizada.

    D-160 — na **1ª geração** (corte sem bruto) roda a cadeia completa
    (transcrição + cenas). Na **regeração** (bruto já existe) o default é
    **só o bruto**; refazer transcrição/cenas vira opt-in via `body`.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    if ExportService.get_tarefa_corte_status(corte_id) == "cortando":
        return {"message": "Geração de bruto já em andamento", "corte_id": corte_id}

    opcoes = body or GerarBrutoRequest()
    if _corte_tem_bruto(corte):
        refazer_transcricao = opcoes.refazer_transcricao
        refazer_cenas = opcoes.refazer_cenas
    else:
        # Primeira geração: cadeia completa (comportamento inalterado).
        refazer_transcricao = True
        refazer_cenas = True

    ExportService.set_tarefa_corte_status(corte_id, "cortando")

    async def _run():
        try:
            resultado = await ExportService.gerar_bruto_via_worker(
                corte_id,
                refazer_transcricao=refazer_transcricao,
                refazer_cenas=refazer_cenas,
            )
            if resultado.get("status") == "pronto":
                ExportService.set_tarefa_corte_status(corte_id, "pronto")
            else:
                msg = resultado.get("mensagem", "erro desconhecido")
                ExportService.set_tarefa_corte_status(corte_id, f"erro: {msg}")
        except Exception as exc:
            ExportService.set_tarefa_corte_status(corte_id, f"erro: {exc}")

    fire_and_forget(_run(), name=f"gerar-bruto-{corte_id[:8]}")
    return {"message": "Geração de bruto iniciada", "corte_id": corte_id}


@router.post("/{corte_id}/detectar-segmentos")
async def detectar_segmentos(corte_id: str, db: AsyncSession = Depends(get_db)):
    """F-054: dispara PySceneDetect sobre o bruto do corte (fire-and-forget).

    Retorna imediatamente; resultado fica disponível em
    `GET /cortes/{corte_id}` no campo `segmentos_detectados` quando termina.
    """
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    if deteccao_em_andamento(corte_id):
        return {"status": "em_andamento", "corte_id": corte_id}

    if not corte.arquivo_clip_path:
        raise HTTPException(
            status_code=400,
            detail="Corte ainda não tem vídeo bruto — gere o bruto antes de detectar segmentos.",
        )
    video_path = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    if not video_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Arquivo bruto não encontrado em disco.",
        )

    fire_and_forget(
        executar_deteccao_segmentos(corte_id, video_path), name=f"deteccao-seg-{corte_id[:8]}"
    )
    return {"status": "iniciado", "corte_id": corte_id}


@router.patch("/{corte_id}/segmentos-detectados/{indice}", response_model=CorteResponse)
async def decidir_segmento(
    corte_id: str,
    indice: int,
    body: DecisaoSegmentoRequest,
    db: AsyncSession = Depends(get_db),
):
    """F-054: aplica decisão (rejeitar/full/compartilhada) a um segmento sugerido.

    Aceitar (full/compartilhada) também materializa uma região correspondente
    em `layout_youtube.regioes`. Rejeitar só atualiza o status do segmento.
    """
    if body.decisao not in VALORES_ACEITOS_DECISAO:
        raise HTTPException(
            status_code=400,
            detail=f"Decisão inválida. Use uma de {sorted(VALORES_ACEITOS_DECISAO)}.",
        )

    result = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    corte = result.scalar_one_or_none()
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    segmentos = json.loads(corte.segmentos_detectados or "[]")
    if not isinstance(segmentos, list) or not segmentos:
        raise HTTPException(
            status_code=400,
            detail="Corte não tem segmentos detectados — rode a detecção primeiro.",
        )

    try:
        novos_segmentos, segmento = aplicar_decisao_segmento(segmentos, indice, body.decisao)
    except IndexError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    corte.segmentos_detectados = json.dumps(novos_segmentos, ensure_ascii=False)

    if body.decisao in {"full", "compartilhada"}:
        layout_atual = json.loads(corte.layout_youtube or "{}") or {}
        layout_novo = materializar_regiao_em_layout(layout_atual, segmento, body.decisao)
        layout_normalizado = normalizar_layout_youtube(layout_novo)
        corte.layout_youtube = json.dumps(layout_normalizado, ensure_ascii=False)

    await db.commit()
    await db.refresh(corte)
    return _corte_to_dict(corte)


@router.get("/{corte_id}/bruto-progress")
async def bruto_progress(corte_id: str):
    """Passos do gerar/regerar bruto (silêncios → render → transcrição → cenas)
    com status, para o dropdown de acompanhamento ao lado do botão."""
    from app.services.bruto_progress import BrutoProgress

    return {"passos": BrutoProgress.get(corte_id)}


@router.post("/{corte_id}/gerar-cenas-remotion")
async def gerar_cenas_remotion(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera cenas visuais via Gemini AI a partir da transcrição final do corte."""
    try:
        resultado = await CenasRemotionService.gerar_cenas(corte_id)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar cenas: {str(e)}") from e


@router.get("/{corte_id}/cenas-remotion/prompt")
async def exportar_prompt_cenas(corte_id: str):
    """Retorna o prompt para geração de cenas Remotion sem chamar a IA."""
    try:
        return await CenasRemotionService.montar_prompt(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/cenas-remotion/importar")
async def importar_cenas_remotion(corte_id: str, body: ImportarCenasRequest):
    """Importa cenas geradas por IA externa, normaliza e salva."""
    try:
        payload = body.model_dump(exclude_none=True)
        resultado = await CenasRemotionService.importar_cenas(corte_id, payload)
        return resultado
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/cenas-remotion/retratos")
async def preencher_retratos_cenas_remotion(corte_id: str, forcar: bool = False):
    """Busca retratos da Wikipedia para cenas ficha_biografica ja salvas."""
    try:
        return await CenasRemotionService.preencher_retratos(corte_id, forcar=forcar)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/cenas-remotion/validar", response_model=CorteResponse)
async def validar_cenas_remotion(
    corte_id: str,
    body: ValidarCenasRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Marca/desmarca as cenas Remotion do corte como validadas pelo editor.

    Sem corpo, valida (validado=True). Com `{"validado": false}`, desfaz a marca.
    Exige pelo menos uma cena salva no roteiro visual para poder validar.
    """
    result = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == corte_id)
    )
    corte = result.scalar_one_or_none()
    if not corte:
        raise HTTPException(status_code=404, detail="Corte nao encontrado")

    validado = True if body is None else bool(body.validado)

    if validado:
        cenas = extrair_cenas_remotion(json.loads(corte.cenas_remotion or "[]"))
        if not cenas:
            raise HTTPException(
                status_code=400,
                detail="Nao ha cenas para validar. Gere ou importe cenas antes.",
            )
        corte.cenas_validadas = 1
        corte.cenas_validadas_em = datetime.utcnow()
    else:
        corte.cenas_validadas = 0
        corte.cenas_validadas_em = None

    await db.commit()
    await db.refresh(corte)
    return _corte_to_dict(corte)


@router.get("/{corte_id}/desvios/prompt")
async def exportar_prompt_desvios(corte_id: str):
    """Retorna o prompt para análise de desvios e repetições sem chamar a IA."""
    from app.services.desvios import DesviosService

    try:
        return await DesviosService.montar_prompt(corte_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/desvios/importar")
async def importar_desvios(corte_id: str, body: ImportarDesviosRequest):
    """Importa trechos identificados por IA externa e adiciona como desvios."""
    from app.services.desvios import DesviosService

    try:
        corte = await DesviosService.importar_resultado(corte_id, body.trechos)
        return _corte_to_dict(corte)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{corte_id}/analisar-desvios-ia")
async def analisar_desvios_ia(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Analisa desvios (repetições, erros) via Gemini IA."""
    from app.services.desvios import DesviosService

    try:
        corte = await DesviosService.analisar_ia(corte_id)
        return _corte_to_dict(corte)
    except Exception as e:
        raise erro_interno(e) from e


def _pipeline_paths(corte: Corte) -> dict[str, Path]:
    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
    graded_dir = corte_dir / "graded"
    return {
        "raw_mkv": corte_dir / "clip_raw.mkv",
        "raw_mp4": corte_dir / "clip_raw.mp4",
        "graded": graded_dir / "clip_graded.mp4",
        "graded_dir": graded_dir,
        "overlays_dir": corte_dir / "overlays",
        "composed": corte_dir / "temp" / "clip_composed.mp4",
        "final": corte_dir / "upload_ready" / "video.mp4",
    }


def _arquivo_aproveitavel(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 1024 * 1024


# D-093: a otimizacao de trim-segmentation grava `clip_graded.seg*.ts` +
# `clip_graded.concat.txt` durante a fase 1; o `.mp4` final so nasce no
# concat. Sem reconhecer os segmentos, `pipeline-status` reporta grade
# inexistente e o frontend dispara restart total a cada clique.
_SEG_MIN_BYTES_APROVEITAVEL = 256 * 1024


def _grade_aproveitavel(paths: dict[str, Path]) -> bool:
    if _arquivo_aproveitavel(paths["graded"]):
        return True
    graded_dir = paths.get("graded_dir")
    if graded_dir is None or not graded_dir.exists():
        return False
    concat = graded_dir / "clip_graded.concat.txt"
    if not concat.exists():
        return False
    return any(
        seg.stat().st_size > _SEG_MIN_BYTES_APROVEITAVEL
        for seg in graded_dir.glob("clip_graded.seg*.ts")
    )


def _bruto_registrado_aproveitavel(corte: Corte) -> bool:
    if not corte.arquivo_clip_path:
        return False

    return _arquivo_aproveitavel(resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id))


def _overlay_aproveitavel(path: Path) -> bool:
    # 256 KB casa com `_OVERLAY_MIN_BYTES_PRONTO` em pipeline_render. Render
    # incompleto/corrompido geralmente tem <100 KB; chunks curtos válidos
    # podem ficar bem abaixo dos 10 MB que usávamos antes — usar 10 MB aqui
    # escondia da UI a opção "Continuar fase 2" quando havia overlays prontos.
    return path.exists() and path.stat().st_size > 256 * 1024


@router.get("/{corte_id}/pipeline-status")
async def obter_pipeline_status(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    paths = _pipeline_paths(corte)
    overlays = (
        [
            p
            for pattern in ("chunk_*.webm", "chunk_*.mov", "ov_*.webm", "ov_*.mov")
            for p in paths["overlays_dir"].glob(pattern)
            if _overlay_aproveitavel(p)
        ]
        if paths["overlays_dir"].exists()
        else []
    )
    fases = {
        "raw": (
            _arquivo_aproveitavel(paths["raw_mkv"])
            or _arquivo_aproveitavel(paths["raw_mp4"])
            or _bruto_registrado_aproveitavel(corte)
        ),
        "grade": _grade_aproveitavel(paths),
        "overlays": len(overlays) > 0,
        "compose": _arquivo_aproveitavel(paths["composed"]),
        "render_final": _arquivo_aproveitavel(paths["final"]),
        "encode": _arquivo_aproveitavel(paths["final"]),
    }
    progress = RenderProgressStore.get(corte_id).to_dict()
    if progress["state"] == "idle" and fases["encode"]:
        progress = {
            "state": "done",
            "progress": 100,
            "stage": "Render final concluído",
            "running": False,
            "elapsed_seconds": 0.0,
            "error": "",
        }
    return {
        "fases": fases,
        "overlays_count": len(overlays),
        "tem_etapas_concluidas": any(fases[k] for k in ("grade", "overlays", "compose", "encode")),
        **progress,
    }


@router.post("/{corte_id}/renderizar-pipeline")
async def renderizar_pipeline(corte_id: str, body: RenderPipelineRequest | None = None):
    """Pipeline otimizado: Grade QSV -> Overlays Remotion -> Composição FFmpeg -> Encode Final.

    Usa composição por camadas (o Remotion renderiza apenas overlays transparentes curtos).
    """
    if body is None:
        body = RenderPipelineRequest()
    # D-093: single-flight. Sem este guard, um clique duplo (ou dois tabs)
    # chama iniciar_render_background concorrente; quando `continuar=False`,
    # o cleanup em _deve_limpar_artefatos zera os artefatos da run anterior
    # e mata a grade em andamento. O usuario ve "rodando de novo a fase 0".
    if RenderProgressStore.is_running(corte_id):
        progresso = RenderProgressStore.get(corte_id).to_dict()
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Pipeline ja em execucao para este corte.",
                "progress": progresso,
            },
        )
    try:
        RemotionRenderService.iniciar_render_background(
            corte_id,
            filtro=body.filtro,
            continuar=body.continuar,
            start_from=body.start_from,
            parar_em=body.parar_em,
        )
        filtro_msg = body.filtro or "padrao global"
        alcance_msg = f", parando em: {body.parar_em}" if body.parar_em else ""
        return {
            "message": f"Pipeline otimizado iniciado (filtro: {filtro_msg}, início: {body.start_from}{alcance_msg})"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/{corte_id}/remotion-studio-url")
async def obter_remotion_studio_url(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Gera a URL do Remotion Studio e salva as props ativas para o Studio buscar."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte_id
    clip_path = None
    for candidate in ["clip_raw.mkv", "clip_raw.mp4"]:
        p = corte_dir / candidate
        if p.exists():
            clip_path = p
            break

    if not clip_path:
        raise HTTPException(
            status_code=404,
            detail="Vídeo exportado não encontrado. Execute 'Exportar NLE' primeiro.",
        )

    clip_filename = clip_path.name
    video_url = f"http://localhost:8000/videos/{corte.projeto_id}/cortes/{corte_id}/{clip_filename}"

    cenas_salvas = json.loads(corte.cenas_remotion or "[]")
    if isinstance(cenas_salvas, dict):
        cenas_array = cenas_salvas.get("cenas", [])
    else:
        cenas_array = cenas_salvas

    # Roteia o Studio para a composição correta conforme a versão do renderer
    # escolhida no projeto. V2 inclui sombraNivelPadrao no payload.
    projeto = await db.get(Projeto, corte.projeto_id)

    layout_youtube = normalizar_layout_youtube(
        json.loads(getattr(corte, "layout_youtube", "") or "{}"),
        fallback_layout=getattr(projeto, "layout_youtube_padrao", None),
    )
    # V1 desativada — todos os projetos usam V2 (nova identidade editorial).
    sombra_padrao = getattr(projeto, "sombra_nivel_padrao", "nenhuma") or "nenhuma"
    layout_card_padrao = getattr(projeto, "layout_card_padrao", "vertical") or "vertical"
    composition_id = "CenaYouTubeV2"

    props = {
        "videoUrl": video_url,
        "letterbox": False,
        "filtroCss": "none",
        "cenas": aplicar_layout_card_por_contexto(cenas_array, layout_youtube),
        "layoutYoutube": layout_youtube,
        "sombraNivelPadrao": sombra_padrao,
        "layoutCardPadrao": layout_card_padrao,
    }

    global _remotion_active_props
    _remotion_active_props = props

    studio_url = f"http://localhost:3000/{composition_id}"

    return {
        "studio_url": studio_url,
        "video_url": video_url,
        "props": props,
    }


@router.post("/{corte_id}/sincronizar-pos-producao")
async def sincronizar_pos_producao(corte_id: str, db: AsyncSession = Depends(get_db)):
    """
    Promove clip_filtered.mp4 -> upload_ready/ quando o corte tem versão filtrada
    mas nenhuma cena Remotion foi criada. Também finaliza o pacote (metadados +
    thumbnail) para garantir que upload_ready/ fique completo, idêntico ao que
    o pipeline do Remotion produziria. Após sucesso, limpa a pasta do corte
    mantendo apenas clip_filtered.mp4 e upload_ready/.
    """
    from app.services.remotion_render import RemotionRenderService

    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    cenas_raw = corte.cenas_remotion or "[]"
    cenas_data = json.loads(cenas_raw)
    if isinstance(cenas_data, dict):
        cenas = cenas_data.get("cenas", [])
    else:
        cenas = cenas_data

    corte_dir = projetos_dir() / corte.projeto_id / "cortes" / corte.id
    clip_filtered = corte_dir / "clip_filtered.mp4"
    upload_ready_dir = corte_dir / "upload_ready"
    upload_ready_video = upload_ready_dir / "video.mp4"

    # Caso 1: já existe upload_ready/video.mp4 — apenas finaliza (gera metadados + thumb se faltar)
    if upload_ready_video.exists():
        await RemotionRenderService.finalizar_corte_com_sucesso(db, corte, upload_ready_dir)
        await _limpar_pasta_corte_pos_sync(corte_dir)
        return {"status": "ok", "mensagem": "Sincronizado via upload_ready existente."}

    # Caso 2: tem clip_filtered mas não tem cenas Remotion -> promove e finaliza
    if not cenas and clip_filtered.exists():
        upload_ready_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(clip_filtered), str(upload_ready_video))
        await RemotionRenderService.finalizar_corte_com_sucesso(db, corte, upload_ready_dir)
        await _limpar_pasta_corte_pos_sync(corte_dir)
        return {"status": "ok", "mensagem": "Promovido e sincronizado com sucesso."}

    return {
        "status": "nada_a_fazer",
        "mensagem": "Requisitos para sincronização automática não atendidos.",
    }


@router.post("/{corte_id}/abrir-pasta")
async def abrir_pasta(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Abre a pasta física do corte no explorador de arquivos do sistema (Windows/Mac/Linux)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    dir_path = projetos_dir() / corte.projeto_id / "cortes" / corte_id
    if not dir_path.exists():
        dir_path.mkdir(parents=True, exist_ok=True)

    abs_path = str(dir_path.absolute())

    try:
        if os.name == "nt":  # Windows
            os.startfile(abs_path)
        elif os.uname().sysname == "Darwin":  # macOS
            subprocess.run(["open", abs_path])
        else:  # Linux
            subprocess.run(["xdg-open", abs_path])

        return {"status": "ok", "dir_path": abs_path}
    except Exception as e:
        logger.exception("[RouterCortes] Erro ao abrir pasta: %s", e)
        raise HTTPException(status_code=500, detail=f"Erro ao abrir pasta: {str(e)}") from e
