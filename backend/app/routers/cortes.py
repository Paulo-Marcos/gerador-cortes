"""
Router de Cortes — CRUD, aprovação e ações sobre desvios
"""

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Corte, StatusCorte

router = APIRouter()


# ─── Schemas ────────────────────────────────────────────────────────────────

class DesvioSchema(BaseModel):
    inicio_hms: str
    fim_hms: str
    motivo: str


class CorteResponse(BaseModel):
    id: str
    projeto_id: str
    numero: int
    titulo_proposto: str
    resumo: str
    tema_central: str
    inicio_hms: str
    fim_hms: str
    inicio_seg: float
    fim_seg: float
    desvios: list
    status: str
    arquivo_clip_path: str
    criado_em: datetime

    class Config:
        from_attributes = True


class AtualizarCorteRequest(BaseModel):
    titulo_proposto: str | None = None
    inicio_hms: str | None = None
    fim_hms: str | None = None
    inicio_seg: float | None = None
    fim_seg: float | None = None
    desvios: list | None = None
    status: str | None = None


class RemoverDesvioRequest(BaseModel):
    desvio_index: int


class CriarCorteDesvioRequest(BaseModel):
    desvio_index: int
    titulo: str = ""


class AdicionarDesvioRequest(BaseModel):
    inicio_hms: str
    fim_hms: str
    motivo: str = ""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _hms_to_seg(hms: str) -> float:
    try:
        partes = hms.split(":")
        if len(partes) == 3:
            return int(partes[0]) * 3600 + int(partes[1]) * 60 + float(partes[2])
    except Exception:
        pass
    return 0.0


def _corte_to_dict(corte: Corte) -> dict:
    d = {c: getattr(corte, c) for c in corte.__table__.columns.keys()}
    d["desvios"] = json.loads(corte.desvios or "[]")
    return d


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/{corte_id}", response_model=CorteResponse)
async def obter_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    return _corte_to_dict(corte)


@router.get("/projeto/{projeto_id}", response_model=list[CorteResponse])
async def listar_cortes_do_projeto(projeto_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Corte).where(Corte.projeto_id == projeto_id).order_by(Corte.numero)
    )
    return [_corte_to_dict(c) for c in result.scalars().all()]


@router.patch("/{corte_id}", response_model=CorteResponse)
async def atualizar_corte(corte_id: str, body: AtualizarCorteRequest, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    if body.titulo_proposto is not None:
        corte.titulo_proposto = body.titulo_proposto
    if body.inicio_hms is not None:
        corte.inicio_hms = body.inicio_hms
    if body.fim_hms is not None:
        corte.fim_hms = body.fim_hms
    if body.inicio_seg is not None:
        corte.inicio_seg = body.inicio_seg
    if body.fim_seg is not None:
        corte.fim_seg = body.fim_seg
    if body.desvios is not None:
        corte.desvios = json.dumps(body.desvios)
    if body.status is not None:
        corte.status = body.status

    await db.commit()
    await db.refresh(corte)
    return _corte_to_dict(corte)


@router.post("/{corte_id}/aprovar")
async def aprovar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    corte.status = StatusCorte.APROVADO
    await db.commit()
    return {"message": "Corte aprovado", "corte_id": corte_id}


@router.post("/{corte_id}/rejeitar")
async def rejeitar_corte(corte_id: str, db: AsyncSession = Depends(get_db)):
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")
    corte.status = StatusCorte.REJEITADO
    await db.commit()
    return {"message": "Corte rejeitado", "corte_id": corte_id}


@router.post("/{corte_id}/remover-desvio", response_model=CorteResponse)
async def remover_desvio(corte_id: str, body: RemoverDesvioRequest, db: AsyncSession = Depends(get_db)):
    """Remove um desvio do corte sem criar novo corte."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    desvios = json.loads(corte.desvios or "[]")
    if body.desvio_index < 0 or body.desvio_index >= len(desvios):
        raise HTTPException(status_code=400, detail="Índice de desvio inválido")

    desvios.pop(body.desvio_index)
    corte.desvios = json.dumps(desvios, ensure_ascii=False)
    await db.commit()
    await db.refresh(corte)
    return _corte_to_dict(corte)


@router.post("/{corte_id}/adicionar-desvio", response_model=CorteResponse)
async def adicionar_desvio(corte_id: str, body: AdicionarDesvioRequest, db: AsyncSession = Depends(get_db)):
    """Adiciona um desvio criado manualmente ao corte."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    desvios = json.loads(corte.desvios or "[]")

    novo_desvio = {
        "inicio_hms": body.inicio_hms,
        "fim_hms": body.fim_hms,
        "inicio_seg": _hms_to_seg(body.inicio_hms),
        "fim_seg": _hms_to_seg(body.fim_hms),
        "motivo": body.motivo or "Desvio manual",
    }

    desvios.append(novo_desvio)
    desvios.sort(key=lambda d: d.get("inicio_seg", 0))

    corte.desvios = json.dumps(desvios, ensure_ascii=False)
    await db.commit()
    await db.refresh(corte)
    return _corte_to_dict(corte)


@router.post("/{corte_id}/corte-do-desvio", response_model=CorteResponse)
async def criar_corte_do_desvio(corte_id: str, body: CriarCorteDesvioRequest, db: AsyncSession = Depends(get_db)):
    """Cria um novo Corte a partir de um desvio e remove o desvio do corte original."""
    corte = await db.get(Corte, corte_id)
    if not corte:
        raise HTTPException(status_code=404, detail="Corte não encontrado")

    desvios = json.loads(corte.desvios or "[]")
    if body.desvio_index < 0 or body.desvio_index >= len(desvios):
        raise HTTPException(status_code=400, detail="Índice de desvio inválido")

    desvio = desvios[body.desvio_index]

    result = await db.execute(
        select(Corte).where(Corte.projeto_id == corte.projeto_id).order_by(Corte.numero.desc())
    )
    ultimo = result.scalars().first()
    proximo_numero = (ultimo.numero + 1) if ultimo else 1

    titulo = body.titulo or f"[Desvio #{corte.numero}] {desvio.get('motivo', '')[:60]}"

    novo_corte = Corte(
        id=str(uuid.uuid4()),
        projeto_id=corte.projeto_id,
        numero=proximo_numero,
        titulo_proposto=titulo,
        resumo=f"Criado a partir do desvio do Corte #{corte.numero}: {desvio.get('motivo', '')}",
        tema_central="",
        inicio_hms=desvio.get("inicio_hms", "00:00:00"),
        fim_hms=desvio.get("fim_hms", "00:00:00"),
        inicio_seg=_hms_to_seg(desvio.get("inicio_hms", "00:00:00")),
        fim_seg=_hms_to_seg(desvio.get("fim_hms", "00:00:00")),
        desvios="[]",
    )
    db.add(novo_corte)

    desvios.pop(body.desvio_index)
    corte.desvios = json.dumps(desvios, ensure_ascii=False)

    await db.commit()
    await db.refresh(novo_corte)
    return _corte_to_dict(novo_corte)
