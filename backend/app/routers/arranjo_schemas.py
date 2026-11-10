"""Schemas do arranjo do corte: a fila de blocos e as ações sobre ela (D-576).

Saíram de `cortes_schemas`, que estava no teto da catraca de tamanho (D-771),
para o `CorteResponse` ganhar o motivo do riscado (D-1092).
"""

from pydantic import BaseModel


class BlocoArranjoSchema(BaseModel):
    """Um bloco na fila de exibição do corte (D-576)."""

    posicao: int
    inicio_seg: float
    fim_seg: float
    duracao_seg: float
    # Duração já descontados os desvios DESTE bloco — é a que o editor vê.
    duracao_liquida_seg: float


class ArranjoResponse(BaseModel):
    corte_id: str
    inicio_seg: float
    fim_seg: float
    blocos: list[BlocoArranjoSchema]
    # True quando a ordem é a da live — inclusive num corte fatiado e não movido.
    cronologico: bool
    # A ordem mudou e já existe bruto gerado: ele está velho. Aviso, não ação —
    # nenhum artefato é apagado pelas costas do editor.
    bruto_desatualizado: bool


class DividirBlocoRequest(BaseModel):
    ponto_seg: float


class MoverBlocoRequest(BaseModel):
    de_indice: int
    para_indice: int


class FundirBlocoRequest(BaseModel):
    indice: int
