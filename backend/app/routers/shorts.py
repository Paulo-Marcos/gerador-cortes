"""Router: fábrica de shorts do corte Fire (D-455).

Endpoints:
  GET  /fires                     — os cortes Fire cujo bruto ainda esta em disco
  GET  /corte/{corte_id}          — os shorts do corte, do melhor palpite ao pior
  POST /corte/{corte_id}          — cria um short a mao, que a regeracao nao apaga
  POST /corte/{corte_id}/indicar  — poe o corte na fabrica sem depender do Fire
  GET  /corte/{corte_id}/elegibilidade — se a tela do bruto deve oferecer a fábrica
  POST /corte/{corte_id}/gerar    — caminho MANUAL: regera o bruto se preciso e propõe
  POST /corte/{corte_id}/sugerir  — propõe agora (o fluxo normal é automático)
  GET  /corte/{corte_id}/transcricao — palavras com tempo, para a prévia de legenda
  GET  /palco/arranjos            — como a tela pode ser montada, e o que falta
  GET  /palco/fundos              — as cores do canal oferecidas como fundo
  GET  /corte/{corte_id}/palco    — de onde vem as regioes deste corte
  PUT  /corte/{corte_id}/palco    — aponta um preset do canal para o corte
  PATCH /{short_id}               — a decisão do operador: status e/ou bordas
  PUT  /{short_id}/cenas          — as cenas do short (hook, numero, citacao, cta)
  POST /{short_id}/cenas/sugerir  — a IA propoe os cartoes deste trecho
  POST /{short_id}/enquadrar      — acha o rosto no trecho e centra o 9:16 nele
  POST /{short_id}/previa         — o vertical SEM filtro, para julgar antes
  GET  /{short_id}/progresso      — em que passo o render esta e ha quanto tempo
  GET  /{short_id}/palco          — o palco em coordenadas de desenho (previa)
  POST /{short_id}/palco/simular  — o palco que certos ajustes dariam, sem gravar
  POST /{short_id}/renderizar     — produz o MP4 final do candidato
  GET  /{short_id}/video          — assiste a previa ou ao final
  GET  /{short_id}/publicacao     — os pacotes prontos, por plataforma
  POST /{short_id}/publicar/{plataforma} — envia (API) ou monta o pacote (manual)
  POST /corte/{corte_id}/publicar/tiktok-horizontal — o MP4 16:9 no TikTok
  POST /corte/{corte_id}/publicar/tiktok-horizontal/staging — pacote + pasta aberta
  POST /corte/{corte_id}/publicar/tiktok-horizontal/assistido — robo deixa pronto
  POST /corte/{corte_id}/publicar/tiktok-horizontal/confirmar — marca que subiu
  DELETE /corte/{corte_id}/bruto  — libera o disco e encerra a fábrica do corte

O disparo padrão é o fim da geração do bruto de um corte marcado com Fire. O POST
existe para o caso que o automático não cobre: o corte virou Fire **depois** de o
bruto já estar pronto, ou o corpo da skill mudou em `/canais` e você quer o
palpite novo sem regerar o vídeo.

Router próprio (e não `routers/cortes.py`, travado por quatro features sem
relação com isto), no mesmo padrão de `avaliacao_bruto`.
"""

from __future__ import annotations

import logging
from pathlib import Path

from app.database import AsyncSessionLocal
from app.services import shorts as shorts_store
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# A pagina de upload do TikTok no desktop. Constante nomeada porque ela e um
# fato externo que pode mudar sem aviso — e uma URL solta no meio do codigo e
# uma que ninguem acha quando muda.
URL_UPLOAD_TIKTOK = "https://www.tiktok.com/tiktokstudio/upload?from=upload"


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


class IndicarRequest(BaseModel):
    """Marca (ou desmarca) o corte como candidato a virar short."""

    indicado: bool = True


@router.post("/corte/{corte_id}/indicar")
async def indicar_para_shorts(corte_id: str, body: IndicarRequest):
    """Poe o corte na fabrica de shorts sem depender do Fire (D-502).

    Fire e um julgamento sobre o CORTE; indicar e uma aposta sobre um TRECHO
    dele. Um corte mediano pode ter um momento otimo, e obrigar a marcar Fire
    para chegar nele seria mentir sobre o corte inteiro.
    """
    try:
        return await shorts_store.indicar_para_shorts(corte_id, body.indicado)
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


@router.get("/palco/fundos")
async def fundos_de_palco():
    """As cores do canal oferecidas como fundo do short (D-499).

    Sai da paleta do tema, e não de uma lista aqui: cravar as cores criaria uma
    segunda fonte, e o canal trocaria o tema sem o seletor saber.
    """
    from app.services import palco_shorts

    return {"fundos": palco_shorts.catalogo_fundos()}


