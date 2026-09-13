"""O lote de publicação: vários shorts, várias plataformas, cada uma no seu passo (D-564).

## Por que uma RAIA por plataforma, e não uma fila só

Porque uma fila só anda no passo da mais lenta. O YouTube sobe sozinho em um
minuto; o TikTok termina esperando o clique do operador, que pode demorar meia
hora. Enfileirados juntos, o YouTube ficaria parado por uma razão que não é
dele — e o lote inteiro pareceria travado.

Então cada plataforma tem sua raia, com seu worker. Entre raias, paralelo. Dentro
da raia, série — e a série não é preciosismo: no TikTok ela é FÍSICA. A vigília
que detecta a publicação procura "a aba que está em /upload" (D-546), e com duas
abas subindo ao mesmo tempo ela não sabe qual é qual. Duas de uma vez marcariam
o vídeo errado como publicado, e é a marca que libera a limpeza do MP4 (D-512).

## O que este serviço NÃO decide

O ritmo. Quantos cabem hoje, quanto esperar entre um e outro e se há um humano
no fim — isso mora em `domain/ritmo_publicacao.py`, puro e testável sem rede.
Aqui é só o braço que executa e guarda o resultado.

## Um lote de cada vez

Não por limitação técnica, mas porque é um operador só, com um Chrome só e uma
conta só de cada plataforma. Dois lotes concorrentes disputariam a mesma aba e a
mesma cota, e o segundo estragaria o primeiro sem que ninguém tivesse pedido.
"""

from __future__ import annotations

import logging
import threading
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from app.database import AsyncSessionLocal
from app.domain.agendamento import Agendamento
from app.domain.publicacao import LIMITES, ModoPublicacao, Plataforma
from app.domain.ritmo_publicacao import (
    Cadencia,
    EstadoItem,
    cadencia_de,
    motivo_para_parar,
    publicados_no_dia,
)
from app.models import PublicacaoShort
from app.services import (
    destinos_shorts,  # noqa: F401 — registra os destinos
    publicacao_destinos,
)
from app.services.publicacao_destinos import Destino
from app.services.tasks import fire_and_forget
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Frases prontas, num lugar só: o texto do estado é a única coisa que o
# operador tem para saber o que fazer a seguir.
RECADO_DA_ABA = "a aba esta pronta no Chrome — confira e clique em Publicar"
SUBIU_NO_TIKTOK = "publicado no TikTok"
NAO_DEU_PARA_CONFIRMAR = (
    "nao consegui confirmar a publicacao (a aba pode ter sido fechada); "
    "marque aqui se voce publicou"
)
CONFIRMADO_A_MAO = "voce marcou como publicado"

ALVO_SHORT = "short"
ALVO_CORTE = "corte"


@dataclass(frozen=True)
class OpcoesDoLote:
    """As escolhas que mudam COMO cada plataforma é publicada (D-564).

    `tiktok_assistido` e `instagram_assistido` decidem o TRANSPORTE: com eles o
    robô abre o Chrome e sobe; sem eles, o lote só monta a pasta. Continuam
    sendo escolhas porque o assistido depende de seletores de páginas que não
    são nossas — no dia em que uma delas se redesenhar, desligar aquela devolve
    o caminho que funciona, sem derrubar a outra.

    São dois interruptores e não um justamente por isso: as duas páginas quebram
    em dias diferentes.

    `publicar_sozinho` decide QUEM aperta o botão, e vale para as duas. Desligado
    por padrão, e essa assimetria é intencional: até o clique tudo é reversível.
    """

    tiktok_assistido: bool = False
    instagram_assistido: bool = False
    publicar_sozinho: bool = False
    # D-580: quando o operador marca dia e hora, ela vale para o LOTE inteiro —
    # cada destino a honra do jeito que consegue (a API do YouTube com
    # `publishAt`, o robo do TikTok clicando no Studio) e os que nao conseguem
    # dizem isso em vez de engolir a data.
    agendamento: Agendamento | None = None
    # D-590: sobe de novo o que já foi publicado. Existe porque "já subiu" não
    # quer dizer "subiu certo" — um short com a capa errada no ar precisa voltar
    # para a fila. Desligado por padrão: republicar em silêncio duplicaria vídeo.
    republicar: bool = False


