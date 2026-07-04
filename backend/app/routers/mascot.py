"""
Endpoints publicos do catalogo de poses do mascote do canal.

Exposto em /api/mascot. Consumido principalmente por agente externo de IA
que precisa escolher a pose certa para cada cena do roteiro.
"""

from __future__ import annotations

from typing import Any

from app.services import mascot_catalog
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter()


@router.get("/poses")
def listar_poses(
    cena: str | None = Query(
        default=None,
        description="Filtra para poses compativeis com a cena (ex: 'pergunta_transicao').",
    ),
) -> dict[str, Any]:
    """
    Retorna o catalogo de poses do mascote.

    - Sem `cena`: devolve todas as 17 poses.
    - Com `cena`: devolve apenas as poses recomendadas para aquele tipo.
    """
    poses = mascot_catalog.listar_poses(cena=cena)
    return {
        **mascot_catalog.metadata(),
        "filtro_cena": cena,
        "poses": poses,
    }


@router.get("/poses/{mood}")
def buscar_pose(mood: str) -> dict[str, Any]:
    """Detalhes de uma pose individual pelo identificador `mood`."""
    pose = mascot_catalog.buscar_pose(mood)
    if pose is None:
        raise HTTPException(status_code=404, detail=f"Pose '{mood}' nao encontrada")
    return pose


@router.post("/poses/recarregar")
def recarregar_catalogo() -> Response:
    """
    Limpa o cache em memoria. Util apos atualizar manualmente
    `backend/app/data/sapo_poses.json` em runtime.
    """
    mascot_catalog.recarregar()
    return Response(status_code=204)
