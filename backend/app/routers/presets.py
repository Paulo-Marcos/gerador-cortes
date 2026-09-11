"""CRUD de presets de layout YouTube (F-048 / F-060).

Tipos suportados:
  - completo: payload e um YoutubeLayout (modo/fundo/placa/compartilhada/full).
  - posicionamento: payload e `{compartilhada, fundo, placa}` (F-060). Payloads
    legados (bloco compartilhada direto) sao aceitos na escrita e re-embrulhados.
  - posicionamento_full: payload e `{full: {crop, slot}, fundo, placa}` (F-060).
  - palco_short: payload e `{arranjo, janela_cheia, recortes, ajustes, fundo,
    legenda_cor}` — o
    palco VERTICAL, com catalogo proprio. Separado dos de cima porque os nomes
    deles sao cenas do OBS ("Comp. 2 OBS") e o vocabulario do short e outro.

Os payloads sao normalizados via app.domain.youtube_layout antes de persistir,
garantindo que o que sai pelo GET ja vem no shape consumido pelo painel.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from app.database import get_db
from app.domain.youtube_layout import (
    DEFAULT_CROP_FACECAM,
    DEFAULT_CROP_TELA,
    DEFAULT_FULL_CROP,
    DEFAULT_FULL_SLOT,
    DEFAULT_SLOT_FACECAM,
    DEFAULT_SLOT_TELA,
    _normalizar_full_config,
    _normalizar_fundo,
    _normalizar_placa,
    _normalizar_quantidade_telas,
    _normalizar_retangulo,
    normalizar_layout_youtube,
)
from app.models import LayoutPreset
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()

TIPOS_VALIDOS = {"completo", "posicionamento", "posicionamento_full", "palco_short"}


class LayoutPresetResponse(BaseModel):
    id: str
    nome: str
    tipo: str
    payload: dict[str, Any]
    criado_em: datetime
    atualizado_em: datetime

    class Config:
        from_attributes = True


class CriarPresetRequest(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    tipo: str = Field(..., pattern="^(completo|posicionamento|posicionamento_full|palco_short)$")
    payload: dict[str, Any]


class AtualizarPresetRequest(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    payload: dict[str, Any] | None = None


def _normalizar_payload(tipo: str, payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload deve ser objeto JSON")

    if tipo == "completo":
        return normalizar_layout_youtube(payload)

    if tipo == "palco_short":
        # D-509: o palco do SHORT — como a tela monta, o que cada janela mostra
        # e a cor por tras. Nao reaproveita `posicionamento` porque la o payload
        # fala de facecam/tela em 1920x1080, e aqui fala de arranjo e regioes
        # num quadro vertical.
        #
        # Sem defaults inventados: chave ausente e HERANCA, e materializar aqui
        # congelaria o palco do dia em que o preset foi salvo (mesma regra do
        # layout do horizontal).
        recortes = payload.get("recortes")
        return {
            "arranjo": str(payload.get("arranjo") or ""),
            "janela_cheia": str(payload.get("janela_cheia") or ""),
            "recortes": _normalizar_recortes(recortes),
            # D-561: o TAMANHO das janelas no quadro do short.
            #
            # A D-559 deu ao operador um jeito de encolher o palco para o fundo
            # do canal aparecer — e o preset nao guardava isso. Ele montava o
            # palco, salvava, aplicava noutro trecho e o tamanho voltava ao do
            # arranjo, sem nada na tela explicando o pulo. Um preset que descreve
            # meio palco e pior que nenhum: parece que funcionou.
            #
            # Sao os mesmos retangulos nomeados dos recortes, so que no quadro do
            # short (1080x1920) em vez do quadro-fonte. Quem trava a faixa e o
            # `aplicar_ajustes` do dominio, na leitura, como sempre foi.
            "ajustes": _normalizar_recortes(payload.get("ajustes")),
            "fundo": str(payload.get("fundo") or ""),
            # D-563: a cor do realce da legenda. Faz parte do palco porque foi
            # escolhida olhando para ele — a legenda e a camada que vai por cima.
            "legenda_cor": str(payload.get("legenda_cor") or ""),
        }

    if tipo == "posicionamento_full":
        # F-060: {full: {crop, slot}, fundo, placa}. Aceita tambem {crop, slot}
        # direto no topo, por simetria com o legado do posicionamento.
        bruto = payload.get("full") if isinstance(payload.get("full"), dict) else payload
        return {
            "full": _normalizar_full_config(
                bruto, {"crop": DEFAULT_FULL_CROP, "slot": DEFAULT_FULL_SLOT}
            ),
            "fundo": _normalizar_fundo(payload.get("fundo")),
            "placa": _normalizar_placa(payload.get("placa")),
        }

    # posicionamento: shape novo {compartilhada, fundo, placa} (F-060). Payload
    # legado (bloco compartilhada direto no topo) e re-embrulhado.
    bruto = (
        payload.get("compartilhada") if isinstance(payload.get("compartilhada"), dict) else payload
    )
    compartilhada = {
        "telas": _normalizar_quantidade_telas(bruto.get("telas")),
        "crop_facecam": _normalizar_retangulo(bruto.get("crop_facecam"), DEFAULT_CROP_FACECAM),
        "crop_tela": _normalizar_retangulo(bruto.get("crop_tela"), DEFAULT_CROP_TELA),
        "slot_facecam": _normalizar_retangulo(bruto.get("slot_facecam"), DEFAULT_SLOT_FACECAM),
        "slot_tela": _normalizar_retangulo(bruto.get("slot_tela"), DEFAULT_SLOT_TELA),
    }
    return {
        "compartilhada": compartilhada,
        "fundo": _normalizar_fundo(payload.get("fundo")),
        "placa": _normalizar_placa(payload.get("placa")),
    }


def _normalizar_recortes(valor: Any) -> dict[str, dict[str, int]]:
    """Os recortes de um preset de palco de short, em pixels do quadro-fonte.

    Retangulo invalido e DESCARTADO, nao substituido por um default: um preset
    que "conserta" um recorte quebrado aplicaria uma janela que ninguem marcou,
    e o operador veria o enquadramento errado sem saber de onde veio.
    """
    if not isinstance(valor, dict):
        return {}
    limpos: dict[str, dict[str, int]] = {}
    for nome, retangulo in valor.items():
        if not isinstance(retangulo, dict):
            continue
        try:
            lados = {lado: int(float(retangulo[lado])) for lado in ("x", "y", "w", "h")}
        except (KeyError, TypeError, ValueError):
            continue
        if lados["w"] > 0 and lados["h"] > 0:
            limpos[str(nome)] = lados
    return limpos


def _serializar(preset: LayoutPreset) -> dict[str, Any]:
    try:
        payload = json.loads(preset.payload or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": preset.id,
        "nome": preset.nome,
        "tipo": preset.tipo,
        "payload": payload,
        "criado_em": preset.criado_em,
        "atualizado_em": preset.atualizado_em,
    }


@router.get("/layout")
async def listar_presets(
    tipo: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[dict[str, Any]]:
    if tipo is not None and tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"tipo invalido: {tipo}")

    stmt = select(LayoutPreset).order_by(LayoutPreset.criado_em.desc())
    if tipo is not None:
        stmt = stmt.where(LayoutPreset.tipo == tipo)
    result = await db.execute(stmt)
    presets = result.scalars().all()
    return [_serializar(p) for p in presets]


@router.post("/layout")
async def criar_preset(
    body: CriarPresetRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    payload_normalizado = _normalizar_payload(body.tipo, body.payload)
    preset = LayoutPreset(
        id=str(uuid.uuid4()),
        nome=body.nome.strip(),
        tipo=body.tipo,
        payload=json.dumps(payload_normalizado, ensure_ascii=False),
    )
    db.add(preset)
    await db.flush()
    return _serializar(preset)


@router.put("/layout/{preset_id}")
async def atualizar_preset(
    preset_id: str,
    body: AtualizarPresetRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    preset = await db.get(LayoutPreset, preset_id)
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset nao encontrado")

    if body.nome is not None:
        preset.nome = body.nome.strip()
    if body.payload is not None:
        payload_normalizado = _normalizar_payload(preset.tipo, body.payload)
        preset.payload = json.dumps(payload_normalizado, ensure_ascii=False)

    await db.flush()
    return _serializar(preset)


@router.delete("/layout/{preset_id}")
async def deletar_preset(
    preset_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    preset = await db.get(LayoutPreset, preset_id)
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset nao encontrado")
    await db.delete(preset)
    return Response(status_code=204)