class LoteEmAndamento(RuntimeError):
    """Já existe um lote rodando — e um operador só não publica dois ao mesmo tempo."""


@dataclass
class ItemDoLote:
    """Um vídeo indo para UMA plataforma. A unidade de trabalho da raia."""

    alvo_tipo: str
    alvo_id: str
    plataforma: Plataforma
    rotulo: str
    """O título do short, para a tela não mostrar um uuid."""
    registro_id: str
    estado: EstadoItem = EstadoItem.AGUARDANDO
    detalhe: str = ""
    url: str = ""
    # D-591: o sinal que tira a raia da vigília do robô. Sem ele, "cancelar" e
    # "publiquei" mudavam o estado, mas a raia seguia presa esperando a aba — e
    # os itens seguintes ficavam parados por até meia hora.
    #
    # `threading` e não `asyncio`: quem lê o sinal é a vigília, que roda num
    # thread (Playwright síncrono, D-369).
    espera: threading.Event = field(default_factory=threading.Event, repr=False, compare=False)

    def como_dict(self) -> dict:
        return {
            "alvo_tipo": self.alvo_tipo,
            "alvo_id": self.alvo_id,
            "plataforma": self.plataforma.value,
            "plataforma_rotulo": LIMITES[self.plataforma].rotulo,
            "rotulo": self.rotulo,
            "estado": self.estado.value,
            "detalhe": self.detalhe,
            "url": self.url,
        }


@dataclass
class Lote:
    """O lote inteiro: os itens, as raias e o que já parou."""

    id: str
    criado_em: datetime
    itens: list[ItemDoLote] = field(default_factory=list)
    opcoes: OpcoesDoLote = field(default_factory=OpcoesDoLote)
    cancelado: bool = False
    avisos: dict[str, str] = field(default_factory=dict)
    """Por plataforma: por que a raia parou antes do fim (cota, sessão, layout)."""

    def da_plataforma(self, plataforma: Plataforma) -> list[ItemDoLote]:
        return [i for i in self.itens if i.plataforma is plataforma]

    @property
    def plataformas(self) -> list[Plataforma]:
        """Na ordem canônica, e sem repetir."""
        return [p for p in Plataforma if any(i.plataforma is p for i in self.itens)]

    @property
    def terminou(self) -> bool:
        return all(i.estado in _PARADOS for i in self.itens)

    def como_dict(self) -> dict:
        return {
            "lote_id": self.id,
            "criado_em": self.criado_em.isoformat(),
            "cancelado": self.cancelado,
            "terminou": self.terminou,
            "tiktok_assistido": self.opcoes.tiktok_assistido,
            "instagram_assistido": self.opcoes.instagram_assistido,
            "publicar_sozinho": self.opcoes.publicar_sozinho,
            "raias": [
                {
                    "plataforma": p.value,
                    "rotulo": LIMITES[p].rotulo,
                    "exige_humano": cadencia_de(p).exige_humano,
                    "aviso": self.avisos.get(p.value, ""),
                    "itens": [i.como_dict() for i in self.da_plataforma(p)],
                }
                for p in self.plataformas
            ],
        }


# Estados em que a raia não volta a mexer no item. `SUA_VEZ` NÃO está aqui: o
# item ainda pode virar `PUBLICADO` quando o operador confirmar (ou quando a
# vigília do TikTok vir a publicação, na onda seguinte).
_PARADOS: frozenset[EstadoItem] = frozenset(
    {
        EstadoItem.PUBLICADO,
        EstadoItem.ERRO,
        EstadoItem.PULADO,
        EstadoItem.CANCELADO,
        EstadoItem.SUA_VEZ,
    }
)


_lote_atual: Lote | None = None


def lote_atual() -> Lote | None:
    return _lote_atual


