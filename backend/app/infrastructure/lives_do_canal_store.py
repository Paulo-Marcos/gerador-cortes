"""Conta as lives (linhas de `projetos`) de um banco de canal (D-1141).

Abre o arquivo só para leitura, sem passar pelo engine do canal ativo e sem criar
banco onde não há. Banco ausente, sem a tabela ou ilegível conta 0: a lista de canais
não pode quebrar por causa de um deles.
"""

from __future__ import annotations

import logging
import sqlite3
from contextlib import closing
from pathlib import Path

logger = logging.getLogger(__name__)

_TIMEOUT_S = 2.0


def contar_projetos(banco: Path) -> int:
    """As linhas de `projetos` do banco; 0 sem arquivo, sem a tabela ou se ele não abre."""
    if not banco.is_file():
        return 0
    try:
        with closing(
            sqlite3.connect(f"{banco.as_uri()}?mode=ro", uri=True, timeout=_TIMEOUT_S)
        ) as con:
            return int(con.execute("SELECT count(*) FROM projetos").fetchone()[0])
    except sqlite3.Error:
        logger.warning("Não deu para contar as lives de %s", banco, exc_info=True)
        return 0
