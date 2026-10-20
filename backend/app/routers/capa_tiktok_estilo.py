"""O estilo da capa do TikTok do canal: ler, prever e gravar (D-933).

Só HTTP: o contrato é `domain/corte/estilo_da_capa.py`, e a resposta inteira
— geometria incluída — vem de `services/estilo_da_capa.painel`.
"""

from __future__ import annotations

import asyncio

from app.domain.canal.palco_componentes import FUNDOS
from app.domain.corte import capa_tiktok as geometria
from app.domain.corte import estilo_da_capa as dominio
from app.routers.resposta_api import RespostaApi
from app.routers.settings import FaixaSeguraCapa, QuadroCapa, RetanguloCapa
from app.services import capa_tiktok, estilo_da_capa
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class EstiloDaCapaTiktokSalvo(BaseModel):
    """O estilo gravado, parcial: chave ausente é herança (RN-10)."""

    estilo: str | None = None
    fundo: str | None = None
    visiveis: dict[str, bool] | None = None
    posicoes: dict[str, dict[str, int]] | None = None


class EstiloDaCapaTiktokRequest(BaseModel):
    # Sem corte, o modal abre pela tela de Canais (D-947).
    corte_id: str | None = None
    estilo: EstiloDaCapaTiktokSalvo


class EstiloEfetivoDaCapaTiktok(RespostaApi):
    estilo: str
    fundo: str
    visiveis: dict[str, bool]
    faixas: dict[str, RetanguloCapa]


class CabecalhoDaCapaTiktok(RespostaApi):
    nome: str
    handle: str
    imagem: str


class PainelDoEstiloDaCapaTiktok(RespostaApi):
    """Tudo que o modal desenha: o salvo, o efetivo e as regras do quadro."""

    salvo: EstiloDaCapaTiktokSalvo
    efetivo: EstiloEfetivoDaCapaTiktok
    padrao: dict[str, RetanguloCapa]
    estilo_do_palco: str
    fundo_do_atual: str
    arte: str
    cabecalho: CabecalhoDaCapaTiktok
    estilos: list[str]
    fundos: list[str]
    componentes: list[str]
    componentes_do_limpo: list[str]
    quadro: QuadroCapa
    faixa_segura: FaixaSeguraCapa
    lado_minimo: int


async def _painel(corte_id: str | None, rascunho: dict | None = None) -> dict:
    projeto_id, arte = None, None
    if corte_id is not None:
        # O projeto vem do banco, nunca da requisição: ele vira caminho de arquivo.
        projeto_id, corte_id = await estilo_da_capa.corte_conferido(corte_id)
        # A prévia é pedida a cada gesto do modal: a arte (megabytes em base64)
        # já veio no GET e não viaja de novo.
        if rascunho is None:
            arte = capa_tiktok.arte_do_corte(projeto_id, corte_id)
    # Lê a arte e o settings.db: fora do event loop.
    painel = await asyncio.to_thread(estilo_da_capa.painel, projeto_id, corte_id, arte, rascunho)
    return {
        **painel,
        "estilos": list(dominio.ESTILOS_DA_CAPA),
        "fundos": list(FUNDOS),
        "componentes": list(dominio.COMPONENTES),
        "componentes_do_limpo": list(geometria.COMPONENTES_DO_LIMPO),
        "quadro": {"largura": geometria.LARGURA, "altura": geometria.ALTURA},
        "faixa_segura": {"y": geometria.TOPO_SEGURO, "h": geometria.ALTURA_SEGURA},
        "lado_minimo": geometria.LADO_MINIMO,
    }


def _sem_nulos(estilo: EstiloDaCapaTiktokSalvo) -> dict:
    return estilo.model_dump(exclude_none=True)


@router.get("/estilo", response_model=PainelDoEstiloDaCapaTiktok)
async def obter_estilo_da_capa(corte_id: str | None = None):
    """O estilo do canal e como ele fica na capa deste corte.

    Sem corte (D-947), a capa sai com o palco do canal e a área da arte vazia.
    """
    return await _painel(corte_id)


@router.post("/estilo/previa", response_model=PainelDoEstiloDaCapaTiktok)
async def prever_estilo_da_capa(body: EstiloDaCapaTiktokRequest):
    """A capa com o rascunho do modal, sem gravar nada."""
    rascunho = dominio.validar(_sem_nulos(body.estilo), FUNDOS)
    return await _painel(body.corte_id, rascunho)


@router.put("/estilo", response_model=PainelDoEstiloDaCapaTiktok)
async def gravar_estilo_da_capa(body: EstiloDaCapaTiktokRequest):
    """Grava o estilo do canal. A capa do corte se refaz pelo endpoint dela."""
    if body.corte_id is not None:
        await estilo_da_capa.corte_conferido(body.corte_id)
    estilo_da_capa.gravar(_sem_nulos(body.estilo))
    return await _painel(body.corte_id)


class EstiloDaCapaDoCanal(BaseModel):
    """O desenho da capa do canal: `palco` (segue o palco), `atual` ou `limpo`."""

    estilo: str


@router.get("/estilo/do-canal", response_model=EstiloDaCapaDoCanal)
async def ler_estilo_da_capa_do_canal():
    """D-938: o desenho que a tela de Canais mostra, sem corte."""
    return {"estilo": estilo_da_capa.ler_salvo().get("estilo", dominio.ESTILO_DO_PALCO)}


@router.put("/estilo/do-canal", response_model=EstiloDaCapaDoCanal)
async def escolher_estilo_da_capa_do_canal(body: EstiloDaCapaDoCanal):
    """D-938: troca só o desenho; componentes e posições continuam os do modal."""
    salvo = estilo_da_capa.escolher_estilo(body.estilo)
    return {"estilo": salvo.get("estilo", dominio.ESTILO_DO_PALCO)}