async def criar(
    *,
    alvos: list[tuple[str, str]],
    plataformas: list[Plataforma],
    opcoes: OpcoesDoLote | None = None,
) -> Lote:
    """Monta o lote e solta uma raia por plataforma.

    `alvos` são pares `(alvo_tipo, alvo_id)` na ordem em que o operador escolheu
    — a ordem da tela é a ordem da fila, porque foi ela que ele pensou.

    O que já subiu entra como `PULADO`, e não some da lista: ver "já está no
    TikTok" é resposta; um item que desaparece é dúvida.
    """
    global _lote_atual

    if _lote_atual is not None and not _lote_atual.terminou:
        raise LoteEmAndamento("Ja existe um lote em andamento. Espere ele terminar ou cancele.")

    lote = Lote(
        id=str(uuid.uuid4()),
        criado_em=datetime.utcnow(),
        opcoes=opcoes or OpcoesDoLote(),
    )
    publicados = {} if lote.opcoes.republicar else await _ja_publicados([a for _, a in alvos])
    rotulos = await _rotulos_dos_alvos(alvos)

    for alvo_tipo, alvo_id in alvos:
        for plataforma in plataformas:
            ja_foi = plataforma.value in publicados.get(alvo_id, set())
            item = ItemDoLote(
                alvo_tipo=alvo_tipo,
                alvo_id=alvo_id,
                plataforma=plataforma,
                rotulo=rotulos.get(alvo_id, alvo_id[:8]),
                registro_id=str(uuid.uuid4()),
                estado=EstadoItem.PULADO if ja_foi else EstadoItem.AGUARDANDO,
                detalhe="ja publicado antes" if ja_foi else "",
            )
            lote.itens.append(item)

    await _gravar_registros(lote)
    _lote_atual = lote

    for plataforma in lote.plataformas:
        fire_and_forget(
            _rodar_raia(lote, plataforma),
            name=f"publicar-{plataforma.value}-{lote.id[:8]}",
        )
    return lote


async def cancelar() -> Lote | None:
    """Interrompe o lote atual — na hora, e não no próximo item. Devolve o lote.

    D-591: antes isto só ligava uma bandeira, e a raia só a lia ANTES de começar
    o item seguinte. Com o robô esperando o clique do operador (vigília de até
    meia hora), ninguém lia: a tela continuava igual e o botão parecia morto.

    Agora os que esperam viram CANCELADO no ato, e o item em curso recebe o
    sinal de largar a vigília. A aba que o robô preparou continua aberta — e o
    item fica em SUA_VEZ, com o "publiquei" à mão, porque o operador pode ter
    publicado antes de cancelar.
    """
    lote = _lote_atual
    if lote is None or lote.terminou:
        return None

    lote.cancelado = True
    for item in lote.itens:
        if item.estado is EstadoItem.AGUARDANDO:
            await _mudar(item, EstadoItem.CANCELADO, detalhe="lote cancelado")
        else:
            item.espera.set()
    logger.info("[Lote] cancelado a pedido do operador")
    return lote


async def _rodar_raia(lote: Lote, plataforma: Plataforma) -> None:
    """A raia de UMA plataforma: um item por vez, respeitando a cadência dela."""
    ritmo = cadencia_de(plataforma)
    saldo = await _publicados_hoje(plataforma)

    for item in lote.da_plataforma(plataforma):
        if item.estado is not EstadoItem.AGUARDANDO:
            continue
        if lote.cancelado:
            await _mudar(item, EstadoItem.CANCELADO, detalhe="lote cancelado")
            continue

        parada = motivo_para_parar(publicados_hoje=saldo, cadencia=ritmo)
        if parada:
            lote.avisos[plataforma.value] = parada
            await _mudar(item, EstadoItem.AGUARDANDO, detalhe=parada)
            break

        destino = _destino_do_item(item, lote)
        final = await _publicar_item(item, destino, ritmo)

        if final is EstadoItem.PUBLICADO:
            saldo += 1
        elif final is EstadoItem.ERRO and destino.modo is ModoPublicacao.ASSISTIDO:
            # O robô tropeçou. A causa é quase sempre COMPARTILHADA — sessão
            # caída, layout novo, Chrome fechado — e insistir só abriria mais
            # cinco janelas para falhar do mesmo jeito. Parar aqui deixa a fila
            # intacta para quando o motivo for resolvido.
            lote.avisos[plataforma.value] = f"{item.detalhe} Os que faltam ficaram esperando."
            break


