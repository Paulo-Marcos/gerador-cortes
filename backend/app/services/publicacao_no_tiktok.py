"""A publicação assistida no TikTok, como caso de uso (D-706).

O robô (`tiktok_studio`) conduz o navegador; aqui fica o que o app decide em
volta dele: a legenda única do pacote, a vigília da aba até o operador publicar
e a marca de publicado no corte, que libera a limpeza do MP4 de entrega (D-512).
Morava no router de shorts.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado, PedidoInvalido
from app.domain.publicacao.publicacao import legenda_unica
from app.domain.publicacao.tiktok_studio import Passo, RoteiroInterrompido, marca_da_aba
from app.models import Corte
from app.services import janela_do_robo, tiktok_studio
from app.services.navegador_assistido import sessao_no_chrome
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)

# D-893: os cortes com uma aba vigiada agora. Um segundo envio abriria outra aba
# de upload do MESMO vídeo — e, com o "publicar sozinho", outro post. A tela
# esquece o erro ao fechar o modal; quem recusa é o servidor.
_VIGIADOS: set[str] = set()


async def publicar_assistido(
    pacote: dict, *, corte_id: str = "", agendamento=None, publicar_sozinho: bool = False
) -> dict:
    """Monta a legenda do pacote e entrega o roteiro ao navegador.

    Recebe o pacote JÁ montado em vez de montá-lo: assim o corte horizontal e o
    short vertical — que chegam por caminhos diferentes — compartilham este
    trecho sem que nenhum dos dois precise saber do outro. Um roteiro que para
    levanta `RoteiroInterrompido`, com o passo.

    D-834: `publicar_sozinho` é o interruptor do lote no botão de cada corte, e
    o robô segue a RN-26 — sem a capa confirmada, ele para e a aba fica vigiada.
    """
    if corte_id in _VIGIADOS:
        raise PedidoInvalido(
            "Este corte já está numa aba do robô, esperando a publicação. Publique ou "
            "feche aquela aba — o app marca o corte sozinho quando o post aparecer."
        )
    # 2ª pr-audit: em curso desde JÁ — o upload leva minutos, e fechar e reabrir
    # o modal no meio dele não pode abrir outra aba do mesmo vídeo. Solta no fim
    # se nenhuma aba foi entregue; entregue, quem solta é a vigília.
    if corte_id:
        _VIGIADOS.add(corte_id)
    entregue = False
    try:
        resultado, entregue = await _subir_e_entregar(
            pacote, corte_id, agendamento, publicar_sozinho
        )
    except RoteiroInterrompido as exc:
        entregue = exc.passo == Passo.PUBLICAR
        raise
    finally:
        if not entregue:
            _VIGIADOS.discard(corte_id)
    return resultado


async def _subir_e_entregar(
    pacote: dict, corte_id: str, agendamento, publicar_sozinho: bool
) -> tuple[dict, bool]:
    """O roteiro e a entrega da aba. Devolve o resultado e se a aba ficou vigiada."""
    legenda = legenda_unica(pacote.get("titulo", ""), pacote.get("descricao", ""))
    capa = pacote.get("capa") or ""
    # D-893: a etiqueta da aba, como no lote (D-564). Sem ela a vigília olhava a
    # PRIMEIRA aba de upload — a de outro corte — e podia marcar este sem ele
    # ter saído, liberando a limpeza do MP4 (D-512).
    marca = marca_da_aba(uuid4().hex[:12])

    try:
        relatorio = await tiktok_studio.subir_assistido(
            video=Path(pacote["video"]),
            legenda=legenda,
            capa=Path(capa) if capa else None,
            marca=marca,
            agendamento=agendamento,
            publicar_sozinho=publicar_sozinho,
        )
    except RoteiroInterrompido as exc:
        # D-893: parar no PUBLICAR é parar depois do clique — o post pode ter
        # saído. A orientação manda conferir na aba; ela precisa estar na tela
        # e vigiada, senão o corte não se marca e o botão publica de novo.
        if exc.passo == Passo.PUBLICAR:
            await _entregar_a_aba_ao_operador(corte_id, marca)
        raise

    if relatorio.get("publicado"):
        # Quem apertou Publicar foi o robô: não há aba a vigiar nem janela a
        # mostrar, e a marca vem já — como o lote faz com o mesmo veredito.
        if corte_id:
            await marcar_corte_publicado(corte_id)
        return {**pacote, **relatorio, "legenda": legenda, "vigiando": False}, False

    await _entregar_a_aba_ao_operador(corte_id, marca)
    return {**pacote, **relatorio, "legenda": legenda, "vigiando": bool(corte_id)}, True


async def _entregar_a_aba_ao_operador(corte_id: str, marca: str) -> None:
    """A aba é a vez do operador: fica vigiada e a janela volta para a tela.

    D-546: a partir daqui o app FICA DE OLHO na aba. Quando o operador
    publicar, o corte se marca sozinho — ele nao precisa voltar aqui para
    clicar em "publiquei". Fire-and-forget porque a espera e de minutos e a
    requisicao ja tem o que devolver: prender o HTTP ate ele decidir publicar
    seguraria uma conexao por meia hora para nao entregar nada de novo.

    D-799: o Chrome do robô trabalha fora da tela; a janela volta para a tela
    — sem pular na frente dele.
    """
    if corte_id:
        vigiar_publicacao(corte_id, marca)
    conexao = sessao_no_chrome(tiktok_studio.perfil_do_chrome())
    await asyncio.to_thread(janela_do_robo.mostrar, conexao)


async def marcar_corte_publicado(corte_id: str) -> datetime:
    """Marca que o operador subiu ESTE corte para o TikTok (D-512).

    Precisa ser um passo explícito porque o TikTok é publicação manual — a API
    só posta em modo privado sem auditoria, então o app não tem como saber.

    A marca não é enfeite: a limpeza automática do `upload_ready/video.mp4` só
    roda quando TODOS os destinos publicaram. Antes ela apagava o arquivo no fim
    do upload do YouTube, e o TikTok — que sobe o MESMO MP4 — ficava sem
    material, sem volta a não ser render novo.
    """
    async with AsyncSessionLocal() as db, db.begin():
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise NaoEncontrado(f"Corte {corte_id!r} nao encontrado")
        corte.tiktok_publicado_em = datetime.utcnow()
        return corte.tiktok_publicado_em


def vigiar_publicacao(corte_id: str, marca: str = "") -> asyncio.Task:
    """Fica de olho na aba do TikTok até o operador publicar (D-649).

    `asyncio.create_task` solto era um bug esperando a hora: o loop guarda a
    task por referência FRACA, e uma vigília de até 30 min sem dono pode ser
    recolhida pelo coletor de lixo no meio do caminho. Ela morreria calada, e o
    corte nunca se marcaria como publicado. `fire_and_forget` segura a
    referência e loga qualquer exceção.

    O nome não casa com nenhum prefixo da fila global de propósito: esperar o
    operador clicar em "Publicar" não é trabalho pesado para anunciar na tela.
    """
    _VIGIADOS.add(corte_id)
    return fire_and_forget(
        _marcar_quando_publicar(corte_id, marca), name=f"tiktok-vigilia-{corte_id[:8]}"
    )


async def _marcar_quando_publicar(corte_id: str, marca: str = "") -> None:
    """Espera a publicacao e so entao marca o corte. Nunca marca no escuro.

    `aguardar_publicacao` devolve `False` tanto para "nao publicou" quanto para
    "nao consegui saber", e as duas dao no mesmo aqui: nao marcar. A marca
    LIBERA a limpeza automatica do `upload_ready/video.mp4` (D-512), entao um
    falso positivo apaga o arquivo e a volta e render novo. Errar para menos
    custa um clique no "publiquei".
    """
    try:
        if not await tiktok_studio.aguardar_publicacao(marca=marca):
            return
        await marcar_corte_publicado(corte_id)
        logger.info("[TikTokStudio] corte %s marcado como publicado", corte_id[:8])
    except Exception as exc:  # noqa: BLE001 — tarefa de fundo nao derruba nada
        logger.warning("[TikTokStudio] nao consegui marcar %s: %s", corte_id[:8], exc)
    finally:
        _VIGIADOS.discard(corte_id)
