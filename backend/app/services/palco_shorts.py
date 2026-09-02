"""Resolve o palco vertical de um corte: de onde vêm as regiões (E-036, D-487).

A geometria vive em `domain/palco_short`. Aqui mora a pergunta anterior a ela:
**quais regiões este corte tem, e de onde saíram?**

Três origens, nesta ordem de preferência:

  1. **preset escolhido** — o operador apontou um dos presets do canal para este
     corte. É o caminho normal, e o que ele pediu: poucos padrões, porque o
     cenário da live não muda muito.
  2. **layout do próprio corte** — se o corte já foi posicionado para o
     horizontal, os crops estão lá e servem sem cadastro nenhum.
  3. **nenhuma** — o corte nunca foi posicionado. Aqui está a armadilha que
     motivou esta demanda: sem região, o palco cairia em "pessoa cheia" usando
     o quadro INTEIRO, e o chrome verde da live voltaria — exatamente o que o
     palco existe para evitar.

Por isso `origem` volta na resposta. Um palco montado do jeito errado precisa
dizer POR QUE está assim, senão o operador ajusta o modelo achando que o
problema é o arranjo, quando o problema é a falta de região.
"""

from __future__ import annotations

import json
import logging

from app.database import AsyncSessionLocal
from app.domain.ffmpeg_short import FUNDO_PADRAO
from app.domain.palco_short import (
    CANVAS,
    MODELOS,
    modelo_sugerido,
    montar_plano,
    regioes_do_layout,
)
from app.models import Corte, LayoutPreset, Short
from sqlalchemy import select

logger = logging.getLogger(__name__)

ORIGEM_PRESET = "preset"
ORIGEM_LAYOUT = "layout_do_corte"
ORIGEM_NENHUMA = "nenhuma"


def catalogo_modelos() -> list[dict]:
    """Os arranjos disponíveis, com o porquê de cada um.

    O `porque` vai junto de propósito: escolher entre quatro arranjos sem saber
    para que cada um serve é adivinhação, e a tela não deveria pedir isso.
    """
    return [
        {
            "id": modelo.id,
            "nome": modelo.nome,
            "porque": modelo.porque,
            "regioes_exigidas": sorted(modelo.regioes_exigidas),
        }
        for modelo in MODELOS.values()
    ]


async def descrever(corte_id: str) -> dict:
    """O estado do palco de um corte: regiões, origem, presets à escolha."""
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        presets = (await db.scalars(select(LayoutPreset))).all()
        regioes, origem, preset_nome = _resolver(corte, presets)

    return {
        "preset": preset_nome,
        "origem": origem,
        "regioes": regioes,
        "modelo_sugerido": modelo_sugerido(regioes),
        "presets_disponiveis": [
            {"id": p.id, "nome": p.nome, "regioes": sorted(_regioes_do_preset(p))}
            for p in presets
            if _regioes_do_preset(p)
        ],
    }


async def escolher_preset(corte_id: str, preset_id: str) -> dict:
    """Aponta um preset do canal para este corte. `""` volta ao automático.

    Levanta `LookupError` (corte ou preset inexistente) e `ValueError` quando o
    preset não tem crop nenhum — apontar para um preset vazio deixaria o corte
    parecendo configurado e entregando o mesmo resultado de antes.
    """
    async with AsyncSessionLocal() as db:
        corte = await db.get(Corte, corte_id)
        if not corte:
            raise LookupError(f"Corte {corte_id!r} nao encontrado")

        if preset_id:
            preset = await db.get(LayoutPreset, preset_id)
            if not preset:
                raise LookupError(f"Preset {preset_id!r} nao encontrado")
            if not _regioes_do_preset(preset):
                raise ValueError(
                    f"O preset {preset.nome!r} nao tem regiao de facecam nem de tela — "
                    "com ele o palco continuaria usando o quadro inteiro."
                )

        corte.palco_short_preset = preset_id
        await db.commit()

    return await descrever(corte_id)


async def resolver_para_render(short_id: str) -> dict:
    """O plano de palco de UM short, pronto para virar filtro.

    Devolve `plano=None` quando não há região: o render então segue pelo caminho
    antigo (recorte 9:16 do quadro cru). Degradar é melhor que falhar — mas o
    campo `origem` diz que foi degradação, não escolha.
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        presets = (await db.scalars(select(LayoutPreset))).all()
        regioes, origem, _ = _resolver(corte, presets)
        escolhido = short.modelo_palco

    if not regioes:
        return {"plano": None, "origem": ORIGEM_NENHUMA, "modelo": None}

    modelo_id = escolhido or modelo_sugerido(regioes)
    try:
        plano = montar_plano(modelo_id, regioes)
    except (KeyError, ValueError) as exc:
        # O operador escolheu um arranjo que as regiões deste corte não
        # comportam (ex.: pediu tela e o preset só tem facecam). Cair no
        # sugerido é melhor que abortar o render, mas precisa ficar no log.
        logger.warning(
            "[Palco] short=%s modelo=%s nao serve (%s); usando o sugerido",
            short_id[:8],
            modelo_id,
            exc,
        )
        modelo_id = modelo_sugerido(regioes)
        plano = montar_plano(modelo_id, regioes)

    return {"plano": plano, "origem": origem, "modelo": modelo_id}


async def plano_desenhavel(short_id: str) -> dict:
    """O palco deste short em coordenadas de DESENHO, para a prévia (D-489).

    A tela não recalcula nada: ela recebe, por recorte, de onde tirar da fonte,
    onde colar e onde cortar — e aplica no canvas. É a mesma conta que virou o
    `filter_complex`, servida noutro vocabulário.

    Reimplementar a geometria no frontend seria criar uma segunda versão dela, e
    aí a prévia poderia discordar do arquivo sem que nada quebrasse. É o risco
    que este épico inteiro existe para evitar.
    """
    resolvido = await resolver_para_render(short_id)
    plano = resolvido["plano"]

    return {
        "origem": resolvido["origem"],
        "modelo": resolvido["modelo"],
        "canvas": {"largura": CANVAS.largura, "altura": CANVAS.altura},
        "fundo": FUNDO_PADRAO,
        "recortes": [r.desenho for r in plano.recortes] if plano else [],
    }


def _resolver(corte: Corte, presets: list[LayoutPreset]) -> tuple[dict, str, str]:
    """(regiões, origem, nome do preset) — a cascata de três degraus."""
    if corte.palco_short_preset:
        preset = next((p for p in presets if p.id == corte.palco_short_preset), None)
        if preset:
            regioes = _regioes_do_preset(preset)
            if regioes:
                return regioes, ORIGEM_PRESET, preset.nome

    regioes = regioes_do_layout(_json_dict(corte.layout_youtube))
    if regioes:
        return regioes, ORIGEM_LAYOUT, ""

    return {}, ORIGEM_NENHUMA, ""


def _regioes_do_preset(preset: LayoutPreset) -> dict:
    return regioes_do_layout(_json_dict(preset.payload))


def _json_dict(bruto: str | None) -> dict:
    try:
        dados = json.loads(bruto or "{}")
    except json.JSONDecodeError:
        return {}
    return dados if isinstance(dados, dict) else {}