def _destino_do_item(item: ItemDoLote, lote: Lote) -> Destino:
    """O transporte deste item: o registrado, ou o robô quando o lote pediu.

    O registro global fica INTACTO de propósito. Trocá-lo faria o botão avulso
    de cada short (o painel da D-468) passar a abrir o Chrome sem ninguém ter
    pedido — o assistido é uma escolha DO LOTE, e só dele.
    """
    robo = _robo_do_lote(item.plataforma, lote.opcoes)
    if robo is None:
        return publicacao_destinos.com_agendamento(
            publicacao_destinos.obter_destino(item.plataforma), lote.opcoes.agendamento
        )

    async def ao_ficar_pronta(avisos: Sequence[str] = ()) -> None:
        # D-588: os avisos entram JUNTO do "sua vez", e não depois. É durante a
        # espera que o operador pode agir — pôr a capa que o robô não pôs, por
        # exemplo; no fim da vigília o post já saiu sem ela.
        await _mudar(item, EstadoItem.SUA_VEZ, detalhe=_com_avisos(RECADO_DA_ABA, avisos))

    return robo(
        item.plataforma,
        publicar_sozinho=lote.opcoes.publicar_sozinho,
        ao_ficar_pronta=ao_ficar_pronta,
        agendamento=lote.opcoes.agendamento,
        parar_espera=item.espera,
    )


def _robo_do_lote(plataforma: Plataforma, opcoes: OpcoesDoLote):
    """A classe do destino assistido desta plataforma, ou `None`.

    Um mapa e não uma cadeia de `if`: quando a terceira plataforma ganhar robô,
    o que muda é uma linha de dado — e a raia continua sem saber de nenhuma.
    """
    robos = {
        Plataforma.TIKTOK: (opcoes.tiktok_assistido, destinos_shorts.DestinoTikTokAssistido),
        Plataforma.TIKTOK_HORIZONTAL: (
            opcoes.tiktok_assistido,
            destinos_shorts.DestinoTikTokAssistido,
        ),
        Plataforma.INSTAGRAM_REELS: (
            opcoes.instagram_assistido,
            destinos_shorts.DestinoInstagramReelsAssistido,
        ),
    }
    ligado, classe = robos.get(plataforma, (False, None))
    return classe if ligado else None


async def _publicar_item(item: ItemDoLote, destino: Destino, ritmo: Cadencia) -> EstadoItem:
    """Prepara e entrega UM item, e devolve onde ele parou.

    Os três modos terminam em lugares diferentes, e a diferença é o ponto:

      - **API** termina PUBLICADO — o vídeo está no ar;
      - **ASSISTIDO** bloqueia até o operador clicar; volta PUBLICADO se a
        vigília viu acontecer, ou SUA_VEZ se não deu para saber;
      - **MANUAL** termina em SUA_VEZ, com a pasta pronta.

    Chamar os três de "concluído" seria dizer que o Reels está no ar quando ele
    está numa pasta esperando o celular.
    """
    await _mudar(item, EstadoItem.PREPARANDO)
    try:
        contexto = await _montar_contexto(item)
        resultado = await destino.publicar(await destino.preparar(contexto))
    except Exception as exc:  # noqa: BLE001 — a raia reporta e decide se segue
        logger.warning("[Lote] %s em %s falhou: %s", item.alvo_id[:8], item.plataforma.value, exc)
        await _mudar(item, EstadoItem.ERRO, detalhe=str(exc))
        return EstadoItem.ERRO

    avisos = resultado.get("avisos") or []

    if destino.modo is ModoPublicacao.API:
        # D-588: PUBLICADO com ressalva ainda é PUBLICADO — o vídeo está no ar.
        # Mas a ressalva (a capa que não entrou) precisa aparecer no item.
        await _mudar(
            item,
            EstadoItem.PUBLICADO,
            url=str(resultado.get("url", "")),
            detalhe=_com_avisos("", avisos),
            publicado=True,
        )
        return EstadoItem.PUBLICADO

    if destino.modo is ModoPublicacao.ASSISTIDO:
        if resultado.get("publicado"):
            await _mudar(item, EstadoItem.PUBLICADO, detalhe=SUBIU_NO_TIKTOK, publicado=True)
            return EstadoItem.PUBLICADO
        if item.estado is EstadoItem.PUBLICADO:
            # D-591: o operador clicou "publiquei" DURANTE a vigília, e foi isso
            # que a encerrou. Rebaixar para SUA_VEZ desfaria a confirmação dele.
            return EstadoItem.PUBLICADO
        # `False` aqui é "não sei", e não "não publicou" — a aba pode ter sido
        # fechada. Deixar em SUA_VEZ mantém o botão "publiquei" à mão, que é o
        # jeito barato de errar: marcar no escuro libera a limpeza do MP4.
        await _mudar(item, EstadoItem.SUA_VEZ, detalhe=_com_avisos(NAO_DEU_PARA_CONFIRMAR, avisos))
        return EstadoItem.SUA_VEZ

    await _mudar(item, EstadoItem.SUA_VEZ, detalhe=_recado_do_pacote(resultado, ritmo))
    return EstadoItem.SUA_VEZ


