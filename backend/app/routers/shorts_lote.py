"""Router: o lote de publicação (D-564) e a agenda que o distribui (D-908).

Endpoints (montados sob `/api/shorts`, pelo router dos shorts):
  POST /lote/agenda   — a data de cada item ANTES do clique, pela janela do canal
  POST /lote          — publica vários, nas plataformas escolhidas
  GET  /lote          — o lote em andamento, raia por raia
  POST /lote/cancelar — interrompe o lote
  POST /lote/confirmar — o "publiquei" do destino manual

Saiu de `routers/shorts.py` quando ele chegou ao teto de tamanho (D-771), no
mesmo arranjo de `fabrica_de_shorts`: um sub-router incluído pelo principal,
sem registro novo em `main.py` (travado).
"""

from __future__ import annotations

from app.domain.publicacao.agendamento import Agendamento, AgendamentoInvalido, validar
from app.domain.publicacao.publicacao import Plataforma
from app.routers import shorts_lote_schemas as esquemas
from app.services import escalonamento_do_lote, publicacao_lote
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


def ler_agendamento(texto: str | None, plataforma: str) -> Agendamento | None:
    """Le a data da tela e RECUSA aqui o que a plataforma recusaria la.

    422 e nao 500: uma data no passado, ou um minuto que o seletor do TikTok nao
    tem, nao e defeito nosso — e uma escolha que o operador refaz em dois
    segundos, desde que alguem lhe diga qual e o problema.
    """
    try:
        agendamento = Agendamento.de_texto(texto)
        if agendamento:
            validar(agendamento, plataforma)
    except AgendamentoInvalido as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return agendamento


def _ler_alvo(bruto: str) -> tuple[str, str]:
    """ "short:uuid" vira ("short", "uuid"); sem prefixo, assume short.

    O prefixo existe porque o MESMO lote mistura os dois: o short vertical e o
    MP4 horizontal do corte vao pelo mesmo contrato, e sem o tipo o servico nao
    saberia de qual arquivo montar o pacote.
    """
    tipo, _, identificador = bruto.partition(":")
    if not identificador:
        return publicacao_lote.ALVO_SHORT, tipo
    if tipo not in (publicacao_lote.ALVO_SHORT, publicacao_lote.ALVO_CORTE):
        raise HTTPException(status_code=422, detail=f"Tipo de alvo desconhecido: {tipo!r}")
    return tipo, identificador


def _ler_plataformas(nomes: list[str]) -> list[Plataforma]:
    try:
        return [Plataforma(p) for p in nomes]
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=f"Plataforma desconhecida: {exc}") from exc


class ItemDaAgendaRequest(BaseModel):
    """A data de UM (alvo, plataforma), como a tela a ajustou (D-908)."""

    alvo: str
    plataforma: str
    # `AAAA-MM-DDTHH:MM` local; vazio é "ficou sem data" — o lote pula o item.
    agendar_para: str = ""


class PreverAgendaRequest(BaseModel):
    alvos: list[str]
    plataformas: list[str]


class LoteRequest(BaseModel):
    """O lote que o operador montou na tela.

    `alvos` são pares `tipo:id` ("short:uuid" ou "corte:uuid") na ORDEM em que
    ele escolheu — a ordem da tela vira a ordem da fila. `plataformas` são os
    destinos que ele marcou; o mesmo conjunto vale para todos os alvos, que é
    como a seleção acontece na prática ("estes cinco, nestas duas redes").
    """

    alvos: list[str]
    plataformas: list[str]
    # D-564: o robo do TikTok sobe pelo Chrome, em vez de so montar a pasta.
    tiktok_assistido: bool = False
    # D-564 onda 3: o mesmo robo, no compositor do instagram.com.
    instagram_assistido: bool = False
    # D-564: e, se ligado, tambem aperta o Publicar. Desligado por padrao de
    # proposito — ate o clique tudo e reversivel com um F5.
    publicar_sozinho: bool = False
    # D-580: uma data para o lote inteiro. Cada destino a honra como consegue —
    # e os que nao conseguem avisam, em vez de engolir.
    agendar_para: str = ""
    # D-590: sobe de novo o que ja foi publicado, em vez de pular.
    republicar: bool = False
    # D-908: uma data por item, vinda da previsão (e dos ajustes do operador).
    # Quando vem, manda ela — e `agendar_para` é ignorado.
    agenda: list[ItemDaAgendaRequest] = []


@router.post("/lote/agenda", response_model=esquemas.AgendaPrevistaResponse)
async def prever_agenda(body: PreverAgendaRequest):
    """A data que a janela do canal propõe para cada item, antes de publicar (D-908).

    Aceita também o destino `youtube`, o do vídeo horizontal (D-934): o lote do
    YouTube longo e o envio avulso pedem a agenda aqui e publicam pelo upload.
    """
    youtube = escalonamento_do_lote.YOUTUBE_LONGO
    plataformas = _ler_plataformas([p for p in body.plataformas if p != youtube])
    alvos = [_ler_alvo(bruto) for bruto in body.alvos]
    linhas = await escalonamento_do_lote.prever(alvos, plataformas)
    if youtube in body.plataformas:
        linhas += await escalonamento_do_lote.prever_youtube(alvos)
    return {"itens": [linha.como_dict() for linha in linhas]}


