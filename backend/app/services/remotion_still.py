"""Roda um gerador de `remotion still` repetindo só quando o Chrome não atendeu.

O `remotion still` espera o Chrome por 25 s fixos. Com a máquina ocupada (bundle
e overlays de um render, ou o portão de testes em paralelo), o Chrome passa
disso: falha de carga, não de layout. Começou no palco (D-942) e se repetiu na
capa do TikTok (D-949). Outra falha não se repete: é de layout ou de ambiente, e
a segunda tentativa daria o mesmo.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core import process_runner

logger = logging.getLogger(__name__)

# O que o `remotion still` escreve quando o Chrome não atende em 25 s.
CHROME_NAO_ATENDEU = "while trying to connect to the browser"
TENTATIVAS_COM_CHROME_MUDO = 3
ESPERA_ENTRE_TENTATIVAS_SEG = 5


async def rodar_gerador(
    argumentos: list[str],
    *,
    cwd: Path,
    timeout: float,
    tentativas: int | None = None,
    espera_seg: float | None = None,
) -> tuple[int, str]:
    """Devolve `(returncode, saida)`; timeout vira código -1 (D-750)."""
    tentativas = TENTATIVAS_COM_CHROME_MUDO if tentativas is None else tentativas
    espera_seg = ESPERA_ENTRE_TENTATIVAS_SEG if espera_seg is None else espera_seg
    for tentativa in range(1, tentativas + 1):
        try:
            resultado = await process_runner.rodar(argumentos, cwd=cwd, timeout=timeout)
        except process_runner.ProcessoEstourouOTempo as exc:
            # Timeout cai no caminho de falha visível de sempre (D-750).
            return -1, str(exc)
        chrome_mudo = CHROME_NAO_ATENDEU in resultado.saida
        if resultado.returncode == 0 or not chrome_mudo:
            break
        if tentativa < tentativas:
            logger.warning(
                "%s: o Chrome nao atendeu (tentativa %d de %d); tentando de novo",
                Path(argumentos[1]).name,
                tentativa,
                tentativas,
            )
            await asyncio.sleep(espera_seg)
    return resultado.returncode, resultado.saida
