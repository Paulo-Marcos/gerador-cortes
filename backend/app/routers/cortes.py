import logging
from pathlib import Path

from app.core.channel_paths import projetos_dir
from app.database import get_db
from app.domain.compartilhado.provider_ia import ProviderIA
from app.models import Corte
from app.routers.cortes_helpers import (
    _corte_to_dict,
    _hms_to_seg,
)
from app.routers.cortes_schemas import (
    AdicionarDesvioRequest,
    ArranjoResponse,
    AtualizarCorteRequest,
    CorteResponse,
    CriarCorteDesvioRequest,
    CriarCorteManualRequest,
    DecisaoSegmentoRequest,
    DividirBlocoRequest,
    DividirCorteRequest,
    FundirBlocoRequest,
    GerarBrutoRequest,
    ImportarCenasRequest,
    ImportarDesviosRequest,
    JuntarCortesRequest,
    MoverBlocoRequest,
    RemoverDesvioRequest,
    RenderPipelineRequest,
    ReordenarCortesRequest,
    ValidarCenasRequest,
)
from app.routers.errors import erro_interno
from app.services import abrir_no_sistema, bruto_do_corte, remotion_studio
from app.services import arranjo as arranjo_service
from app.services.cenas_remotion import CenasRemotionService
from app.services.corte import AtualizarCorteDTO, CorteService
from app.services.deteccao_segmentos import (
    decidir_segmento as decidir_segmento_detectado,
)
from app.services.deteccao_segmentos import iniciar_deteccao
from app.services.media_proxy import MediaProxyService
from app.services.render import finalizacao_do_corte, situacao_do_render
from app.services.render.remotion_render import RemotionRenderService
from app.services.render.render_progress import RenderProgressStore
from app.services.tasks import fire_and_forget
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

router = APIRouter()


# Schemas e helpers puros vivem em cortes_schemas / cortes_helpers (E-006).


# ─── Endpoints (rotas fixas ANTES das rotas com {corte_id}) ─────────────────


@router.get("/remotion/active-props")
async def obter_remotion_active_props():
    """Retorna as props ativas para o Remotion Studio buscar automaticamente.

    Vazio antes do primeiro pedido — e não 404, para não poluir o log do Uvicorn,
    que o Studio consulta em laço.
    """
    return remotion_studio.props_ativas()


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
async def aprovar_corte(corte_id: str):
    await CorteService.aprovar(corte_id)
    return {"message": "Corte aprovado", "corte_id": corte_id}


@router.delete("/{corte_id}")
async def deletar_corte(corte_id: str):
    await CorteService.remover(corte_id)
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


@router.post("/{corte_id}/juntar", response_model=CorteResponse)
async def juntar_cortes(
    corte_id: str, body: JuntarCortesRequest | None = None, db: AsyncSession = Depends(get_db)
):
    """D-575: funde este corte com o vizinho, devolvendo o corte resultante.

    Sem `outro_corte_id` no corpo, junta com o corte SEGUINTE na linha do tempo.
    O corte que começa antes sobrevive (mantém id, pasta e metadado) e absorve
    bordas, trechos a remover, cenas, layout e shorts do outro — o vão entre os
    dois vira trecho removido, para que nada que não estava em nenhum dos dois
    cortes entre de carona.
    """
    try:
        outro_id = (body.outro_corte_id if body else None) or await CorteService.proximo_corte_id(
            db, corte_id
        )
        if not outro_id:
            raise HTTPException(
                status_code=400, detail="Este é o último corte: não há com quem juntar."
            )
        sobrevivente_id = await CorteService.juntar_cortes(corte_id, outro_id)
    except ValueError as e:
        msg = str(e)
        raise HTTPException(status_code=404 if "não encontrado" in msg else 400, detail=msg) from e

    result = await db.execute(
        select(Corte).options(selectinload(Corte.metadado)).where(Corte.id == sobrevivente_id)
    )
    corte = result.scalar_one_or_none()
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado após a junção")
    return _corte_to_dict(corte)


