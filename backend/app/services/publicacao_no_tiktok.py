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

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import NaoEncontrado
from app.domain.publicacao.publicacao import legenda_unica
from app.models import Corte
from app.services import tiktok_studio
from app.services.tasks import fire_and_forget

logger = logging.getLogger(__name__)


async def publicar_assistido(pacote: dict, *, corte_id: str = "", agendamento=None) -> dict:
    """Monta a legenda do pacote e entrega o roteiro ao navegador.

    Recebe o pacote JÁ montado em vez de montá-lo: assim o corte horizontal e o
    short vertical — que chegam por caminhos diferentes — compartilham este
    trecho sem que nenhum dos dois precise saber do outro. Um roteiro que para
    levanta `RoteiroInterrompido`, com o passo.
    """
    legenda = legenda_unica(pacote.get("titulo", ""), pacote.get("descricao", ""))
    capa = pacote.get("capa") or ""

    relatorio = await tiktok_studio.subir_assistido(
        video=Path(pacote["video"]),
        legenda=legenda,
        capa=Path(capa) if capa else None,
        agendamento=agendamento,
    )

    # D-546: a partir daqui o app FICA DE OLHO na aba. Quando o operador
    # publicar, o corte se marca sozinho — ele nao precisa voltar aqui para
    # clicar em "publiquei".
    #
    # Fire-and-forget porque a espera e de minutos e a requisicao ja tem o que
    # devolver: a aba esta pronta. Prender o HTTP ate ele decidir publicar
    # seguraria uma conexao por meia hora para nao entregar nada de novo.
    if corte_id:
        vigiar_publicacao(corte_id)

    return {**pacote, **relatorio, "legenda": legenda, "vigiando": bool(corte_id)}


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


def vigiar_publicacao(corte_id: str) -> asyncio.Task:
    """Fica de olho na aba do TikTok até o operador publicar (D-649).

    `asyncio.create_task` solto era um bug esperando a hora: o loop guarda a
    task por referência FRACA, e uma vigília de até 30 min sem dono pode ser
    recolhida pelo coletor de lixo no meio do caminho. Ela morreria calada, e o
    corte nunca se marcaria como publicado. `fire_and_forget` segura a
    referência e loga qualquer exceção.

    O nome não casa com nenhum prefixo da fila global de propósito: esperar o
    operador clicar em "Publicar" não é trabalho pesado para anunciar na tela.
    """
    return fire_and_forget(_marcar_quando_publicar(corte_id), name=f"tiktok-vigilia-{corte_id[:8]}")


async def _marcar_quando_publicar(corte_id: str) -> None:
    """Espera a publicacao e so entao marca o corte. Nunca marca no escuro.

    `aguardar_publicacao` devolve `False` tanto para "nao publicou" quanto para
    "nao consegui saber", e as duas dao no mesmo aqui: nao marcar. A marca
    LIBERA a limpeza automatica do `upload_ready/video.mp4` (D-512), entao um
    falso positivo apaga o arquivo e a volta e render novo. Errar para menos
    custa um clique no "publiquei".
    """
    try:
        if not await tiktok_studio.aguardar_publicacao():
            return
        await marcar_corte_publicado(corte_id)
        logger.info("[TikTokStudio] corte %s marcado como publicado", corte_id[:8])
    except Exception as exc:  # noqa: BLE001 — tarefa de fundo nao derruba nada
        logger.warning("[TikTokStudio] nao consegui marcar %s: %s", corte_id[:8], exc)
