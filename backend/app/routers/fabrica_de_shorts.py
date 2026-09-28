"""As portas da fábrica de shorts: o corte sozinho e a live inteira (D-472, D-803).

Moram fora de `routers/shorts.py` porque aquele arquivo está no teto da catraca
de tamanho (D-771), e porque a fábrica é um assunto: o que se pede a ela é
"faça os shorts", e não mexer num short que já existe. O router de shorts os
inclui, então as URLs continuam sob `/api/shorts`.
"""

from __future__ import annotations

from app.routers import shorts_schemas as esquemas
from app.routers.resposta_api import RespostaApi
from app.services import fabrica_de_shorts
from fastapi import APIRouter, HTTPException

router = APIRouter()


class FabricaDaLiveResponse(RespostaApi):
    """O que o clique disparou: quantos cortes entram e se a live será baixada."""

    projeto_id: str
    cortes: int
    baixar_live: bool


class AndamentoDaLive(RespostaApi):
    projeto_id: str
    # baixando | gerando | concluido | erro
    etapa: str
    feitos: int
    total: int
    erros: list[str]


class AndamentoDasLivesResponse(RespostaApi):
    lives: list[AndamentoDaLive]


@router.post("/corte/{corte_id}/gerar", response_model=esquemas.ShortsGeradosResponse)
async def gerar_manualmente(corte_id: str):
    """Caminho manual da fábrica: regera o bruto se preciso e propõe os shorts.

    Serve os cortes antigos e o teste da esteira. A regeração do bruto NÃO toca
    na pós-produção — refaz só o vídeo (D-160). A rodada soma aos candidatos
    que já existem e não apaga nenhum (RN-26).
    """
    try:
        return await fabrica_de_shorts.gerar_shorts_do_corte(corte_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/live/{projeto_id}/gerar", response_model=FabricaDaLiveResponse)
async def gerar_da_live(projeto_id: str):
    """Um clique por live: baixa a live se foi limpa, refaz os brutos e propõe os shorts.

    Volta na hora; o trabalho segue em segundo plano e aparece em
    `GET /lives/andamento`.
    """
    try:
        return await fabrica_de_shorts.disparar_fabrica_da_live(projeto_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/lives/andamento", response_model=AndamentoDasLivesResponse)
async def andamento_das_lives():
    """O que a fábrica de cada live está fazendo, ou como terminou."""
    return {"lives": fabrica_de_shorts.andamento_das_lives()}
