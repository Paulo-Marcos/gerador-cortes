"""Router: fábrica de shorts do corte Fire (D-455).

Endpoints:
  GET  /fires                     — os cortes Fire cujo bruto ainda esta em disco
  GET  /corte/{corte_id}          — os shorts do corte, do melhor palpite ao pior
  GET  /corte/{corte_id}/elegibilidade — se a tela do bruto deve oferecer a fábrica
  POST /corte/{corte_id}/gerar    — caminho MANUAL: regera o bruto se preciso e propõe
  POST /corte/{corte_id}/sugerir  — propõe agora (o fluxo normal é automático)
  PATCH /{short_id}               — a decisão do operador: status e/ou bordas
  POST /{short_id}/renderizar     — produz o MP4 vertical do candidato
  GET  /{short_id}/publicacao     — os pacotes prontos, por plataforma
  POST /{short_id}/publicar/{plataforma} — envia (API) ou monta o pacote (manual)
  POST /corte/{corte_id}/publicar/tiktok-horizontal — o MP4 16:9 no TikTok
  DELETE /corte/{corte_id}/bruto  — libera o disco e encerra a fábrica do corte

O disparo padrão é o fim da geração do bruto de um corte marcado com Fire. O POST
existe para o caso que o automático não cobre: o corte virou Fire **depois** de o
bruto já estar pronto, ou o corpo da skill mudou em `/canais` e você quer o
palpite novo sem regerar o vídeo.

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto), no mesmo padrão de `avaliacao_bruto`.
"""

from __future__ import annotations

from app.services import shorts as shorts_store
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


@router.get("/fires")
async def listar_fires():
    """A porta da tela de Shorts: os Fires que ainda tem de onde recortar."""
    return {"fires": await shorts_store.listar_fires_com_bruto()}


@router.get("/corte/{corte_id}")
async def listar(corte_id: str):
    return {"shorts": await shorts_store.listar_shorts(corte_id)}


@router.delete("/corte/{corte_id}/bruto")
async def descartar_bruto(corte_id: str):
    """Descarta o bruto guardado — o corte deixa de poder gerar shorts."""
    try:
        return await shorts_store.descartar_bruto(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/corte/{corte_id}/elegibilidade")
async def elegibilidade(corte_id: str):
    """Se o corte é Fire, se tem bruto, e quantos candidatos já existem."""
    try:
        return await shorts_store.elegibilidade(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/gerar")
async def gerar_manualmente(corte_id: str):
    """Caminho manual da fábrica: regera o bruto se preciso e propõe os shorts.

    Serve os cortes antigos e o teste da esteira. A regeração do bruto NÃO toca
    na pós-produção — refaz só o vídeo (D-160).
    """
    try:
        return await shorts_store.gerar_shorts_do_corte(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/sugerir")
async def sugerir_agora(corte_id: str):
    """Propõe os shorts do bruto atual, de forma síncrona (o caller espera)."""
    from app.services.claude_ia import ClaudeIaService

    try:
        return await ClaudeIaService.sugerir_shorts_via_claude(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class AtualizarShortRequest(BaseModel):
    """A decisão da curadoria. Todo campo é opcional — só o que veio é aplicado."""

    status: str | None = None
    inicio_seg: float | None = None
    fim_seg: float | None = None
    foco_x: float | None = None


@router.patch("/{short_id}")
async def atualizar(short_id: str, body: AtualizarShortRequest):
    """Aprova, rejeita ou reposiciona as bordas de um candidato."""
    try:
        return {
            "short": await shorts_store.atualizar_short(
                short_id,
                status=body.status,
                inicio_seg=body.inicio_seg,
                fim_seg=body.fim_seg,
                foco_x=body.foco_x,
            )
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{short_id}/renderizar")
async def renderizar(short_id: str):
    """Produz o MP4 vertical do short (recorte 9:16 + legenda + cenas)."""
    from app.services import render_short

    try:
        return await render_short.renderizar_short(short_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{short_id}/publicacao")
async def previa_publicacao(short_id: str):
    """O que cada plataforma receberia, com os avisos — sem publicar nada."""
    from app.domain.publicacao import LIMITES
    from app.services import (
        destinos_shorts,  # noqa: F401 — registra os destinos
        publicacao_destinos,
    )

    try:
        contexto = await publicacao_destinos.montar_contexto(short_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    pacotes = []
    for destino in publicacao_destinos.destinos_disponiveis():
        pacote = await destino.preparar(contexto)
        pacotes.append(
            {
                "plataforma": pacote.plataforma.value,
                "rotulo": LIMITES[pacote.plataforma].rotulo,
                "modo": pacote.modo.value,
                "titulo": pacote.metadados.titulo,
                "titulo_visivel": pacote.metadados.titulo_visivel,
                "descricao": pacote.metadados.descricao,
                "hashtags": pacote.metadados.hashtags,
                "avisos": pacote.avisos,
            }
        )
    return {"pacotes": pacotes}


@router.post("/{short_id}/publicar/{plataforma}")
async def publicar(short_id: str, plataforma: str):
    """Publica pela API ou monta o pacote manual, conforme o destino."""
    from app.domain.publicacao import Plataforma
    from app.services import (
        destinos_shorts,  # noqa: F401 — registra os destinos
        publicacao_destinos,
    )

    try:
        alvo = Plataforma(plataforma)
    except ValueError as exc:
        raise HTTPException(
            status_code=404, detail=f"Plataforma {plataforma!r} desconhecida."
        ) from exc

    try:
        destino = publicacao_destinos.obter_destino(alvo)
        contexto = await publicacao_destinos.montar_contexto(short_id)
        return await destino.publicar(await destino.preparar(contexto))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except NotImplementedError as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc


@router.post("/corte/{corte_id}/publicar/tiktok-horizontal")
async def publicar_corte_no_tiktok(corte_id: str):
    """Monta o pacote do MP4 HORIZONTAL do corte para o TikTok (D-470).

    Mora neste router porque reusa toda a camada de destinos que a fabrica de
    shorts trouxe. O video e o mesmo que foi para o YouTube: nao ha render novo,
    so metadados adaptados e uma pasta pronta.
    """
    from app.domain.publicacao import Plataforma
    from app.services import (
        destinos_shorts,  # noqa: F401 — registra os destinos
        publicacao_destinos,
    )

    try:
        destino = publicacao_destinos.obter_destino(Plataforma.TIKTOK_HORIZONTAL)
        contexto = await publicacao_destinos.montar_contexto_do_corte(corte_id)
        return await destino.publicar(await destino.preparar(contexto))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
