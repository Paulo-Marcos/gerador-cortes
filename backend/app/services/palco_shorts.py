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

from app.channel_assets_sync import cor_do_tema, paleta_do_tema
from app.database import AsyncSessionLocal
from app.domain.fundo_short import fundos_disponiveis
from app.domain.fundo_short import resolver as resolver_fundo
from app.domain.moldura_short import COR_PADRAO, faixas
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

ORIGEM_PRESET_SHORT = "preset_do_short"
ORIGEM_PRESET = "preset"
ORIGEM_LAYOUT = "layout_do_corte"
ORIGEM_NENHUMA = "nenhuma"
# D-499: o short marcou o proprio recorte. Precisa de nome porque a tela explica
# a origem, e "preset" seria mentira depois de o operador ter arrastado o
# retangulo com a mao.
ORIGEM_RECORTE_DO_SHORT = "recorte_do_short"


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


def catalogo_fundos() -> list[dict]:
    """As cores do canal oferecíveis como fundo do short (D-499).

    A `chave` é o que se grava; a `cor` é só para a tela pintar a amostra.
    Gravar o hex congelaria a paleta do dia — trocar o tema do canal deixaria os
    shorts antigos com a cor velha, e ninguém ligaria uma coisa à outra.
    """
    paleta = paleta_do_tema()
    padrao = resolver_fundo("", paleta)
    cores = [
        {"chave": fundo.chave, "cor": fundo.cor, "padrao": fundo.cor == padrao}
        for fundo in fundos_disponiveis(paleta)
    ]
    # O default primeiro. O domínio preserva a ordem da paleta, que é a ordem
    # em que o tema declara as cores; num seletor, porém, o primeiro item é o
    # que a maioria vai manter, e deixá-lo no fim faria procurar por ele.
    cores.sort(key=lambda c: not c["padrao"])
    return cores


def _e_retangulo(valor: object) -> bool:
    """Um recorte utilizável: as quatro chaves, numéricas e com área.

    Um retângulo de largura zero vira `crop=0:...` e o ffmpeg morre com -22 no
    meio do render — longe daqui, e sem dizer de onde veio o zero.
    """
    if not isinstance(valor, dict):
        return False
    try:
        lados = {chave: float(valor[chave]) for chave in ("x", "y", "w", "h")}
    except (KeyError, TypeError, ValueError):
        return False
    return lados["w"] > 0 and lados["h"] > 0 and lados["x"] >= 0 and lados["y"] >= 0


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


async def resolver_para_render(short_id: str, ajustes_hipoteticos: dict | None = None) -> dict:
    """O plano de palco de UM short, pronto para virar filtro.

    Devolve `plano=None` quando não há região: o render então segue pelo caminho
    antigo (recorte 9:16 do quadro cru). Degradar é melhor que falhar — mas o
    campo `origem` diz que foi degradação, não escolha.

    `ajustes_hipoteticos` (D-500) substitui os ajustes gravados SEM tocar no
    banco. É o que permite a prévia redesenhar durante o arraste: a alternativa
    seria portar a matemática de recorte para o frontend — a segunda
    implementação de geometria que este épico inteiro evitou, e que já custou
    dois bugs de divergência (D-490, D-493).
    """
    async with AsyncSessionLocal() as db:
        short = await db.get(Short, short_id)
        if not short:
            raise LookupError(f"Short {short_id!r} nao encontrado")
        corte = await db.get(Corte, short.corte_id)
        if not corte:
            raise LookupError(f"Corte {short.corte_id!r} nao encontrado")

        presets = (await db.scalars(select(LayoutPreset))).all()
        regioes, origem, _ = _resolver(corte, presets, short.palco_preset)
        # D-499: o recorte DESTE short vence o do preset, região a região. O
        # preset segue sendo o atalho que preenche tudo — quem não quer mexer
        # não mexe —, mas quando a facecam anda no meio da live é aqui que um
        # trecho conserta o próprio enquadramento sem estragar os vizinhos.
        proprios = {
            regiao: retangulo
            for regiao, retangulo in _json_dict(short.recortes_palco).items()
            if _e_retangulo(retangulo)
        }
        if proprios:
            regioes = {**regioes, **proprios}
            origem = ORIGEM_RECORTE_DO_SHORT
        escolhido = short.modelo_palco
        # MESCLA, não substitui: o arraste manda só o bloco que está na mão,
        # e trocar o mapa inteiro por ele apagaria da prévia os ajustes dos
        # OUTROS blocos — que voltariam ao lugar padrão enquanto o operador
        # mexe num terceiro, sem nada na tela explicando o pulo.
        ajustes = {**_json_dict(short.ajustes_palco), **(ajustes_hipoteticos or {})}
        moldura = short.moldura
        fundo = resolver_fundo(short.fundo_palco, paleta_do_tema())

    if not regioes:
        return {
            "plano": None,
            "origem": ORIGEM_NENHUMA,
            "modelo": None,
            "ajustes": {},
            "moldura": moldura,
            "fundo": fundo,
        }

    modelo_id = escolhido or modelo_sugerido(regioes)
    try:
        plano = montar_plano(modelo_id, regioes, ajustes)
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
        plano = montar_plano(modelo_id, regioes, ajustes)

    return {
        "plano": plano,
        "origem": origem,
        "modelo": modelo_id,
        "ajustes": ajustes,
        "moldura": moldura,
        "fundo": fundo,
    }


