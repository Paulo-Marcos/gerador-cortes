"""Router: fábrica de shorts do corte Fire (D-455).

Endpoints:
  GET  /fires                     — os cortes Fire cujo bruto ainda esta em disco
  GET  /corte/{corte_id}          — os shorts do corte, do melhor palpite ao pior
  POST /corte/{corte_id}          — cria um short a mao, que a regeracao nao apaga
  GET  /corte/{corte_id}/elegibilidade — se a tela do bruto deve oferecer a fábrica
  POST /corte/{corte_id}/gerar    — caminho MANUAL: regera o bruto se preciso e propõe
  POST /corte/{corte_id}/sugerir  — propõe agora (o fluxo normal é automático)
  GET  /corte/{corte_id}/transcricao — palavras com tempo, para a prévia de legenda
  GET  /palco/modelos             — os arranjos de palco vertical disponiveis
  GET  /corte/{corte_id}/palco    — de onde vem as regioes deste corte
  PUT  /corte/{corte_id}/palco    — aponta um preset do canal para o corte
  PATCH /{short_id}               — a decisão do operador: status e/ou bordas
  PUT  /{short_id}/cenas          — as cenas do short (hook, numero, citacao, cta)
  POST /{short_id}/previa         — o vertical SEM filtro, para julgar antes
  GET  /{short_id}/progresso      — em que passo o render esta e ha quanto tempo
  GET  /{short_id}/palco          — o palco em coordenadas de desenho (previa)
  POST /{short_id}/renderizar     — produz o MP4 final do candidato
  GET  /{short_id}/video          — assiste a previa ou ao final
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

from app.database import AsyncSessionLocal
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


class CriarShortManualRequest(BaseModel):
    """Um trecho que a IA nao propos, marcado pelo operador."""

    inicio_seg: float
    fim_seg: float
    titulo: str = ""


@router.post("/corte/{corte_id}")
async def criar_manual(corte_id: str, body: CriarShortManualRequest):
    """Cria um candidato a short a partir de um trecho escolhido a mão (D-484).

    Nasce SUGERIDO, como os da IA — passa pela mesma curadoria — mas marcado
    como manual, o que o poupa da próxima regeração.
    """
    try:
        return {
            "short": await shorts_store.criar_manual(
                corte_id,
                inicio_seg=body.inicio_seg,
                fim_seg=body.fim_seg,
                titulo=body.titulo,
            )
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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


@router.get("/palco/modelos")
async def modelos_de_palco():
    """Os arranjos de palco vertical, com o porquê de cada um (E-036).

    Rota sem `{corte_id}` de propósito: o catálogo é do sistema, não do corte.
    Declarada ANTES de `/corte/...` porque o FastAPI casa na ordem — se viesse
    depois, `/palco/modelos` seria capturado por nada, mas a inversa (uma rota
    `/{algo}` antes desta) engoliria o catálogo.
    """
    from app.services import palco_shorts

    return {"modelos": palco_shorts.catalogo_modelos()}


@router.get("/corte/{corte_id}/palco")
async def descrever_palco(corte_id: str):
    """De onde vêm as regiões deste corte, e o que há para escolher."""
    from app.services import palco_shorts

    try:
        return await palco_shorts.descrever(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class EscolherPresetRequest(BaseModel):
    """`""` volta ao automático (deduzir do layout do corte, ou nada)."""

    preset_id: str = ""


@router.put("/corte/{corte_id}/palco")
async def escolher_preset_do_palco(corte_id: str, body: EscolherPresetRequest):
    """Aponta um preset do canal para alimentar o palco vertical deste corte."""
    from app.services import palco_shorts

    try:
        return await palco_shorts.escolher_preset(corte_id, body.preset_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/corte/{corte_id}/transcricao")
async def transcricao_do_bruto(corte_id: str):
    """As palavras com tempo do bruto — a matéria-prima da prévia de legenda.

    Serve a tela de curadoria (D-479), que precisa mostrar a legenda ANTES do
    render: 85% das visualizações de short acontecem no mudo, então aprovar um
    candidato sem ver a legenda é julgar metade do produto.

    Vai direto à auto-legenda do YouTube: o ASR local roda o modelo sobre o
    áudio inteiro e leva minutos, o que serve a um render mas congelaria a tela.
    A grafia é pior, e o campo `fonte` diz isso — quando a transcrição fiel
    entrar aqui, a tela não muda, só o rótulo.
    """
    from app.services import transcricao_fiel

    try:
        resultado = await transcricao_fiel.obter_do_corte(corte_id, permitir_asr=False)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {
        "fonte": resultado.fonte,
        "palavras": [
            {"texto": p.texto, "inicio_seg": p.inicio_seg, "fim_seg": p.fim_seg}
            for p in resultado.palavras
        ],
    }


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
    modelo_palco: str | None = None
    ajustes_palco: dict | None = None
    palco_preset: str | None = None


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
                modelo_palco=body.modelo_palco,
                ajustes_palco=body.ajustes_palco,
                palco_preset=body.palco_preset,
            )
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class DefinirCenasRequest(BaseModel):
    """As cenas do short, na timeline dele (que comeca no zero)."""

    cenas: list[dict]


@router.put("/{short_id}/cenas")
async def definir_cenas(short_id: str, body: DefinirCenasRequest):
    """Grava as cenas do short — hook, número, citação, CTA (D-494)."""
    try:
        return {"short": await shorts_store.definir_cenas(short_id, body.cenas)}
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{short_id}/renderizar")
async def renderizar(short_id: str):
    """Produz o MP4 vertical do short (recorte 9:16 + legenda + cenas)."""
    from app.services import render_short

    try:
        return render_short.disparar(short_id, final=True)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/{short_id}/previa")
async def renderizar_previa(short_id: str):
    """Produz a PRÉVIA: vertical com legenda e cenas, sem o filtro (D-483).

    Serve para julgar antes de gastar a passada boa. Não é um passo do final —
    finalizar reprocessa do zero, porque o filtro tem de rodar junto com o
    recorte e antes do overlay.
    """
    from app.services import render_short

    try:
        return render_short.disparar(short_id, final=False)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{short_id}/video")
async def obter_video(short_id: str, estagio: str = "final"):
    """Serve o MP4 do short — a prévia ou o final (D-483).

    Redireciona para o mount `/videos` com `?v=<mtime>`, no mesmo arranjo de
    `cortes/{id}/video-bruto`: sem o cache-buster o navegador serve o arquivo
    antigo depois de um render novo, e o operador julga o vídeo errado.

    Até aqui NÃO havia como assistir a um short renderizado — o MP4 ia para o
    disco e só a publicação o lia. Uma prévia que não se pode ver não serve para
    nada, então a rota nasce junto com ela.
    """
    from app.channel_paths import resolver_do_projeto
    from app.models import Corte, Short
    from fastapi.responses import RedirectResponse

    if estagio not in {"previa", "final"}:
        raise HTTPException(status_code=404, detail=f"Estagio {estagio!r} desconhecido.")

    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise HTTPException(status_code=404, detail="Short nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise HTTPException(status_code=404, detail="Corte do short nao encontrado")
        relativo = short.arquivo_short_path if estagio == "final" else short.arquivo_previa_path
        projeto_id = corte.projeto_id

    if not relativo:
        raise HTTPException(status_code=404, detail=f"Este short ainda nao tem {estagio}.")

    caminho = resolver_do_projeto(relativo, projeto_id)
    if not caminho.is_file():
        raise HTTPException(
            status_code=404, detail="O arquivo foi registrado mas nao esta mais em disco."
        )

    try:
        mtime = int(caminho.stat().st_mtime)
    except OSError:
        mtime = 0
    return RedirectResponse(
        url=f"/videos/{projeto_id}/{relativo}?v={mtime}",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/{short_id}/progresso")
async def progresso_do_render(short_id: str):
    """Em que passo o render está e há quanto tempo (D-485).

    `render` é `null` quando não houve render deste short neste processo — a
    tela cai no estado do banco (tem prévia, tem final, ou nenhum), que é a
    fonte de verdade que sobrevive a um reload do uvicorn.
    """
    from app.services.shorts_progress import ShortsProgress

    return {"render": ShortsProgress.get(short_id)}


@router.get("/{short_id}/palco")
async def palco_do_short(short_id: str):
    """O palco deste short em coordenadas de desenho — a matéria da prévia (D-489)."""
    from app.services import palco_shorts

    try:
        return await palco_shorts.plano_desenhavel(short_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