# ─────────────────────────────────────────────────────────────────────────────
# D-576: ordem de exibição dos blocos do corte
#
# Endpoints separados dos de desvio de propósito. São duas decisões editoriais
# diferentes — o que SAI (desvio) e em que ORDEM entra o que ficou (arranjo) —
# e juntá-las num PATCH genérico faria a UI ter de reenviar uma para mexer na
# outra. Toda operação devolve o arranjo INTEIRO já recalculado: o cliente nunca
# precisa deduzir o estado novo a partir do que mandou.
# ─────────────────────────────────────────────────────────────────────────────


def _erro_de_arranjo(e: ValueError) -> HTTPException:
    msg = str(e)
    if "não encontrado" in msg:
        return HTTPException(status_code=404, detail=msg)
    return HTTPException(status_code=400, detail=f"Arranjo inválido: {msg}")


@router.get("/{corte_id}/arranjo", response_model=ArranjoResponse)
async def obter_arranjo(corte_id: str):
    """A fila de blocos do corte. Corte nunca reordenado devolve um bloco só."""
    try:
        return await arranjo_service.obter(corte_id)
    except ValueError as e:
        raise _erro_de_arranjo(e) from e


@router.post("/{corte_id}/arranjo/dividir", response_model=ArranjoResponse)
async def dividir_bloco(corte_id: str, body: DividirBlocoRequest):
    """Passa a lâmina no instante absoluto informado, criando uma junta.

    Não confundir com `POST /{corte_id}/dividir` (F-061), que parte o CORTE em
    dois cortes. Aqui o corte continua um só; o que se parte é o material dentro
    dele, para poder trocar de lugar.
    """
    try:
        return await arranjo_service.dividir(corte_id, float(body.ponto_seg))
    except ValueError as e:
        raise _erro_de_arranjo(e) from e


@router.post("/{corte_id}/arranjo/mover", response_model=ArranjoResponse)
async def mover_bloco(corte_id: str, body: MoverBlocoRequest):
    """Move o bloco de uma posição da fila para outra."""
    try:
        return await arranjo_service.mover(corte_id, body.de_indice, body.para_indice)
    except ValueError as e:
        raise _erro_de_arranjo(e) from e


@router.post("/{corte_id}/arranjo/fundir", response_model=ArranjoResponse)
async def fundir_bloco(corte_id: str, body: FundirBlocoRequest):
    """Desfaz a junta entre o bloco e o vizinho seguinte NA LIVE."""
    try:
        return await arranjo_service.fundir(corte_id, body.indice)
    except ValueError as e:
        raise _erro_de_arranjo(e) from e


