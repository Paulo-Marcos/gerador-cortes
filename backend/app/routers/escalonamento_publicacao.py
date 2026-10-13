"""Router: a referência do público e os blocos de publicação, por canal (D-908).

Montado sob `/api/editorial-skills/escalonamento`, ao lado dos pesos do
ranking (D-351): é a mesma tela de Canais que edita os dois, e registrar um
router novo exigiria tocar `main.py`, travado.

  GET  /                       — o do canal, o padrão e se há diferença
  PUT  /publico                — grava as faixas do público
  PUT  /destinos/{destino}     — grava os blocos de um destino
  GET  /destinos/{destino}/sugestao — blocos espalhados pela janela forte
  POST /reset/{chave}          — volta `publico` ou um destino ao padrão

O router só traduz: a validação mora no domínio e sobe como `ErroDeDominio`
(`EscalonamentoInvalido` → 400 pelo tratador global).
"""

from __future__ import annotations

from app.services.canal import escalonamento_settings
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class FaixaDoPublicoModel(BaseModel):
    """Uma faixa de horas de um dia da semana (0 = segunda) e a força do público."""

    dia: int
    inicio: int
    fim: int
    intensidade: str


class ParametrosDoDestinoModel(BaseModel):
    """Como um destino distribui os itens ao longo do dia."""

    blocos: list[str]
    itens_por_bloco: int
    teto_por_dia: int
    intervalo_minimo_min: int
    dias_ativos: list[int]


class DestinoEscalonadoResponse(BaseModel):
    destino: str
    rotulo: str
    parametros: ParametrosDoDestinoModel
    padrao: ParametrosDoDestinoModel
    personalizado: bool


class EscalonamentoResponse(BaseModel):
    faixas: list[FaixaDoPublicoModel]
    faixas_padrao: list[FaixaDoPublicoModel]
    publico_personalizado: bool
    dias_da_semana: list[str]
    destinos: list[DestinoEscalonadoResponse]


class ReferenciaDoPublicoRequest(BaseModel):
    faixas: list[FaixaDoPublicoModel]


class SugestaoDeBlocosResponse(BaseModel):
    blocos: list[str]


def _para_response(descrito: escalonamento_settings.EscalonamentoDescrito) -> EscalonamentoResponse:
    return EscalonamentoResponse(
        faixas=[FaixaDoPublicoModel(**f) for f in descrito.faixas],
        faixas_padrao=[FaixaDoPublicoModel(**f) for f in descrito.faixas_padrao],
        publico_personalizado=descrito.publico_personalizado,
        dias_da_semana=list(descrito.dias_da_semana),
        destinos=[
            DestinoEscalonadoResponse(
                destino=d.destino,
                rotulo=d.rotulo,
                parametros=ParametrosDoDestinoModel(**d.parametros),
                padrao=ParametrosDoDestinoModel(**d.padrao),
                personalizado=d.personalizado,
            )
            for d in descrito.destinos
        ],
    )


@router.get("", response_model=EscalonamentoResponse)
async def ver_escalonamento():
    return _para_response(escalonamento_settings.descrever())


@router.put("/publico", response_model=EscalonamentoResponse)
async def definir_publico(body: ReferenciaDoPublicoRequest):
    faixas = [f.model_dump() for f in body.faixas]
    return _para_response(escalonamento_settings.definir_referencia(faixas))


@router.put("/destinos/{destino}", response_model=EscalonamentoResponse)
async def definir_destino(destino: str, body: ParametrosDoDestinoModel):
    return _para_response(escalonamento_settings.definir_parametros(destino, body.model_dump()))


@router.get("/destinos/{destino}/sugestao", response_model=SugestaoDeBlocosResponse)
async def sugerir_blocos(destino: str):
    """Os mesmos N blocos do destino, realinhados à janela forte do público."""
    return {"blocos": escalonamento_settings.sugerir_blocos_do_canal(destino)}


@router.post("/reset/{chave}", response_model=EscalonamentoResponse)
async def resetar(chave: str):
    return _para_response(escalonamento_settings.resetar(chave))