@router.get("/palco/arranjos")
async def arranjos_de_palco(corte_id: str = ""):
    """Como a tela do short pode ser montada (D-507).

    Aceita `corte_id` para dizer o que as regiões DAQUELE corte permitem: sem
    isso a tela ofereceria tela dividida a um corte que só tem a pessoa marcada,
    e o operador descobriria pelo resultado.
    """
    from app.services import palco_shorts

    regioes = None
    if corte_id:
        try:
            regioes = (await palco_shorts.descrever(corte_id))["regioes"]
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {"arranjos": palco_shorts.catalogo_arranjos(regioes)}


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


@router.get("/corte/{corte_id}/waveform-peaks")
async def waveform_do_bruto(corte_id: str, refresh: bool = False, points: int | None = None):
    """Os picos de audio do BRUTO, para a regua da curadoria (D-541).

    Nao reusa `/cortes/{id}/waveform-peaks`: aquele desenha o PROXY do corte —
    uma janela da live, com respiro antes e depois. O bruto e outro arquivo, mais
    curto, e os instantes internos nao batem, porque tudo o que foi removido
    desloca o que vem depois. A onda errada e pior que onda nenhuma: ela parece
    certa e manda cortar no silencio que esta noutro lugar.
    """
    from app.services import waveform_bruto

    try:
        return await waveform_bruto.picos_do_bruto(corte_id, force=refresh, pontos=points)
    except waveform_bruto.OndaIlegivel as exc:
        # 422 e nao 500: o arquivo e que esta quebrado, e a mensagem diz qual.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    arranjo_palco: str | None = None
    janela_cheia: str | None = None
    ajustes_palco: dict | None = None
    palco_preset: str | None = None
    moldura: str | None = None
    recortes_palco: dict | None = None
    fundo_palco: str | None = None


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
                arranjo_palco=body.arranjo_palco,
                janela_cheia=body.janela_cheia,
                ajustes_palco=body.ajustes_palco,
                recortes_palco=body.recortes_palco,
                fundo_palco=body.fundo_palco,
                palco_preset=body.palco_preset,
                moldura=body.moldura,
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


@router.post("/{short_id}/enquadrar")
async def enquadrar(short_id: str):
    """Acha o rosto de quem fala e centra o recorte 9:16 nele (D-477).

    Síncrono: são ~2 segundos, e o operador está olhando para a janela de
    enquadramento quando pede. Devolve o short já com o foco gravado, mais o
    veredito — inclusive quando ele é "não achei", que é resposta e não erro.
    """
    from app.services import enquadramento_shorts

    try:
        return await enquadramento_shorts.enquadrar_pelo_rosto(short_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except enquadramento_shorts.DeteccaoIndisponivel as exc:
        # 503 e nao 422: o trecho esta bom, quem nao esta disponivel e o
        # detector. A tela precisa dizer "tente de novo", nao "arrume o corte".
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{short_id}/cenas/sugerir")
async def sugerir_cenas(short_id: str):
    """A IA propõe os cartões deste trecho e já os grava (D-497).

    Síncrono de propósito: o operador está olhando para o painel de cenas quando
    pede, e um fire-and-forget o obrigaria a ficar recarregando para saber se
    chegou. A chamada leva alguns segundos — menos que a de propor os shorts,
    porque a transcrição é a de um trecho, não a do bruto inteiro.
    """
    from app.services.claude_ia import ClaudeIaService

    try:
        return await ClaudeIaService.sugerir_cenas_do_short_via_claude(short_id)
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


class SimularPalcoRequest(BaseModel):
    """Ajustes de RASCUNHO — nada disto e gravado."""

    ajustes_palco: dict = {}


@router.post("/{short_id}/palco/simular")
async def simular_palco(short_id: str, body: SimularPalcoRequest):
    """O palco que ESTES ajustes produziriam, sem gravar nada (D-500).

    Existe para a prévia redesenhar DURANTE o arraste. A alternativa seria
    recalcular no frontend, o que exigiria portar `escalar`/cobrir-caber para
    lá — a segunda implementação de geometria que este épico evitou, e que já
    custou dois bugs de divergência silenciosa.

    Assim a conta continua sendo uma só, no domínio, e o banco só é tocado
    quando o operador solta o bloco.
    """
    from app.services import palco_shorts

    try:
        return await palco_shorts.plano_desenhavel(short_id, body.ajustes_palco)
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


class StagingRequest(BaseModel):
    """Se a macro deve abrir a pasta do pacote no explorador."""

    abrir_pasta: bool = True


class CapaTikTokRequest(BaseModel):
    """O que vai na faixa central e qual texto vai por cima.

    `origem="ia"` (padrão) usa a arte que o operador subiu; `"frame"` tira um
    still do vídeo, que é o escape hatch.

    `etiqueta` vazia usa o `texto_capa` do metadado — o mesmo texto da thumbnail
    do YouTube. Só quando ele também está vazio a skill entra, e só se
    `sugerir_etiqueta` permitir.
    """

    etiqueta: str = ""
    origem: str = "ia"
    sugerir_etiqueta: bool = True
    instante_seg: float | None = None


@router.post("/corte/{corte_id}/capa-tiktok")
async def gerar_capa_tiktok(corte_id: str, body: CapaTikTokRequest):
    """Monta a capa VERTICAL do corte para o TikTok (D-519).

    Mora neste router, e nao no de metadados, porque a capa pertence ao destino:
    ela so existe por causa do quadro 9:16 do TikTok, e e este modulo que ja
    cuida da publicacao la. O router de metadados continua dono da thumbnail
    16:9 do YouTube, que e outra imagem para outro trabalho.
    """
    from app.services import capa_tiktok
    from app.services.claude_ia import ClaudeIaService

    # O texto da capa ja curado tem prioridade sobre a skill: quem escolheu
    # aquela palavra para a thumbnail do YouTube ja decidiu como o corte se
    # chama, e uma segunda versao criaria duas identidades para o mesmo video.
    etiqueta = body.etiqueta.strip()
    if not etiqueta and body.sugerir_etiqueta and not await capa_tiktok.tem_texto_de_capa(corte_id):
        try:
            etiqueta = await ClaudeIaService.sugerir_etiqueta_capa_via_claude(corte_id)
        except Exception:
            # A etiqueta e desejavel, nao obrigatoria: uma capa com a arte e o
            # selo continua valendo, e ficar sem capa por causa de tres palavras
            # seria trocar o principal pelo acessorio.
            logger.exception("[CapaTikTok] nao consegui sugerir a etiqueta de %s", corte_id)
            etiqueta = ""

    try:
        caminho = await capa_tiktok.gerar(
            corte_id,
            etiqueta=etiqueta,
            origem=body.origem,
            instante_seg=body.instante_seg,
        )
    except capa_tiktok.CapaTikTokError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"capa": str(caminho), "nome": caminho.name, "etiqueta": etiqueta}


