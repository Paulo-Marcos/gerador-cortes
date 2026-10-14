"""Router: as novidades de cada versão, em português (D-922)."""

from __future__ import annotations

from app.routers.resposta_api import RespostaApi
from app.services import novidades
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class TraducaoDaNovidade(RespostaApi):
    titulo: str
    resumo: str
    # Vazio quando não há nada que o operador faça (mudança interna).
    como_usar: str


class NovidadeResponse(RespostaApi):
    chave: str
    # added, changed, fixed, removed, security, deprecated, housekeeping.
    categoria: str
    titulo_original: str
    texto_original: str
    demandas: list[str]
    # `None` enquanto a IA não traduziu: a tela mostra o original.
    traducao: TraducaoDaNovidade | None
    nova: bool


class VersaoResponse(RespostaApi):
    # "Unreleased" é o que já está na main e ainda não ganhou número.
    versao: str
    data: str | None
    novidades: list[NovidadeResponse]


class ResumoDasNovidades(RespostaApi):
    novas: int


class TraduzirRequest(BaseModel):
    versao: str


class TraducaoFeita(RespostaApi):
    traduzidas: int
    pendentes: int


@router.get("", response_model=list[VersaoResponse])
def listar_novidades():
    return [
        VersaoResponse(
            versao=v.versao,
            data=v.data,
            novidades=[
                NovidadeResponse(
                    chave=n.entrada.chave,
                    categoria=n.entrada.categoria,
                    titulo_original=n.entrada.titulo,
                    texto_original=n.entrada.texto,
                    demandas=list(n.entrada.demandas),
                    traducao=TraducaoDaNovidade(**n.traducao) if n.traducao else None,
                    nova=n.nova,
                )
                for n in v.novidades
            ],
        )
        for v in novidades.listar()
    ]


@router.get("/resumo", response_model=ResumoDasNovidades)
def resumo_das_novidades():
    """Barato: o trilho consulta para acender o ponto de "tem novidade"."""
    return ResumoDasNovidades(novas=novidades.contar_novas())


@router.post("/vistas", status_code=204)
def marcar_novidades_vistas():
    novidades.marcar_todas_vistas()


@router.post("/traduzir", response_model=TraducaoFeita)
async def traduzir_novidades(pedido: TraduzirRequest):
    traduzidas, pendentes = await novidades.traduzir(pedido.versao)
    return TraducaoFeita(traduzidas=traduzidas, pendentes=pendentes)
