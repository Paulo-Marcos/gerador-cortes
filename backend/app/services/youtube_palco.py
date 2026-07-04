"""Geração/cache do PNG do "palco" (Variante A da F-020).

O "palco" (fundo + chrome + molduras + placa, com as janelas de vídeo
TRANSPARENTES) é rasterizado pelo Remotion still no video-renderer e usado como
camada de FRENTE no FFmpeg do render final. O backend é dono da chave de cache
(`palco_cache_key`) e do caminho de saída; o gerador Node só recebe o caminho —
evita divergência de hash entre Python e JS.

O resolver puro em `app.domain.ffmpeg_commands._resolve_shared_fg_png` só procura
o arquivo; quem GERA é este service (efeito colateral fora do domínio puro).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

from app import channel_paths
from app.domain.youtube_layout import (
    config_compartilhada_para_full,
    normalizar_layout_youtube,
    palco_cache_key,
    palco_cache_key_para_config,
    regioes_compartilhadas,
    regioes_full_posicionadas,
    resolver_layout_em_cascata,
)

logger = logging.getLogger(__name__)

_REPO_ROOT = Path(__file__).resolve().parents[3]
# Cache sob `projetos/_palco_cache` (já gitignored + persistente). Resolvido por
# `channel_paths.palco_cache_dir()` para seguir o canal ATIVO (D-156) — mesma
# pasta que `_resolve_shared_fg_png` no ffmpeg_commands consome.
_GEN_SCRIPT = _REPO_ROOT / "scripts" / "gen-youtube-palco.mjs"


def _cache_dir() -> Path:
    return channel_paths.palco_cache_dir()


# Dedupe de gerações concorrentes da MESMA chave — sem isso, salvar o layout
# várias vezes dispara N bundles do Remotion em paralelo (o "storm").
_inflight: set[str] = set()


def _coerce_layout(layout_youtube: Any) -> dict | None:
    if isinstance(layout_youtube, str):
        try:
            return json.loads(layout_youtube)
        except (ValueError, TypeError):
            return None
    if isinstance(layout_youtube, dict):
        return layout_youtube
    return None


def palco_png_path(layout_youtube: Any) -> Path:
    """Caminho do PNG do palco em cache (não garante existência)."""
    return _cache_dir() / f"{palco_cache_key(layout_youtube)}.png"


def _props_from_layout(layout: dict) -> dict:
    norm = normalizar_layout_youtube(layout)
    compartilhada = norm["compartilhada"]
    return {
        "fundo": norm["fundo"],
        "placa": norm["placa"],
        "telas": compartilhada["telas"],
        "crop_tela": compartilhada["crop_tela"],
        "crop_facecam": compartilhada["crop_facecam"],
        "slot_tela": compartilhada["slot_tela"],
        "slot_facecam": compartilhada["slot_facecam"],
    }


async def ensure_palco_png(
    layout_youtube: Any,
    *,
    forcar: bool = False,
    projeto_padrao: Any = None,
    global_padrao: Any = None,
) -> Path | None:
    """Garante o PNG base do palco em cache; gera via Remotion still se faltar.

    Idempotente: se já existe (e não `forcar`), não regenera. Retorna o caminho
    do PNG ou None se a geração falhar (o render cai no fallback de fundo).

    F-048: aceita `projeto_padrao` e `global_padrao` como fallbacks da cascade.
    """
    layout = _coerce_layout(layout_youtube)
    if layout is None:
        layout = {}
    resolvido = resolver_layout_em_cascata(
        corte_layout=layout,
        projeto_padrao=projeto_padrao,
        global_padrao=global_padrao,
    )
    return await _ensure_png_para_props(_props_from_resolved(resolvido), forcar=forcar)


async def ensure_palco_pngs_para_layout(
    layout_youtube: Any,
    duracao_seg: float | None = None,
    *,
    forcar: bool = False,
    projeto_padrao: Any = None,
    global_padrao: Any = None,
) -> dict[str, Path]:
    """Garante PNG por config único do layout — base + overrides de segmento (F-048).

    Retorna `{cache_key: path}`; uma região sem override compartilha a chave do
    PNG base. Configs que falharem na geração são omitidos do mapa.

    Cascade lazy: usa `projeto_padrao`/`global_padrao` quando o corte nao tem
    `compartilhada` proprio.

    NOTE: o pipeline FFmpeg em `ffmpeg_commands.py` ainda consome só o PNG base
    (`_resolve_shared_fg_png`). Wiring per-region é follow-up — esta função
    apenas pré-gera os PNGs necessários para quando esse caminho existir.
    """
    layout = _coerce_layout(layout_youtube)
    if layout is None:
        layout = {}

    resolvido = resolver_layout_em_cascata(
        corte_layout=layout,
        projeto_padrao=projeto_padrao,
        global_padrao=global_padrao,
    )
    configs_por_chave: dict[str, dict[str, Any]] = {}

    base_props = _props_from_resolved(resolvido)
    base_key = palco_cache_key_para_config(
        resolvido["compartilhada"],
        fundo=resolvido["fundo"],
        placa=resolvido["placa"],
    )
    configs_por_chave[base_key] = base_props

    for regiao in regioes_compartilhadas(
        layout,
        duracao_seg=duracao_seg,
        fallback_layout=projeto_padrao,
        global_padrao=global_padrao,
    ):
        compartilhada = {
            "telas": regiao["telas"],
            "crop_facecam": regiao["crop_facecam"],
            "crop_tela": regiao["crop_tela"],
            "slot_facecam": regiao["slot_facecam"],
            "slot_tela": regiao["slot_tela"],
        }
        chave = palco_cache_key_para_config(
            compartilhada,
            fundo=resolvido["fundo"],
            placa=resolvido["placa"],
        )
        if chave in configs_por_chave:
            continue
        configs_por_chave[chave] = {
            "fundo": resolvido["fundo"],
            "placa": resolvido["placa"],
            **compartilhada,
        }

    # F-060: regioes FULL posicionadas usam o palco de 1 tela com o config
    # sintetico (crop/slot -> crop_tela/slot_tela) — mesma chave de cache que
    # o ffmpeg_commands resolve no render.
    for regiao_full in regioes_full_posicionadas(
        layout,
        duracao_seg=duracao_seg,
        fallback_layout=projeto_padrao,
        global_padrao=global_padrao,
    ):
        compartilhada = config_compartilhada_para_full(
            {"crop": regiao_full["crop"], "slot": regiao_full["slot"]}
        )
        chave = palco_cache_key_para_config(
            compartilhada,
            fundo=resolvido["fundo"],
            placa=resolvido["placa"],
        )
        if chave in configs_por_chave:
            continue
        configs_por_chave[chave] = {
            "fundo": resolvido["fundo"],
            "placa": resolvido["placa"],
            **compartilhada,
        }

    # Geracao PARALELA dos PNGs de config unico (cada um spawna um `node`
    # gen-youtube-palco.mjs). Antes era serial (um await por PNG); com varios
    # overrides de segmento isso somava o bundle de cada PNG em sequencia.
    # Cache hit retorna imediato; o semaforo evita spawnar node demais de uma vez.
    sem = asyncio.Semaphore(3)

    async def _gerar(chave: str, props: dict) -> tuple[str, Path | None]:
        async with sem:
            destino = _cache_dir() / f"{chave}.png"
            return chave, await _ensure_png_para_props(props, destino=destino, forcar=forcar)

    pares = await asyncio.gather(*[_gerar(c, p) for c, p in configs_por_chave.items()])
    return {chave: caminho for chave, caminho in pares if caminho is not None}


def _props_from_resolved(layout: dict) -> dict:
    """Variante de `_props_from_layout` que recebe ja resolvido (sem renormalizar)."""
    compartilhada = layout["compartilhada"]
    return {
        "fundo": layout["fundo"],
        "placa": layout["placa"],
        "telas": compartilhada["telas"],
        "crop_tela": compartilhada["crop_tela"],
        "crop_facecam": compartilhada["crop_facecam"],
        "slot_tela": compartilhada["slot_tela"],
        "slot_facecam": compartilhada["slot_facecam"],
    }


async def _ensure_png_para_props(
    props: dict[str, Any],
    *,
    destino: Path | None = None,
    forcar: bool = False,
) -> Path | None:
    """Helper: gera um PNG a partir de props ja resolvidas (sem normalizacao)."""
    if destino is None:
        chave = palco_cache_key_para_config(
            compartilhada={
                "telas": props["telas"],
                "crop_facecam": props["crop_facecam"],
                "crop_tela": props["crop_tela"],
                "slot_facecam": props["slot_facecam"],
                "slot_tela": props["slot_tela"],
            },
            fundo=props["fundo"],
            placa=props["placa"],
        )
        destino = _cache_dir() / f"{chave}.png"

    chave_inflight = destino.name
    if destino.exists() and not forcar:
        return destino
    if chave_inflight in _inflight:
        return destino if destino.exists() else None

    _inflight.add(chave_inflight)
    try:
        cache_dir = _cache_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
        fd, props_path = tempfile.mkstemp(suffix=".palco-props.json", dir=str(cache_dir))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(props, handle)
            try:
                proc = await asyncio.create_subprocess_exec(
                    "node",
                    str(_GEN_SCRIPT),
                    str(destino),
                    props_path,
                    cwd=str(_REPO_ROOT),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                )
                saida_bytes, _ = await proc.communicate()
                returncode = proc.returncode
                saida = saida_bytes.decode(errors="replace")
            except NotImplementedError:
                # Fallback para Windows caso o SelectorEventLoop esteja ativo
                import subprocess

                def run_node():
                    return subprocess.run(
                        ["node", str(_GEN_SCRIPT), str(destino), props_path],
                        cwd=str(_REPO_ROOT),
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        errors="replace",
                    )

                result = await asyncio.to_thread(run_node)
                returncode = result.returncode
                saida = result.stdout

            if returncode != 0:
                logger.warning(
                    "gen-youtube-palco falhou (rc=%s): %s",
                    returncode,
                    saida[-800:],
                )
                return None
        finally:
            Path(props_path).unlink(missing_ok=True)
    finally:
        _inflight.discard(chave_inflight)

    return destino if destino.exists() else None
