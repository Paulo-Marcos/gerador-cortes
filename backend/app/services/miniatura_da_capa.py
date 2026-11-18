"""A miniatura de 64 px de uma capa (D-1130, E-069 B-3): ponte entre a rota e o PIL."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.infrastructure.imagem.miniatura import miniatura_jpeg


async def miniatura_da_capa(caminho: Path) -> bytes:
    """O JPEG de até 4 KB da capa, gerado fora do laço de eventos."""
    return await asyncio.to_thread(miniatura_jpeg, caminho)
