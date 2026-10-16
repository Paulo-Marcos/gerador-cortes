"""Os quadros da live que acompanham a capa no modo apresentador (D-929).

Orquestra três peças: a frase da capa e o tempo dela na `transcricao_final`
(`domain/corte/momento_da_frase`), quais quadros e qual região
(`domain/canal/quadros_do_apresentador`) e a leitura do vídeo
(`infrastructure/quadros_do_video`).

## A frase de cada capa

- thumbnail do YouTube e arte do TikTok: o `texto_capa` do corte (a arte do
  TikTok herda a frase da thumbnail); sem ele, a frase-gancho da curadoria;
- arte do short: a frase da capa do short, o gancho de tela ou o gancho da
  curadoria, procurados só nos trechos que o short contém.

## O vídeo

O bruto do corte (`arquivo_clip_path`, o `clip_raw_*.mkv`): é a timeline da
`transcricao_final`, e os trechos do short são medidos nele.

## Nunca derruba a capa

Sem frase que case, sem bruto, sem rosto fixo no trecho: a lista volta vazia e
o robô anexa o banco de fotos, como antes desta demanda. O motivo vai ao log.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
from dataclasses import dataclass
from pathlib import Path

from app.core.channel_paths import resolver_do_projeto
from app.database import AsyncSessionLocal
from app.domain.canal.quadros_do_apresentador import (
    Caixa,
    ampliacao,
    apresentador_entre,
    dentro_da_webcam,
    escolher_quadros,
    instantes_da_frase,
    instantes_para_os_lugares,
    lugares_de_rosto,
    regiao_do_apresentador,
)
from app.domain.corte.momento_da_frase import JanelaDaFrase, janela_da_frase
from app.domain.corte.youtube_layout import CANVAS_H, CANVAS_W, resolver_layout_em_cascata
from app.domain.short import segmentos_short
from app.domain.short.destaque_do_gancho import sem_marcas
from app.infrastructure import quadros_do_video
from app.models import Corte, MetadadoCorte, MetadadoShort, Projeto, Short
from app.services.app_settings import AppSettingsService
from sqlalchemy import select

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class MaterialDaCapa:
    """O que o banco diz sobre a capa: onde está o vídeo e o que procurar nele."""

    video: Path | None
    transcricao: list
    frases: list[str]
    trechos: list[tuple[float, float]] | None
    duracao: float
    webcam: Caixa | None = None


def _transcricao(bruto: str | None) -> list:
    try:
        dados = json.loads(bruto or "[]")
    except (TypeError, ValueError):
        return []
    return dados if isinstance(dados, list) else []


def _video_do_corte(corte: Corte) -> Path | None:
    if not corte.arquivo_clip_path:
        return None
    caminho = resolver_do_projeto(corte.arquivo_clip_path, corte.projeto_id)
    return caminho if caminho.is_file() else None


def webcam_do_layout(corte_layout, projeto_padrao, global_padrao) -> Caixa | None:
    """A webcam (`crop_facecam`) do layout em cascata, em frações do quadro.

    O layout mede no canvas 1920x1080 sobre o vídeo inteiro; a fração vale para
    o bruto em qualquer resolução. Layout ilegível é ausência de webcam.
    """
    try:
        crop = resolver_layout_em_cascata(corte_layout, projeto_padrao, global_padrao)[
            "compartilhada"
        ]["crop_facecam"]
        return Caixa(
            crop["x"] / CANVAS_W, crop["y"] / CANVAS_H, crop["w"] / CANVAS_W, crop["h"] / CANVAS_H
        )
    except (KeyError, TypeError, ValueError):
        return None


async def _material(db, corte: Corte, frases: list[str], trechos=None) -> MaterialDaCapa:
    projeto = await db.get(Projeto, corte.projeto_id)
    return MaterialDaCapa(
        video=_video_do_corte(corte),
        transcricao=_transcricao(corte.transcricao_final),
        frases=[f for f in frases if f and f.strip()],
        trechos=trechos,
        duracao=float(corte.duracao_clip_seg or 0) or math.inf,
        webcam=webcam_do_layout(
            corte.layout_youtube,
            projeto.layout_youtube_padrao if projeto else None,
            AppSettingsService.get().youtube_layout_padrao_global,
        ),
    )


async def material_da_capa(destino: str, alvo_id: str) -> MaterialDaCapa | None:
    """O material da capa de `destino` (youtube, tiktok, short), ou `None`."""
    async with AsyncSessionLocal() as db:
        if destino != "short":
            corte = await db.get(Corte, alvo_id)
            if corte is None:
                return None
            meta = await db.scalar(select(MetadadoCorte).where(MetadadoCorte.corte_id == alvo_id))
            texto_capa = (meta.texto_capa if meta else "") or ""
            return await _material(db, corte, [texto_capa, corte.frase_gancho_texto or ""])

        short = await db.get(Short, alvo_id)
        corte = await db.get(Corte, short.corte_id) if short else None
        if short is None or corte is None:
            return None
        meta_short = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == alvo_id))
        trechos = [
            (s.inicio_seg, s.fim_seg)
            for s in segmentos_short.efetivos(
                segmentos_short.de_json(short.segmentos),
                inicio_seg=float(short.inicio_seg),
                fim_seg=float(short.fim_seg),
            )
        ]
        frases = [
            (meta_short.frase_capa if meta_short else "") or "",
            sem_marcas(short.gancho_tela or ""),
            short.gancho or "",
        ]
        return await _material(db, corte, frases, trechos)


def _janela(material: MaterialDaCapa) -> JanelaDaFrase | None:
    for frase in material.frases:
        janela = janela_da_frase(material.transcricao, frase, material.trechos)
        if janela is not None:
            return janela
    return None


def extrair_quadros(material: MaterialDaCapa, pasta: Path) -> list[Path]:
    """Os recortes do apresentador no momento da frase, salvos em `pasta`.

    Síncrono (OpenCV): quem chama roda numa thread. Vazio quando não deu.
    """
    if material.video is None:
        logger.info("[Quadros] sem bruto do corte em disco: vai o banco de fotos")
        return []
    janela = _janela(material)
    if janela is None:
        logger.info("[Quadros] a frase da capa não casou com a fala: vai o banco de fotos")
        return []
    lugares = lugares_de_rosto(
        quadros_do_video.rostos_nos_instantes(
            material.video,
            instantes_para_os_lugares(janela.inicio_seg, janela.fim_seg, material.duracao),
        )
    )
    proporcao = quadros_do_video.proporcao(material.video)
    regioes = [regiao_do_apresentador(lugar, proporcao) for lugar in lugares]
    instantes = instantes_da_frase(janela.inicio_seg, janela.fim_seg, material.duracao)
    medidos = [
        quadros_do_video.medir_candidatos(material.video, instantes, regiao) for regiao in regioes
    ]
    # A vida que decide é a do ROSTO (D-956): na região ampliada, a de um retrato
    # pequeno na parede crescia com a cabeça do apresentador entrando nela, e a
    # dele, grande, diluía o movimento.
    nos_rostos = [
        quadros_do_video.medir_candidatos(material.video, instantes, lugar) for lugar in lugares
    ]
    qual = apresentador_entre(lugares, nos_rostos, material.webcam)
    if qual is None:
        logger.info("[Quadros] nenhum rosto fixo e vivo perto da frase: vai o banco de fotos")
        return []
    regiao = dentro_da_webcam(regioes[qual], material.webcam)
    escolhidos = escolher_quadros(medidos[qual])
    salvos = quadros_do_video.salvar_recortes(
        material.video, [c.instante for c in escolhidos], regiao, pasta, ampliacao
    )
    logger.info(
        "[Quadros] %d quadro(s) da frase em %.2f–%.2fs (casou %.0f%%)",
        len(salvos),
        janela.inicio_seg,
        janela.fim_seg,
        janela.casamento * 100,
    )
    return salvos


async def quadros_do_apresentador(destino: str, alvo_id: str, pasta: Path) -> list[Path]:
    """Os quadros da live para esta capa, ou lista vazia (o robô volta ao banco)."""
    try:
        material = await material_da_capa(destino, alvo_id)
        if material is None:
            return []
        return await asyncio.to_thread(extrair_quadros, material, pasta)
    except Exception as exc:  # noqa: BLE001 — quadro é melhoria: a capa segue com o banco
        logger.warning(
            "[Quadros] não tirei quadros da capa %s de %s: %s", destino, alvo_id[:8], exc
        )
        return []
