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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import channel_paths
from app.core import process_runner
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
# D-750: ~3x o pior caso medido (101 s, na primeira execução, a frio; o normal é
# 11-38 s). Só existe para um Chromium travado não prender o render para sempre.
_TIMEOUT_DO_GERADOR_SEG = 300


def _cache_dir() -> Path:
    return channel_paths.palco_cache_dir()


# Quantos bytes do final da saída do gen-youtube-palco.mjs entram no diagnóstico.
_SAIDA_TAIL_BYTES = 2048


@dataclass(frozen=True)
class PalcoPngFalha:
    """Diagnóstico de UMA geração de PNG do palco que falhou (D-384).

    `saida` carrega os últimos KB do stdout+stderr do gen-youtube-palco.mjs —
    é o que permite diagnosticar sem re-rodar o gerador na mão.
    """

    chave: str
    returncode: int | None
    saida: str


@dataclass
class PalcoPngsResultado:
    """Resultado de `ensure_palco_pngs_para_layout` (D-384).

    Além dos PNGs gerados, expõe as chaves EXIGIDAS pelas regiões
    compartilhadas/full posicionadas do corte — é a diferença entre "faltou um
    PNG opcional" (base sem região) e "o render vai sair com fundo placeholder".
    """

    gerados: dict[str, Path] = field(default_factory=dict)
    falhas: list[PalcoPngFalha] = field(default_factory=list)
    chaves_regioes: set[str] = field(default_factory=set)

    @property
    def regioes_sem_png(self) -> set[str]:
        """Chaves exigidas por região que NÃO têm PNG — condição de bloqueio."""
        return {chave for chave in self.chaves_regioes if chave not in self.gerados}

    def diagnostico(self) -> str:
        """Texto único com a saída do gerador por chave falhada."""
        partes = [
            f"[{falha.chave} rc={falha.returncode if falha.returncode is not None else '?'}] "
            f"{falha.saida}".strip()
            for falha in self.falhas
        ]
        return "\n".join(partes) or "sem saida capturada do gen-youtube-palco.mjs"


class PalcoPngGeracaoError(RuntimeError):
    """PNG do palco exigido por região do corte não pôde ser gerado (D-384).

    Levantado pelo pipeline de render para BLOQUEAR o render em vez de
    entregar vídeo com o fundo procedural de fallback sem ninguém perceber.
    """

    def __init__(self, chaves_faltantes: set[str], diagnostico: str) -> None:
        self.chaves_faltantes = sorted(chaves_faltantes)
        self.diagnostico = diagnostico
        super().__init__(
            f"PNG do palco nao pode ser gerado para {len(self.chaves_faltantes)} "
            f"regiao(oes) do corte (chaves: {', '.join(self.chaves_faltantes)}). "
            "Render bloqueado para nao publicar video com fundo placeholder. "
            "Para renderizar mesmo assim com o fundo de fallback, defina "
            "PALCO_FALLBACK_EXPLICITO=1. Diagnostico do gen-youtube-palco.mjs:\n"
            f"{diagnostico}"
        )


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
    resultado = await _ensure_png_para_props(_props_from_resolved(resolvido), forcar=forcar)
    return resultado if isinstance(resultado, Path) else None


async def ensure_palco_pngs_para_layout(
    layout_youtube: Any,
    duracao_seg: float | None = None,
    *,
    forcar: bool = False,
    projeto_padrao: Any = None,
    global_padrao: Any = None,
) -> PalcoPngsResultado:
    """Garante PNG por config único do layout — base + overrides de segmento (F-048).

    Retorna `PalcoPngsResultado` (D-384): `gerados` traz `{cache_key: path}`
    (uma região sem override compartilha a chave do PNG base); configs que
    falharem entram em `falhas` com a saída do gerador; `chaves_regioes` lista
    as chaves EXIGIDAS pelas regiões compartilhadas/full posicionadas — se
    alguma delas não estiver em `gerados`, o render sairia com fundo placeholder.

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
    # D-384: chaves exigidas pelas regiões — a base só entra aqui quando uma
    # região a compartilha; base sem região é pré-geração opcional.
    chaves_regioes: set[str] = set()

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
        chaves_regioes.add(chave)
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
        chaves_regioes.add(chave)
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

    async def _gerar(chave: str, props: dict) -> tuple[str, Path | PalcoPngFalha]:
        async with sem:
            destino = _cache_dir() / f"{chave}.png"
            try:
                return chave, await _ensure_png_para_props(props, destino=destino, forcar=forcar)
            except Exception as exc:  # noqa: BLE001 — falha vira diagnóstico, não crash
                return chave, PalcoPngFalha(
                    chave=chave,
                    returncode=None,
                    saida=f"{type(exc).__name__}: {exc}"[-_SAIDA_TAIL_BYTES:],
                )

    pares = await asyncio.gather(*[_gerar(c, p) for c, p in configs_por_chave.items()])
    resultado = PalcoPngsResultado(chaves_regioes=chaves_regioes)
    for chave, valor in pares:
        if isinstance(valor, Path):
            resultado.gerados[chave] = valor
        else:
            resultado.falhas.append(valor)
    return resultado


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
) -> Path | PalcoPngFalha:
    """Helper: gera um PNG a partir de props ja resolvidas (sem normalizacao).

    D-384: em vez de devolver None (falha silenciosa), devolve `PalcoPngFalha`
    com os últimos KB da saída do gen-youtube-palco.mjs para diagnóstico.
    """
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

    chave = destino.stem
    chave_inflight = destino.name
    if destino.exists() and not forcar:
        return destino
    if chave_inflight in _inflight:
        if destino.exists():
            return destino
        return PalcoPngFalha(
            chave=chave,
            returncode=None,
            saida="geracao concorrente da mesma chave ainda em andamento; "
            "re-execute o render quando ela concluir",
        )

    _inflight.add(chave_inflight)
    try:
        cache_dir = _cache_dir()
        cache_dir.mkdir(parents=True, exist_ok=True)
        fd, props_path = tempfile.mkstemp(suffix=".palco-props.json", dir=str(cache_dir))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(props, handle)
            try:
                resultado = await process_runner.rodar(
                    ["node", str(_GEN_SCRIPT), str(destino), props_path],
                    cwd=_REPO_ROOT,
                    timeout=_TIMEOUT_DO_GERADOR_SEG,
                )
                returncode, saida = resultado.returncode, resultado.saida
            except process_runner.ProcessoEstourouOTempo as exc:
                # Timeout cai no caminho de falha visível de sempre (D-750).
                returncode, saida = -1, str(exc)

            if returncode != 0:
                logger.warning(
                    "gen-youtube-palco falhou (rc=%s): %s",
                    returncode,
                    saida[-800:],
                )
                return PalcoPngFalha(
                    chave=chave,
                    returncode=returncode,
                    saida=saida[-_SAIDA_TAIL_BYTES:],
                )
        finally:
            Path(props_path).unlink(missing_ok=True)
    finally:
        _inflight.discard(chave_inflight)

    if destino.exists():
        return destino
    return PalcoPngFalha(
        chave=chave,
        returncode=returncode,
        saida=("gerador terminou com rc=0 mas o PNG nao foi criado.\n" + saida)[
            -_SAIDA_TAIL_BYTES:
        ],
    )
