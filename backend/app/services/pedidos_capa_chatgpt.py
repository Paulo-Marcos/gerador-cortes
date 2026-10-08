"""A fila dos pedidos de capa ao ChatGPT (D-898).

Até a D-898 o pedido era uma requisição longa presa ao modal: o modal esperava a
imagem, salvava a capa e mostrava o erro. Fechou o modal, o erro sumia junto, e
a aba que o robô deixou aberta para o operador ler o motivo ficava sem dono.

Agora o pedido é um item de fila do backend. Quem pede recebe a ficha na hora;
o robô atende um por vez, entrega a imagem na capa certa e anota em que passo
está e por que parou. A Fila global publica esses itens (`jobs_globais`), e o
botão do modal lê o mesmo estado — qualquer tela vê o andamento.

A entrega é o mesmo caminho do Ctrl+V de cada capa (moldura do YouTube, montagem
do TikTok, arte do short): o robô continua sem saber o que cada capa faz.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from typing import Literal

from app.database import AsyncSessionLocal
from app.domain.compartilhado.erros import ErroDeDominio, NaoEncontrado, PedidoInvalido
from app.models import Short
from app.services import capa_no_chatgpt, capa_short, capa_tiktok
from app.services.tasks import fire_and_forget
from app.services.thumbnail import ThumbnailService

logger = logging.getLogger(__name__)

Destino = Literal["youtube", "tiktok", "short"]
EstadoDoPedido = Literal["aguardando", "rodando", "concluido", "erro"]

# Cada capa pede um quadro: a thumbnail é deitada, a arte do TikTok vai na faixa
# 4:5 da capa montada, e a capa do short ocupa a tela inteira.
PROPORCAO_DO_DESTINO: dict[Destino, str] = {"youtube": "16:9", "tiktok": "4:5", "short": "9:16"}

ETAPA_NA_FILA = "Na fila do ChatGPT"
ETAPA_SALVANDO = "Salvando na capa"
ETAPA_PRONTA = "Capa pronta"


# O robô não sabe quanto falta: na Fila, o progresso é só o estado.
_PROGRESSO: dict[EstadoDoPedido, int] = {
    "aguardando": 0,
    "rodando": 50,
    "concluido": 100,
    "erro": 0,
}


@dataclass
class PedidoDeCapa:
    id: str
    destino: Destino
    # O corte (YouTube, TikTok) ou o short que recebe a imagem.
    alvo_id: str
    # O corte de quem a capa é — é por ele que a Fila agrupa e nomeia.
    corte_id: str
    estado: EstadoDoPedido = "aguardando"
    etapa: str = ETAPA_NA_FILA
    erro: str = ""

    @property
    def ativo(self) -> bool:
        return self.estado in ("aguardando", "rodando")

    def para_a_fila(self) -> dict:
        """Os campos do `JobGlobal` da Fila global; o tipo diz qual capa é."""
        return {
            "id": f"chatgpt:{self.id}",
            "tipo": f"chatgpt_{self.destino}",
            "corte_id": self.corte_id,
            "estado": self.estado,
            "progresso": _PROGRESSO[self.estado],
            "etapa": self.etapa,
            "erro": self.erro,
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "destino": self.destino,
            "alvo_id": self.alvo_id,
            "corte_id": self.corte_id,
            "estado": self.estado,
            "etapa": self.etapa,
            "erro": self.erro,
        }


# Só o último pedido de cada capa: o anterior já não diz nada sobre ela, e a
# memória fica do tamanho do número de capas, não do número de cliques.
_pedidos: dict[tuple[Destino, str], PedidoDeCapa] = {}
# A vez no robô. O estado "aguardando" só é verdade se a espera for aqui, e não
# dentro da thread do navegador.
_vez = asyncio.Lock()


def listar() -> list[PedidoDeCapa]:
    return list(_pedidos.values())


def pedido_da_capa(destino: Destino, alvo_id: str) -> PedidoDeCapa | None:
    return _pedidos.get((destino, alvo_id))


async def enfileirar(
    destino: Destino, alvo_id: str, prompt: str, pessoas: list[str] | None = None
) -> PedidoDeCapa:
    """Põe a capa na fila e devolve a ficha; pedir de novo a mesma capa não duplica."""
    em_voo = pedido_da_capa(destino, alvo_id)
    if em_voo and em_voo.ativo:
        return em_voo
    # O que só o operador resolve volta na hora, em vez de virar um item da
    # fila que nasce condenado.
    if not prompt.strip():
        raise PedidoInvalido("Gere o prompt da capa primeiro.")
    if not capa_no_chatgpt.ler_configuracao()["projeto_url"]:
        raise PedidoInvalido("Configure o link do projeto do ChatGPT em Canais → Capas no ChatGPT.")
    pedido = PedidoDeCapa(
        id=uuid.uuid4().hex[:12],
        destino=destino,
        alvo_id=alvo_id,
        corte_id=await _corte_do_alvo(destino, alvo_id),
    )
    _pedidos[(destino, alvo_id)] = pedido
    fire_and_forget(_atender(pedido, prompt, pessoas), name=f"capa-chatgpt-{pedido.id}")
    return pedido


async def _corte_do_alvo(destino: Destino, alvo_id: str) -> str:
    if destino != "short":
        return alvo_id
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, alvo_id)
    if short is None:
        raise NaoEncontrado(f"Short não encontrado: {alvo_id}")
    return short.corte_id


async def _atender(pedido: PedidoDeCapa, prompt: str, pessoas: list[str] | None) -> None:
    async with _vez:
        pedido.estado = "rodando"

        def anunciar(etapa: str) -> None:
            # Chega da thread do navegador; trocar um str é atômico sob o GIL.
            pedido.etapa = etapa

        try:
            imagem, tipo = await capa_no_chatgpt.gerar_imagem(
                prompt, PROPORCAO_DO_DESTINO[pedido.destino], pessoas, anunciar
            )
            pedido.etapa = ETAPA_SALVANDO
            await _entregar(pedido, imagem, f"chatgpt.{tipo.split('/')[-1]}")
        except Exception as exc:  # noqa: BLE001 — o motivo vai para a Fila, não para o log só
            pedido.estado = "erro"
            pedido.erro = _motivo(exc)
            logger.warning(
                "[ChatGPT] capa %s de %s parou em '%s': %s",
                pedido.destino,
                pedido.alvo_id[:8],
                pedido.etapa,
                pedido.erro,
            )
            return
        pedido.estado = "concluido"
        pedido.etapa = ETAPA_PRONTA
        logger.info("[ChatGPT] capa %s de %s pronta", pedido.destino, pedido.alvo_id[:8])


def _motivo(exc: Exception) -> str:
    """A frase pronta do robô e das capas; o resto vai com o tipo, que é a pista."""
    if isinstance(exc, ErroDeDominio | ValueError | capa_tiktok.CapaTikTokError) and str(exc):
        return str(exc)
    return f"O robô parou: {type(exc).__name__}: {exc}. Confira a janela do ChatGPT."


async def _entregar(pedido: PedidoDeCapa, imagem: bytes, nome: str) -> None:
    """O mesmo destino do Ctrl+V de cada capa."""
    if pedido.destino == "youtube":
        await ThumbnailService.upload_manual(pedido.alvo_id, imagem, nome)
    elif pedido.destino == "tiktok":
        await capa_tiktok.salvar_arte(pedido.alvo_id, imagem, nome)
        await capa_tiktok.gerar(pedido.alvo_id)
    else:
        await capa_short.subir_arte(pedido.alvo_id, imagem, nome)


def resetar() -> None:
    """Esvazia a fila e solta a vez (teste: cada `asyncio.run` é um loop novo)."""
    global _vez
    _pedidos.clear()
    _vez = asyncio.Lock()