async def plano_desenhavel(short_id: str, ajustes_hipoteticos: dict | None = None) -> dict:
    """O palco deste short em coordenadas de DESENHO, para a prévia (D-489).

    A tela não recalcula nada: ela recebe, por recorte, de onde tirar da fonte,
    onde colar e onde cortar — e aplica no canvas. É a mesma conta que virou o
    `filter_complex`, servida noutro vocabulário.

    Reimplementar a geometria no frontend seria criar uma segunda versão dela, e
    aí a prévia poderia discordar do arquivo sem que nada quebrasse. É o risco
    que este épico inteiro existe para evitar.
    """
    resolvido = await resolver_para_render(short_id, ajustes_hipoteticos)
    plano = resolvido["plano"]

    return {
        "origem": resolvido["origem"],
        "modelo": resolvido["modelo"],
        "canvas": {"largura": CANVAS.largura, "altura": CANVAS.altura},
        "fundo": resolvido["fundo"],
        # A regiao vai JUNTO do desenho: sem ela a tela teria de casar esta
        # lista com `slots` pela posicao, e um acoplamento implicito desses
        # quebra em silencio no dia em que a ordem mudar.
        "recortes": ([{"regiao": r.regiao, **r.desenho} for r in plano.recortes] if plano else []),
        # Os slots RESOLVIDOS (modelo + ajuste), que sao o que o editor arrasta.
        # Mandar o modelo cru obrigaria a tela a reaplicar os ajustes por conta
        # propria — a segunda implementacao de sempre.
        "slots": (
            {
                r.regiao: {"x": r.slot.x, "y": r.slot.y, "w": r.slot.w, "h": r.slot.h}
                for r in plano.recortes
            }
            if plano
            else {}
        ),
        "ajustados": sorted(resolvido["ajustes"]),
        "moldura": resolvido["moldura"],
        # As faixas ja resolvidas, com a cor do CANAL — a tela nao escolhe cor,
        # so desenha. Cravar a cor no frontend faria o canal trocar a paleta e o
        # short sair com a antiga, sem nada indicando por que.
        "faixas": [
            {"x": f.x, "y": f.y, "w": f.w, "h": f.h, "cor": f.cor}
            for f in faixas(resolvido["moldura"], cor_do_tema("verdeMoldura", COR_PADRAO))
        ],
    }


def _resolver(
    corte: Corte, presets: list[LayoutPreset], preset_do_short: str = ""
) -> tuple[dict, str, str]:
    """(regiões, origem, nome do preset) — a cascata, agora de quatro degraus.

    O preset DO SHORT vem primeiro (D-498): numa live longa a cena do OBS muda
    ao longo do tempo, então um trecho pode precisar de regiões diferentes das
    do resto do corte. O corte continua sendo o default — o short só discorda
    quando precisa.
    """
    for candidato, origem in (
        (preset_do_short, ORIGEM_PRESET_SHORT),
        (corte.palco_short_preset, ORIGEM_PRESET),
    ):
        if not candidato:
            continue
        preset = next((p for p in presets if p.id == candidato), None)
        if preset:
            regioes = _regioes_do_preset(preset)
            if regioes:
                return regioes, origem, preset.nome

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
