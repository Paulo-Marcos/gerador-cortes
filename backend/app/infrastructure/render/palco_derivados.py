"""Assets derivados do PNG do palco para o composite pré-composto (D-415).

O overlay full-frame RGBA do palco custava ~2x o tempo da grade (D-329/D-415).
Como palco e slots são ESTÁTICOS, este módulo pré-compõe offline, uma vez por
palco, dois assets que trocam o graph por um ~26% mais rápido (bench D-415):

- ``<key>.bgpre.png``  — fundo OPACO: base preta + palco achatados, com o
  chrome DENTRO dos slots removido (aplicado depois, pelo chrome overlay).
  Opaco → a cadeia principal do filtergraph roda em yuv420p, eliminando as
  conversões RGBA full-frame (o ganho real medido no bench).
- ``<key>.chrome.png`` — recorte RGBA do palco no bbox-união dos slots, com
  alpha mascarado aos retângulos dos slots. Único overlay RGBA que precisa
  ficar POR CIMA dos vídeos (chanfro/placa sobre a borda).

A partição por slots garante que cada pixel do palco é aplicado EXATAMENTE uma
vez (fora dos slots: baked no bgpre; dentro: só pelo chrome) — sem double-blend.

Efeito colateral intencional de cache (mesmo padrão de `_resolve_filter_arg`):
escreve os derivados ao lado do PNG do palco e reusa via sidecar JSON.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

_CANVAS_W = 1920
_CANVAS_H = 1080
_VERSAO = 1


@dataclass(frozen=True)
class PalcoDerivados:
    """Par de assets pré-compostos + posição do recorte de chrome no canvas."""

    bg_pre: Path
    chrome: Path
    chrome_x: int
    chrome_y: int


def slots_da_regiao(region: dict) -> list[tuple[int, int, int, int]] | None:
    """Retângulos dos slots de vídeo da região (tela sempre; facecam se 2 telas)."""
    try:
        telas = int(region.get("telas", 2) or 2)
    except (TypeError, ValueError):
        telas = 2
    slots = [region["slot_tela"]]
    if telas != 1:
        slots.append(region["slot_facecam"])
    rects = []
    for slot in slots:
        r = _rect_clipado(slot)
        if r is None:
            return None  # slot degenerado/fora do canvas — sem otimização
        rects.append(r)
    return rects


def ensure_derivados_palco(palco_png: Path, region: dict) -> PalcoDerivados | None:
    """Garante (gera ou reusa do cache) os derivados do palco para a região.

    Retorna None em qualquer falha — o chamador cai no graph legado (palco
    full-frame), nunca quebra o render por causa da otimização.
    """
    try:
        slots = slots_da_regiao(region)
        if not slots:
            return None
        chave = _hash_slots(slots)
        base = palco_png.with_suffix("")
        bg_pre = base.with_name(base.name + ".bgpre.png")
        chrome = base.with_name(base.name + ".chrome.png")
        sidecar = base.with_name(base.name + ".derivados.json")

        reuso = _reusar_cache(sidecar, bg_pre, chrome, palco_png, chave)
        if reuso is not None:
            return PalcoDerivados(bg_pre, chrome, *reuso)

        offset = _gerar(palco_png, slots, bg_pre, chrome)
        if offset is None:
            return None
        sidecar.write_text(
            json.dumps(
                {
                    "versao": _VERSAO,
                    "slots_hash": chave,
                    "chrome_x": offset[0],
                    "chrome_y": offset[1],
                }
            ),
            encoding="utf-8",
        )
        return PalcoDerivados(bg_pre, chrome, *offset)
    except Exception:  # noqa: BLE001 — derivado é otimização: sem ele, vale o palco inteiro
        return None


def _reusar_cache(
    sidecar: Path, bg_pre: Path, chrome: Path, palco_png: Path, chave: str
) -> tuple[int, int] | None:
    if not (sidecar.exists() and bg_pre.exists() and chrome.exists()):
        return None
    try:
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if meta.get("versao") != _VERSAO or meta.get("slots_hash") != chave:
        return None
    # Palco regenerado depois dos derivados → derivados stale.
    if palco_png.stat().st_mtime > sidecar.stat().st_mtime:
        return None
    return (int(meta["chrome_x"]), int(meta["chrome_y"]))


def _gerar(
    palco_png: Path, slots: list[tuple[int, int, int, int]], bg_pre: Path, chrome: Path
) -> tuple[int, int] | None:
    """Gera os dois PNGs derivados. Retorna a posição (x, y) do chrome."""
    from PIL import Image, ImageChops, ImageDraw  # import local: só o cache-miss paga

    im = Image.open(palco_png).convert("RGBA")
    if im.size != (_CANVAS_W, _CANVAS_H):
        im = im.resize((_CANVAS_W, _CANVAS_H))

    # Máscara dos slots (255 dentro, 0 fora) no canvas inteiro.
    mask = Image.new("L", im.size, 0)
    draw = ImageDraw.Draw(mask)
    for x, y, w, h in slots:
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=255)

    alpha = im.getchannel("A")

    # bg_pre: palco SEM o chrome interno aos slots, achatado sobre preto, opaco.
    palco_fora = im.copy()
    palco_fora.putalpha(ImageChops.multiply(alpha, ImageChops.invert(mask)))
    fundo = Image.new("RGBA", im.size, (0, 0, 0, 255))
    fundo.alpha_composite(palco_fora)
    fundo.convert("RGB").save(bg_pre)

    # chrome: recorte do bbox-união dos slots, alpha só dentro dos slots.
    x0 = min(x for x, _, _, _ in slots)
    y0 = min(y for _, y, _, _ in slots)
    x1 = max(x + w for x, _, w, _ in slots)
    y1 = max(y + h for _, y, _, h in slots)
    recorte = im.crop((x0, y0, x1, y1))
    recorte.putalpha(ImageChops.multiply(alpha, mask).crop((x0, y0, x1, y1)))
    recorte.save(chrome)
    return (x0, y0)


def _rect_clipado(slot: dict) -> tuple[int, int, int, int] | None:
    try:
        x = max(0, int(round(float(slot["x"]))))
        y = max(0, int(round(float(slot["y"]))))
        w = min(_CANVAS_W - x, int(round(float(slot["w"]))))
        h = min(_CANVAS_H - y, int(round(float(slot["h"]))))
    except (KeyError, TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    return (x, y, w, h)


def _hash_slots(slots: list[tuple[int, int, int, int]]) -> str:
    canonico = json.dumps(sorted(slots), separators=(",", ":"))
    return hashlib.sha256(f"v{_VERSAO}:{canonico}".encode()).hexdigest()[:16]