@router.post("/corte/{corte_id}/capa-tiktok/prompt")
async def gerar_prompt_da_capa_tiktok(corte_id: str):
    """Escreve o prompt da ARTE da capa e o guarda no metadado (D-524).

    O app para aqui de proposito: quem desenha e o operador, no agente capista
    dele. E o mesmo fluxo manual do horizontal — copiar o prompt, gerar a
    imagem, trazer de volta.
    """
    from app.services import capa_tiktok

    try:
        prompt = await capa_tiktok.gerar_prompt_da_arte(corte_id)
    except capa_tiktok.CapaTikTokError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"prompt": prompt}


@router.post("/corte/{corte_id}/capa-tiktok/arte")
async def subir_arte_da_capa_tiktok(corte_id: str, arquivo: UploadFile = File(...)):
    """Recebe a ilustracao 16:9 que vai na faixa central, e monta a capa.

    Monta na sequencia porque e o gesto natural: quem acabou de subir a arte
    quer ver a capa, nao clicar num segundo botao para descobrir se ficou boa.
    """
    from app.services import capa_tiktok

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")

    try:
        await capa_tiktok.salvar_arte(corte_id, conteudo, arquivo.filename or "arte.png")
        caminho = await capa_tiktok.gerar(corte_id)
    except capa_tiktok.CapaTikTokError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"capa": str(caminho), "nome": caminho.name}


@router.post("/corte/{corte_id}/capa-tiktok/upload")
async def subir_capa_tiktok(corte_id: str, arquivo: UploadFile = File(...)):
    """Recebe uma capa 9:16 feita por fora, no lugar da montada."""
    from app.services import capa_tiktok

    conteudo = await arquivo.read()
    if not conteudo:
        raise HTTPException(status_code=422, detail="Arquivo vazio.")

    try:
        caminho = await capa_tiktok.salvar_upload(
            corte_id, conteudo, arquivo.filename or "capa.png"
        )
    except capa_tiktok.CapaTikTokError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {"capa": str(caminho), "nome": caminho.name}


