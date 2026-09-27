"""Router: o que esta rodando bate com o que esta no disco? (D-491).

Router proprio, e nao mais um `@app.get` em `main.py`: aquele arquivo esta
travado pelo `editor-cortes-stage-medallion`, e um check de infraestrutura nao
tem por que disputar espaco com o medalhao do card de corte.
"""

from __future__ import annotations

import asyncio

from app.database import engine
from app.routers.resposta_api import RespostaApi
from app.services import ambiente, sincronizacao
from app.services.ambiente import Estado
from fastapi import APIRouter

router = APIRouter()


class EstadoDaSincronizacao(RespostaApi):
    """O que roda bate com o que está no disco? `em_dia` é o veredito, dado
    aqui para a tela não montar o dela. Commit vazio = não se sabe (sem git)."""

    commit_rodando: str
    commit_disco: str
    backend_velho: bool
    colunas_pendentes: list[str]
    dependencias_faltando: list[str]
    canal_em_uso: str
    canal_escolhido: str
    troca_de_canal_pendente: bool
    em_dia: bool


class ItemDoAmbiente(RespostaApi):
    id: str
    nome: str
    obrigatorio: bool
    estado: Estado
    detalhe: str
    # Vazio quando o item está ok.
    como_resolver: str


class AmbienteResponse(RespostaApi):
    """D-627: o que o app precisa nesta máquina. `pronto` é falso se falta um
    obrigatório."""

    pronto: bool
    itens: list[ItemDoAmbiente]


@router.get("", response_model=EstadoDaSincronizacao)
async def estado_da_sincronizacao():
    """Commit no ar vs no disco, colunas pendentes e deps faltando.

    Barato de proposito — a tela consulta de tempos em tempos, e um check que
    pesa vira um check que alguem desliga.
    """
    async with engine.connect() as conn:
        return await sincronizacao.estado(conn)


@router.get("/ambiente", response_model=AmbienteResponse)
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
