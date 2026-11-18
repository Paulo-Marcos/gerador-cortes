"""A luz de cada canal, amostrada das capas mais recentes dele (D-1130, E-069 B-3).

Lê `instance/channels/<canal>/projetos/*/thumbnails/thumb_*` (as capas do YouTube;
`_arte` é a arte sem texto e fica de fora). Sem capa, a luz vem vazia. O resultado
fica em memória por alguns minutos: a lista de canais é consultada a toda hora e as
capas mudam de tempos em tempos. A paleta cadastrada tem precedência sobre esta
amostra, mas quem decide isso é a tela.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from app.core.channel_paths import instance_root
from app.domain.canal.luz_do_canal import luz_das_amostras
from app.infrastructure.imagem.miniatura import amostra_de_pixels

logger = logging.getLogger(__name__)

CAPAS_AMOSTRADAS = 6
_VALIDADE_S = 300.0
_EXTENSOES = {".png", ".jpg", ".jpeg", ".webp"}
_cache: dict[str, tuple[float, list[str]]] = {}


def _quando(capa: Path) -> float:
    try:
        return capa.stat().st_mtime
    except OSError:  # apagada entre o glob e aqui
        return 0.0


def _capas_recentes(projetos: Path) -> list[Path]:
    capas = [
        p
        for p in projetos.glob("*/thumbnails/thumb_*")
        if p.suffix.lower() in _EXTENSOES and not p.stem.endswith("_arte")
    ]
    capas.sort(key=_quando, reverse=True)
    return capas[:CAPAS_AMOSTRADAS]


def luz_da_pasta(projetos: Path) -> list[str]:
    """A luz amostrada das capas mais recentes da pasta de projetos; vazia sem capa."""
    pixels: list[tuple[int, int, int]] = []
    for capa in _capas_recentes(projetos):
        try:
            pixels.extend(amostra_de_pixels(capa))
        except Exception:  # noqa: BLE001 - uma capa quebrada (ou bomba do PIL) não derruba a lista
            logger.warning("Capa ilegível ao amostrar a luz do canal: %s", capa, exc_info=True)
    return luz_das_amostras(pixels)


def luz_do_canal(canal_id: str) -> list[str]:
    """A luz do canal, do cache enquanto estiver fresca."""
    agora = time.monotonic()
    guardado = _cache.get(canal_id)
    if guardado is not None and agora - guardado[0] < _VALIDADE_S:
        return guardado[1]
    luz = luz_da_pasta(instance_root() / "channels" / canal_id / "projetos")
    _cache[canal_id] = (agora, luz)
    return luz
