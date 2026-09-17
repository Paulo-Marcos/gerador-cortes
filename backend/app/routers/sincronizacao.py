"""Router: o que esta rodando bate com o que esta no disco? (D-491).

Router proprio, e nao mais um `@app.get` em `main.py`: aquele arquivo esta
travado pelo `editor-cortes-stage-medallion`, e um check de infraestrutura nao
tem por que disputar espaco com o medalhao do card de corte.
"""

from __future__ import annotations

import asyncio

from app.database import engine
from app.services import ambiente, sincronizacao
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


@router.get("/ambiente")
async def pre_requisitos_da_maquina():
    """O que o app precisa nesta máquina e o que falta (D-627).

    Mora aqui, ao lado do "o que roda bate com o disco?", porque é da mesma
    família: não é um bug da tela, é a máquina. Roda numa thread porque a
    primeira chamada testa o encoder com um ffmpeg de verdade.
    """
    checagens = await asyncio.to_thread(ambiente.checar, ambiente.sondas_da_maquina())
    return {
        "pronto": all(c.estado != "erro" for c in checagens),
        "itens": [
            {
                "id": c.id,
                "nome": c.nome,
                "obrigatorio": c.obrigatorio,
                "estado": c.estado,
                "detalhe": c.detalhe,
                "como_resolver": "" if c.ok else c.como_resolver,
            }
            for c in checagens
        ],
    }
