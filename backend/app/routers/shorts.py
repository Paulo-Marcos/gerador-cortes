import traceback

from app.database import get_db
from app.routers.errors import erro_interno
from app.services.app_logging import operational_error
from app.services.shorts import ShortsService
from app.services.youtube import YouTubeService
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


@router.get("/{corte_id}")
async def listar_shorts(corte_id: str):
    """Retorna a lista de shorts já gerados para este corte."""
    try:
        shorts = await ShortsService.listar_shorts(corte_id)
        return {"status": "ok", "shorts": shorts}
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/gerar-sugestoes/{corte_id}")
async def gerar_sugestoes(corte_id: str):
    """
    Inicia o processo de AI (Gemini) para ler a transcrição recalculada de um corte horizontal
    e encontrar pílulas verticais (shorts) virais.
    """
    try:
        sugestoes = await ShortsService.gerar_sugestoes_ia(corte_id)
        return {
            "status": "ok",
            "mensagem": f"{len(sugestoes)} sugestões geradas com sucesso.",
            "sugestoes": sugestoes,
        }
    except Exception as e:
        operational_error(
            "Shorts", f"Erro ao gerar sugestões de shorts: {e}\n{traceback.format_exc()}"
        )
        raise erro_interno(e) from e


@router.post("/renderizar/{short_id}")
async def renderizar_short_endpoint(short_id: str, background_tasks: BackgroundTasks):
    """
    Renderiza o short via Remotion com legendas dinâmicas.
    Executa em background para não travar a UI.
    """
    try:
        background_tasks.add_task(ShortsService.renderizar_short, short_id)
        return {"status": "ok", "mensagem": "Renderização do short iniciada em background."}
    except Exception as e:
        operational_error(
            "Shorts", f"Erro ao iniciar renderização do short: {e}\n{traceback.format_exc()}"
        )
        raise erro_interno(e) from e


@router.post("/analisar-cenas/{short_id}")
async def analisar_cenas(short_id: str):
    """
    Aciona a IA para decidir enquadramentos (Split Screen, Fullscreen, etc.)
    baseado no conteúdo do Short.
    """
    try:
        cenas = await ShortsService.analisar_cenas_ia(short_id)
        return {"status": "ok", "cenas": cenas}
    except Exception as e:
        operational_error(
            "Shorts", f"Erro ao analisar cenas do short: {e}\n{traceback.format_exc()}"
        )
        raise erro_interno(e) from e


@router.get("/{short_id}/cenas/prompt")
async def obter_prompt_cenas(short_id: str):
    """Retorna o prompt (em chunks se necessário) para as cenas do short."""
    try:
        return await ShortsService.montar_prompt_cenas(short_id)
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{short_id}/cenas/importar")
async def importar_cenas(short_id: str, dados: dict):
    """Importa o resultado manual das cenas."""
    try:
        cenas = await ShortsService.importar_cenas(short_id, dados)
        return {"status": "ok", "cenas": cenas}
    except Exception as e:
        raise erro_interno(e) from e


@router.get("/{short_id}/desvios/prompt")
async def obter_prompt_desvios(short_id: str):
    """Retorna o prompt para trechos removíveis do short."""
    try:
        return await ShortsService.montar_prompt_desvios(short_id)
    except Exception as e:
        raise erro_interno(e) from e


@router.post("/{short_id}/desvios/importar")
async def importar_desvios(short_id: str, dados: dict):
    """Importa o resultado manual de desvios do short."""
    try:
        desvios = await ShortsService.importar_desvios(short_id, dados)
        return {"status": "ok", "desvios": desvios}
    except Exception as e:
        raise erro_interno(e) from e


@router.patch("/{short_id}")
async def atualizar_short_endpoint(short_id: str, dados: dict):
    """Atualiza as propriedades de um short sugerido (ex: tempos)."""
    try:
        short = await ShortsService.atualizar_short(short_id, dados)
        if not short:
            raise HTTPException(status_code=404, detail="Short não encontrado")
        return {
            "status": "ok",
            "short": {"id": short.id, "inicio_seg": short.inicio_seg, "fim_seg": short.fim_seg},
        }
    except Exception as e:
        operational_error("Shorts", f"Erro ao atualizar short: {e}")
        raise erro_interno(e) from e


@router.post("/publicar/youtube/{short_id}")
async def publicar_youtube(short_id: str, db: AsyncSession = Depends(get_db)):
    """
    Publica o Short gerado no YouTube.
    """
    try:
        resultado = await YouTubeService.upload_short(short_id)
        if resultado.get("status") == "erro":
            raise HTTPException(status_code=500, detail=resultado.get("mensagem"))
        return resultado
    except Exception as e:
        operational_error(
            "Shorts", f"Erro ao publicar short no YouTube: {e}\n{traceback.format_exc()}"
        )
        raise erro_interno(e) from e