def _ler_agenda(body: LoteRequest) -> publicacao_lote.AgendaDoLote | None:
    """A agenda por item, validada contra cada plataforma; `None` sem agenda."""
    if not body.agenda:
        return None
    agenda: publicacao_lote.AgendaDoLote = {}
    for item in body.agenda:
        _, alvo_id = _ler_alvo(item.alvo)
        agenda[(alvo_id, item.plataforma)] = ler_agendamento(item.agendar_para, item.plataforma)
    return agenda


@router.post("/lote", response_model=esquemas.LoteDePublicacao)
async def criar_lote(body: LoteRequest):
    """Dispara o lote: uma raia por plataforma, cada uma no seu passo (D-564)."""
    plataformas = _ler_plataformas(body.plataformas)
    if not plataformas or not body.alvos:
        raise HTTPException(status_code=422, detail="Escolha ao menos um video e uma plataforma.")

    alvos = [_ler_alvo(bruto) for bruto in body.alvos]
    agenda = _ler_agenda(body)

    # Validado contra CADA plataforma escolhida: 14:03 serve para o YouTube e
    # nao serve para o TikTok, e o lote que mistura os dois tem de recusar.
    agendamento = None
    if agenda is None:
        for plataforma in plataformas:
            agendamento = ler_agendamento(body.agendar_para, plataforma.value)

    try:
        lote = await publicacao_lote.criar(
            alvos=alvos,
            plataformas=plataformas,
            opcoes=publicacao_lote.OpcoesDoLote(
                tiktok_assistido=body.tiktok_assistido,
                instagram_assistido=body.instagram_assistido,
                publicar_sozinho=body.publicar_sozinho,
                agendamento=agendamento,
                republicar=body.republicar,
            ),
            agenda=agenda,
        )
    except publicacao_lote.LoteEmAndamento as exc:
        # 409 e nao 422: nao ha nada de errado com o pedido — ele so chegou na
        # hora em que outro lote ainda esta rodando.
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return lote.como_dict()


@router.get("/lote", response_model=esquemas.LoteAtualResponse)
async def ver_lote():
    """O lote em andamento, ou o ultimo que rodou. `null` quando nunca houve um."""
    lote = publicacao_lote.lote_atual()
    return {"lote": lote.como_dict() if lote else None}


@router.post("/lote/cancelar", response_model=esquemas.LoteCanceladoResponse)
async def cancelar_lote():
    """Interrompe o lote na hora: os que esperam viram cancelados e o robo larga a vigilia.

    Devolve o lote ja mudado (D-591), para a tela trocar sem esperar o proximo
    ciclo do polling — o atraso era parte de o botao parecer morto.
    """
    lote = await publicacao_lote.cancelar()
    return {"cancelado": lote is not None, "lote": lote.como_dict() if lote else None}


class ConfirmarPublicacaoRequest(BaseModel):
    """O "publiquei" do destino manual, onde o upload acontece longe daqui."""

    alvo_id: str
    plataforma: str
    # D-603: o tipo vem junto porque a marca pode ser o PRIMEIRO registro deste
    # video — e ai ninguem mais sabe se o alvo e o short vertical ou o MP4 do
    # corte. No caminho do lote o tipo ja estava gravado e o default basta.
    alvo_tipo: str = "short"
    # Opcional: o link do post, quando o operador tem ele a mao. Serve para a
    # tela oferecer o "ver" do mesmo jeito que oferece no que subiu por API.
    url: str = ""


@router.post("/lote/confirmar", response_model=esquemas.LoteConfirmadoResponse)
async def confirmar_publicacao(body: ConfirmarPublicacaoRequest):
    """Marca que ESTE item subiu — o que a maquina nao tem como saber sozinha.

    D-603: vale tanto para o item que esta esperando o clique quanto para o que
    deu erro e o operador terminou na mao, no proprio app da rede. Nos dois
    casos o fato e o mesmo ("esta no ar"), e quem sabe dele e ele.
    """
    try:
        plataforma = Plataforma(body.plataforma)
    except ValueError as exc:
        raise HTTPException(
            status_code=404, detail=f"Plataforma {body.plataforma!r} desconhecida."
        ) from exc

    if body.alvo_tipo not in (publicacao_lote.ALVO_SHORT, publicacao_lote.ALVO_CORTE):
        raise HTTPException(
            status_code=422, detail=f"Tipo de alvo desconhecido: {body.alvo_tipo!r}"
        )

    await publicacao_lote.confirmar(
        body.alvo_id, plataforma, alvo_tipo=body.alvo_tipo, url=body.url
    )
    return {"confirmado": True}