def _recado_do_pacote(resultado: dict, ritmo: Cadencia) -> str:
    """O que o operador faz agora, com o pacote já montado."""
    pasta = str(resultado.get("pasta", ""))
    recado = f"pacote pronto em {pasta}" if pasta else f"pacote do {ritmo.rotulo} pronto"
    return _com_avisos(recado, resultado.get("avisos") or [])


def _com_avisos(recado: str, avisos: Sequence[str]) -> str:
    """O recado do item, seguido dos avisos quando há — ou só os avisos."""
    juntos = "; ".join(str(a) for a in avisos)
    if not juntos:
        return recado
    return f"{recado} — {juntos}" if recado else juntos


async def _montar_contexto(item: ItemDoLote):
    if item.alvo_tipo == ALVO_CORTE:
        return await publicacao_destinos.montar_contexto_do_corte(item.alvo_id)
    return await publicacao_destinos.montar_contexto(item.alvo_id)


async def _mudar(
    item: ItemDoLote,
    estado: EstadoItem,
    *,
    detalhe: str = "",
    url: str = "",
    publicado: bool = False,
) -> None:
    """Move o item e grava o mesmo movimento no banco, num gesto só.

    Os dois juntos de propósito: um estado em memória que o banco não conhece
    some no primeiro restart, e um lote de TikTok dura horas.
    """
    item.estado = estado
    if detalhe:
        item.detalhe = detalhe
    if url:
        item.url = url

    async with AsyncSessionLocal() as db:
        registro = await db.get(PublicacaoShort, item.registro_id)
        if registro is None:
            return
        registro.estado = estado.value
        registro.detalhe = item.detalhe
        registro.url = item.url
        if publicado:
            registro.publicado_em = datetime.utcnow()
        await db.commit()


async def _gravar_registros(lote: Lote) -> None:
    async with AsyncSessionLocal() as db:
        for item in lote.itens:
            db.add(
                PublicacaoShort(
                    id=item.registro_id,
                    alvo_tipo=item.alvo_tipo,
                    alvo_id=item.alvo_id,
                    plataforma=item.plataforma.value,
                    estado=item.estado.value,
                    lote_id=lote.id,
                    detalhe=item.detalhe,
                )
            )
        await db.commit()


async def _ja_publicados(alvo_ids: list[str]) -> dict[str, set[str]]:
    """Por alvo, as plataformas onde ele JÁ foi publicado de verdade.

    Só conta `publicado_em` preenchido: um pacote manual montado não é uma
    publicação, e tratá-lo como tal esconderia do operador o que falta subir.
    """
    if not alvo_ids:
        return {}

    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(PublicacaoShort).where(
                    PublicacaoShort.alvo_id.in_(alvo_ids),
                    PublicacaoShort.publicado_em.is_not(None),
                )
            )
        ).scalars()

        mapa: dict[str, set[str]] = {}
        for linha in linhas:
            mapa.setdefault(linha.alvo_id, set()).add(linha.plataforma)
        return mapa


