"""Router: o que esta rodando bate com o que esta no disco? (D-491).

Router proprio, e nao mais um `@app.get` em `main.py`: aquele arquivo esta
travado pelo `editor-cortes-stage-medallion`, e um check de infraestrutura nao
tem por que disputar espaco com o medalhao do card de corte.
"""

from __future__ import annotations

from app.database import engine
from app.services import sincronizacao
from fastapi import APIRouter

router = APIRouter()


@router.get("")
async def estado_da_sincronizacao():
    """Commit no ar vs no disco, colunas pendentes e deps faltando.

    Barato de proposito — a tela consulta de tempos em tempos, e um check que
    pesa vira um check que alguem desliga.
    """
    async with engine.connect() as conn:
        return await sincronizacao.estado(conn)