@router.post("/{corte_id}/arranjo/restaurar", response_model=ArranjoResponse)
async def restaurar_arranjo(corte_id: str):
    """Esquece blocos e ordem: o corte volta a tocar como foi falado."""
    try:
        return await arranjo_service.restaurar(corte_id)
    except ValueError as e:
        raise _erro_de_arranjo(e) from e


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
async def analisar_desvios_todos(
    projeto_id: str, provider: ProviderIA = "claude", db: AsyncSession = Depends(get_db)
):
    """Dispara análise de desvios via IA para todos os cortes do projeto (em background)."""
    fire_and_forget(
        CorteService.analisar_desvios_todos_impl(projeto_id, provider),
        name=f"desvios-todos-{projeto_id[:8]}",
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


@router.get("/{corte_id}/caminho-pasta")
async def obter_caminho_pasta(corte_id: str, db: AsyncSession = Depends(get_db)):
    """Apenas retorna o caminho da pasta do corte (sem gerar arquivos extras)."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    dir_path = str(projetos_dir() / corte.projeto_id / "cortes" / corte_id)

    return {"dir_path": dir_path}


@router.get("/{corte_id}/video-bruto")
async def obter_video_bruto(corte_id: str):
    """Serve o arquivo de vídeo bruto (original do corte antes dos tratamentos).

    Acrescenta `?v=<mtime>` na URL de redirecionamento para fazer cache-busting
    automático sempre que o arquivo é regerado.  Sem isso, o navegador
    serve o conteúdo cacheado (duração e metadados antigos) mesmo com o
    `clip_raw.mkv` já atualizado no disco.
    """
    from fastapi.responses import RedirectResponse

    projeto_id, bruto = await bruto_do_corte.localizar(corte_id)
    try:
        mtime = int(bruto.stat().st_mtime)
    except OSError:
        mtime = 0
    url = f"/videos/{projeto_id}/cortes/{corte_id}/{bruto.name}?v={mtime}"
    # Garante que o redirect em si não seja cacheado — apenas o destino é.
    return RedirectResponse(url=url, headers={"Cache-Control": "no-store"})


@router.post("/{corte_id}/gerar-bruto")
async def gerar_bruto(corte_id: str, body: GerarBrutoRequest | None = None):
    """Dispara geração assíncrona do vídeo bruto.

    Retorna imediatamente; o status pode ser consultado via
    `GET /export/corte/{corte_id}/cortar/status`. Na 1ª geração roda a cadeia
    completa (transcrição + cenas); na regeração, o `body` escolhe o que refazer
    além do bruto (D-160).
    """
    opcoes = body or GerarBrutoRequest()
    return await bruto_do_corte.iniciar_geracao(
        corte_id,
        refazer_transcricao=opcoes.refazer_transcricao,
        refazer_cenas=opcoes.refazer_cenas,
    )


@router.post("/{corte_id}/detectar-segmentos")
async def detectar_segmentos(corte_id: str):
    """F-054: dispara PySceneDetect sobre o bruto do corte (fire-and-forget).

    Retorna imediatamente; resultado fica disponível em
    `GET /cortes/{corte_id}` no campo `segmentos_detectados` quando termina.
    """
    return await iniciar_deteccao(corte_id)


@router.patch("/{corte_id}/segmentos-detectados/{indice}", response_model=CorteResponse)
async def decidir_segmento(corte_id: str, indice: int, body: DecisaoSegmentoRequest):
    """F-054: aplica decisão (rejeitar/full/compartilhada) a um segmento sugerido.

    Aceitar (full/compartilhada) também materializa uma região correspondente
    em `layout_youtube.regioes`. Rejeitar só atualiza o status do segmento.
    """
    return _corte_to_dict(await decidir_segmento_detectado(corte_id, indice, body.decisao))


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
async def validar_cenas_remotion(corte_id: str, body: ValidarCenasRequest | None = None):
    """Marca/desmarca as cenas Remotion do corte como validadas pelo editor.

    Sem corpo, valida (validado=True). Com `{"validado": false}`, desfaz a marca.
    Exige pelo menos uma cena salva no roteiro visual para poder validar.
    """
    validado = True if body is None else bool(body.validado)
    return _corte_to_dict(await CenasRemotionService.validar(corte_id, validado))


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


@router.get("/{corte_id}/pipeline-status")
async def obter_pipeline_status(corte_id: str):
    """Até onde o render do corte já chegou — as fases com artefato e o progresso."""
    return await situacao_do_render.situacao_do_pipeline(corte_id)


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
async def obter_remotion_studio_url(corte_id: str):
    """Gera a URL do Remotion Studio e salva as props ativas para o Studio buscar."""
    return await remotion_studio.abrir_no_studio(corte_id)


@router.post("/{corte_id}/sincronizar-pos-producao")
async def sincronizar_pos_producao(corte_id: str):
    """
    Promove clip_filtered.mp4 -> upload_ready/ quando o corte tem versão filtrada
    mas nenhuma cena Remotion foi criada. Também finaliza o pacote (metadados +
    thumbnail) para garantir que upload_ready/ fique completo, idêntico ao que
    o pipeline do Remotion produziria. Após sucesso, limpa a pasta do corte
    mantendo apenas clip_filtered.mp4 e upload_ready/.
    """
    return await finalizacao_do_corte.sincronizar_pos_producao(corte_id)


@router.post("/{corte_id}/abrir-pasta")
async def abrir_pasta(corte_id: str):
    """Abre a pasta física do corte no explorador de arquivos do sistema (Windows/Mac/Linux)."""
    try:
        caminho = await CorteService.abrir_pasta(corte_id)
    except abrir_no_sistema.NaoConsegueAbrir as e:
        raise HTTPException(status_code=500, detail=f"Erro ao abrir pasta: {e}") from e
    return {"status": "ok", "dir_path": caminho}