@router.post("/corte/{corte_id}/publicar/tiktok-horizontal/confirmar")
async def confirmar_tiktok_horizontal(corte_id: str):
    """Marca que o operador subiu ESTE corte para o TikTok (D-512).

    Precisa ser um passo explícito porque o TikTok é publicação manual — a API
    só posta em modo privado sem auditoria, então o app não tem como saber.

    A marca não é enfeite: a limpeza automática do `upload_ready/video.mp4` só
    roda quando TODOS os destinos publicaram. Antes ela apagava o arquivo no fim
    do upload do YouTube, e o TikTok — que sobe o MESMO MP4 — ficava sem
    material, sem volta a não ser render novo.
    """
    from datetime import datetime

    from app.database import AsyncSessionLocal
    from app.models import Corte

    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise HTTPException(status_code=404, detail=f"Corte {corte_id!r} nao encontrado")
        corte.tiktok_publicado_em = datetime.utcnow()
        await db.commit()
        return {"tiktok_publicado_em": corte.tiktok_publicado_em.isoformat()}


@router.post("/corte/{corte_id}/publicar/tiktok-horizontal/staging")
async def staging_tiktok_horizontal(corte_id: str, body: StagingRequest):
    """Monta o pacote e deixa TUDO a um passo do upload (D-503).

    A "macro" que dá para fazer com honestidade. O que ela faz:

      - monta o pacote (MP4 + texto + metadados + capa) na pasta do corte;
      - abre essa pasta no explorador, para o arquivo estar à mão;
      - devolve a legenda e a URL de upload, que a tela abre numa aba nova.

    O que ela NÃO faz, e por quê: logar. Automatizar o login exigiria guardar a
    senha do operador e viola os Termos do TikTok, que proíbem acesso
    automatizado. O risco não é a macro falhar — é a CONTA ser banida, e aí ele
    perde o canal, não a automação. Abrindo a aba, o navegador dele já está
    logado e nenhuma credencial passa por este app.

    Publicar por API tampouco resolve hoje: cliente não auditado só posta
    SELF_ONLY, com a conta privada no momento do post (pesquisa de 2026-09).
    """
    from app.services import abrir_no_sistema

    resultado = await publicar_corte_no_tiktok(corte_id)

    pasta = resultado.get("pasta")
    aberta, erro_ao_abrir = False, None
    if body.abrir_pasta and pasta:
        try:
            abrir_no_sistema.abrir_pasta(Path(pasta))
            aberta = True
        except abrir_no_sistema.NaoConsegueAbrir as exc:
            # Nao derruba o fluxo: o pacote esta em disco e o caminho volta na
            # resposta. Falhar aqui perderia o trabalho ja feito por causa do
            # passo mais dispensavel dos tres.
            erro_ao_abrir = str(exc)

    return {
        **resultado,
        "pasta_aberta": aberta,
        "erro_ao_abrir": erro_ao_abrir,
        "url_upload": URL_UPLOAD_TIKTOK,
    }


@router.post("/corte/{corte_id}/publicar/tiktok-horizontal/assistido")
async def assistido_tiktok_horizontal(corte_id: str):
    """O robô faz os quatro passos repetitivos e para antes de publicar (D-537).

    A staging (D-503) montava o pacote e abria a aba; o resto — arrastar o MP4,
    colar a legenda, subir a capa, esperar — sobrava para o operador, toda vez.

    Isto faz esses quatro, no Chrome dele, com a sessão que ele mesmo abriu. E
    para com o *Publicar* aceso sem tocar nele: até ali tudo é reversível com um
    F5, e depois dali uma legenda errada é um post público no canal.
    """
    return await _assistir_no_tiktok(await publicar_corte_no_tiktok(corte_id))


@router.post("/{short_id}/publicar/tiktok/assistido")
async def assistido_tiktok_do_short(short_id: str):
    """O mesmo robô, para o short vertical."""
    return await _assistir_no_tiktok(await publicar(short_id, "tiktok"))


async def _assistir_no_tiktok(pacote: dict) -> dict:
    """Monta a legenda do pacote e entrega o roteiro ao navegador.

    Recebe o pacote JÁ montado em vez de montá-lo: assim o corte horizontal e o
    short vertical — que chegam por caminhos diferentes — compartilham este
    trecho sem que nenhum dos dois precise saber do outro.
    """
    from app.domain.publicacao import legenda_unica
    from app.domain.tiktok_studio import RoteiroInterrompido
    from app.services import tiktok_studio

    legenda = legenda_unica(pacote.get("titulo", ""), pacote.get("descricao", ""))
    capa = pacote.get("capa") or ""

    try:
        relatorio = await tiktok_studio.subir_assistido(
            video=Path(pacote["video"]),
            legenda=legenda,
            capa=Path(capa) if capa else None,
        )
    except RoteiroInterrompido as exc:
        # 422 e nao 500: nao e defeito nosso, e uma condicao que o operador
        # resolve — logar, subir a mao, ou avisar que a pagina mudou. A tela
        # mostra `detail` direto, e ele ja e a instrucao.
        raise HTTPException(
            status_code=422,
            detail={"mensagem": str(exc), "passo": exc.passo.value},
        ) from exc

    return {**pacote, **relatorio, "legenda": legenda}


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
