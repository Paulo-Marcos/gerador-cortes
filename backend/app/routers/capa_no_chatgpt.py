"""Capa gerada no ChatGPT do operador (D-804): configuração do canal e geração.

A geração devolve a IMAGEM, não um caminho: quem pediu a entrega ao mesmo
upload que o Ctrl+V usa em cada capa (ver `services/capa_no_chatgpt`).
"""

from __future__ import annotations

from typing import Literal

from app.routers.resposta_api import RespostaApi
from app.services import capa_no_chatgpt
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

router = APIRouter()


class ConfiguracaoCapaChatgptResponse(RespostaApi):
    projeto_url: str
    fichas: list[str]
    maximo_de_fichas: int


class ProjetoChatgptRequest(BaseModel):
    projeto_url: str


class GerarCapaChatgptRequest(BaseModel):
    prompt: str
    proporcao: Literal["16:9", "4:5", "9:16"]
    # D-840: o elenco conferido na tela; ausente, o backend o lê do prompt.
    pessoas: list[str] | None = None


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


@router.post("/gerar", response_class=Response)
async def gerar_capa(pedido: GerarCapaChatgptRequest):
    """Gera a imagem no ChatGPT e a devolve (PNG, JPEG ou WEBP). Leva cerca de um minuto."""
    imagem, tipo = await capa_no_chatgpt.gerar_imagem(
        pedido.prompt, pedido.proporcao, pedido.pessoas
    )
    return Response(content=imagem, media_type=tipo)