async def _publicados_hoje(plataforma: Plataforma) -> int:
    """Quantos já saíram hoje nesta plataforma — o que a cota do YouTube gasta."""
    async with AsyncSessionLocal() as db:
        linhas = (
            await db.execute(
                select(PublicacaoShort.publicado_em).where(
                    PublicacaoShort.plataforma == plataforma.value,
                    PublicacaoShort.publicado_em.is_not(None),
                )
            )
        ).scalars()
        return publicados_no_dia([m for m in linhas if m], datetime.utcnow())


async def _rotulos_dos_alvos(alvos: list[tuple[str, str]]) -> dict[str, str]:
    """O título de cada alvo, para a tela falar de vídeos e não de uuids."""
    from app.models import Corte, Short

    ids_short = [a for t, a in alvos if t == ALVO_SHORT]
    ids_corte = [a for t, a in alvos if t == ALVO_CORTE]
    rotulos: dict[str, str] = {}

    async with AsyncSessionLocal() as db:
        if ids_short:
            for short in (await db.execute(select(Short).where(Short.id.in_(ids_short)))).scalars():
                rotulos[short.id] = short.titulo_sugerido or f"Short {short.numero}"
        if ids_corte:
            for corte in (await db.execute(select(Corte).where(Corte.id.in_(ids_corte)))).scalars():
                rotulos[corte.id] = corte.titulo_proposto or f"Corte {corte.numero}"
    return rotulos


async def confirmar(alvo_id: str, plataforma: Plataforma) -> bool:
    """Marca à mão que ESTE item subiu — o "publiquei" do destino manual.

    Existe porque `SUA_VEZ` não é um estado que a máquina saiba encerrar sozinha
    no Instagram: o upload acontece no celular do operador, longe daqui.
    """
    async with AsyncSessionLocal() as db:
        registro = (
            (
                await db.execute(
                    select(PublicacaoShort)
                    .where(
                        PublicacaoShort.alvo_id == alvo_id,
                        PublicacaoShort.plataforma == plataforma.value,
                        PublicacaoShort.publicado_em.is_(None),
                    )
                    .order_by(PublicacaoShort.criado_em.desc())
                )
            )
            .scalars()
            .first()
        )
        if registro is None:
            return False
        registro.estado = EstadoItem.PUBLICADO.value
        registro.detalhe = CONFIRMADO_A_MAO
        registro.publicado_em = datetime.utcnow()
        await db.commit()

    if _lote_atual is not None:
        for item in _lote_atual.itens:
            if item.alvo_id == alvo_id and item.plataforma is plataforma:
                item.estado = EstadoItem.PUBLICADO
                item.detalhe = CONFIRMADO_A_MAO
                # D-591: e solta a vigília. Sem isto a raia seguia esperando a
                # aba por até meia hora, com o item já marcado, e os seguintes
                # parados — exatamente o "subiu o primeiro e o resto travou".
                item.espera.set()
    return True


async def historico_do_corte(corte_id: str) -> list[dict]:
    """O que já foi publicado dos shorts DESTE corte — e do próprio corte.

    A tela de seleção usa isto para nascer sabendo: o operador vê de cara o que
    falta, em vez de descobrir na hora em que o lote pula metade dos itens.
    """
    from app.models import Short

    async with AsyncSessionLocal() as db:
        ids = [
            s.id
            for s in (await db.execute(select(Short).where(Short.corte_id == corte_id))).scalars()
        ]
        ids.append(corte_id)

        linhas = (
            await db.execute(
                select(PublicacaoShort)
                .where(PublicacaoShort.alvo_id.in_(ids))
                .order_by(PublicacaoShort.criado_em.desc())
            )
        ).scalars()

        return [
            {
                "alvo_id": linha.alvo_id,
                "plataforma": linha.plataforma,
                "estado": linha.estado,
                "url": linha.url,
                "detalhe": linha.detalhe,
                "publicado_em": linha.publicado_em.isoformat() if linha.publicado_em else "",
            }
            for linha in linhas
        ]
