"""O estilo da capa do TikTok do canal: ler, prever e gravar (D-933).

Só HTTP: o contrato é `domain/corte/estilo_da_capa.py`, e a resposta inteira
— geometria incluída — vem de `services/estilo_da_capa.painel`.
"""

from __future__ import annotations

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
    projeto_id: str
    corte_id: str
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


def _painel(projeto_id: str, corte_id: str, rascunho: dict | None = None) -> dict:
    arte = capa_tiktok.arte_do_corte(projeto_id, corte_id)
    return {
        **estilo_da_capa.painel(projeto_id, corte_id, arte, rascunho),
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
def obter_estilo_da_capa(projeto_id: str, corte_id: str):
    """O estilo do canal e como ele fica na capa deste corte."""
    return _painel(projeto_id, corte_id)


@router.post("/estilo/previa", response_model=PainelDoEstiloDaCapaTiktok)
def prever_estilo_da_capa(body: EstiloDaCapaTiktokRequest):
    """A capa com o rascunho do modal, sem gravar nada."""
    rascunho = dominio.validar(_sem_nulos(body.estilo), FUNDOS)
    return _painel(body.projeto_id, body.corte_id, rascunho)


@router.put("/estilo", response_model=PainelDoEstiloDaCapaTiktok)
def gravar_estilo_da_capa(body: EstiloDaCapaTiktokRequest):
    """Grava o estilo do canal. A capa do corte se refaz pelo endpoint dela."""
    estilo_da_capa.gravar(_sem_nulos(body.estilo))
    return _painel(body.projeto_id, body.corte_id)
