"""Capa gerada no ChatGPT do operador (D-804): configuração do canal e pedidos.

Desde a D-898 o pedido entra numa fila do backend e responde na hora; o robô
salva a imagem na capa e a Fila global mostra o andamento
(ver `services/pedidos_capa_chatgpt`).
"""

from __future__ import annotations

from typing import Literal

from app.routers.resposta_api import RespostaApi
from app.services import capa_no_chatgpt, pedidos_capa_chatgpt
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter()


class ConfiguracaoCapaChatgptResponse(RespostaApi):
    projeto_url: str
    fichas: list[str]
    maximo_de_fichas: int


class ProjetoChatgptRequest(BaseModel):
    projeto_url: str


DestinoDaCapa = Literal["youtube", "tiktok", "short"]


class PedirCapaChatgptRequest(BaseModel):
    destino: DestinoDaCapa
    # O corte (youtube, tiktok) ou o short (short) que recebe a imagem.
    alvo_id: str
    prompt: str
    # D-840: o elenco conferido na tela; ausente, o backend o lê do prompt.
    pessoas: list[str] | None = None


class PedidoCapaChatgpt(RespostaApi):
    id: str
    destino: DestinoDaCapa
    alvo_id: str
    corte_id: str
    estado: Literal["aguardando", "rodando", "concluido", "erro", "cancelado"]
    # O passo em que o robô está, ou o último em que esteve.
    etapa: str
    erro: str


class PedidoDaCapaResponse(RespostaApi):
    # None: esta capa não foi pedida desde que o backend subiu.
    pedido: PedidoCapaChatgpt | None


class ElencoDaCapaRequest(BaseModel):
    prompt: str


class PessoaDaCapa(RespostaApi):
    nome: str
    # A foto no banco de retratos (`/api/retratos/<slug>`); None = sem foto.
    slug: str | None


class ElencoDaCapaResponse(RespostaApi):
    pessoas: list[PessoaDaCapa]


@router.get("/config", response_model=ConfiguracaoCapaChatgptResponse)
async def ler_configuracao():
    """O link do projeto e as fichas do canal ativo."""
    return capa_no_chatgpt.ler_configuracao()


@router.put("/config", response_model=ConfiguracaoCapaChatgptResponse)
async def gravar_projeto(pedido: ProjetoChatgptRequest):
    """Grava o link do projeto do ChatGPT; vazio desliga a integração."""
    return capa_no_chatgpt.gravar_projeto(pedido.projeto_url)


@router.post("/fichas", response_model=ConfiguracaoCapaChatgptResponse)
async def subir_ficha(arquivo: UploadFile = File(...)):
    """Guarda uma ficha do mascote; o mesmo nome substitui a anterior."""
    return capa_no_chatgpt.salvar_ficha(arquivo.filename or "", await arquivo.read())


@router.get("/fichas/{nome}", response_class=FileResponse)
async def ver_ficha(nome: str):
    """A imagem da ficha, para a miniatura na tela de Canais."""
    return FileResponse(capa_no_chatgpt.caminho_da_ficha(nome))


@router.delete("/fichas/{nome}", response_model=ConfiguracaoCapaChatgptResponse)
async def remover_ficha(nome: str):
    return capa_no_chatgpt.remover_ficha(nome)


@router.post("/elenco", response_model=ElencoDaCapaResponse)
async def elenco_da_capa(pedido: ElencoDaCapaRequest):
    """As pessoas reais do prompt e a foto de cada uma (cache → Wikipédia)."""
    return {"pessoas": await capa_no_chatgpt.elenco_do_prompt(pedido.prompt)}


@router.post("/pedidos", response_model=PedidoCapaChatgpt, status_code=202)
async def pedir_capa(pedido: PedirCapaChatgptRequest):
    """Põe a capa na fila do robô e responde na hora; a mesma capa em voo não duplica."""
    enfileirado = await pedidos_capa_chatgpt.enfileirar(
        pedido.destino, pedido.alvo_id, pedido.prompt, pedido.pessoas
    )
    return enfileirado.to_dict()


@router.get("/pedidos/{destino}/{alvo_id}", response_model=PedidoDaCapaResponse)
async def pedido_da_capa(destino: DestinoDaCapa, alvo_id: str):
    """O último pedido desta capa: em que passo está, ou por que parou."""
    pedido = pedidos_capa_chatgpt.pedido_da_capa(destino, alvo_id)
    return {"pedido": pedido.to_dict() if pedido else None}
