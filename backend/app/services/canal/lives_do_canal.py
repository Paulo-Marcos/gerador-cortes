"""Quantas lives cada canal tem (D-1141, E-069 §7.9: o popover de troca de canal).

Cada canal tem o seu banco (`instance/channels/<canal>/projetos/projetos.db`) e uma
live é uma linha de `projetos`. A contagem é um `SELECT count(*)` por arquivo, medido
em milissegundos: sem cache, o número nunca fica velho depois de baixar uma live.
"""

from __future__ import annotations

from pathlib import Path

from app.core.channel_paths import instance_root
from app.infrastructure.lives_do_canal_store import contar_projetos


def lives_da_pasta(projetos: Path) -> int:
    """As lives do banco da pasta de projetos; 0 sem banco ou sem a tabela."""
    return contar_projetos(projetos / "projetos.db")


def lives_do_canal(canal_id: str) -> int:
    """O número de lives do canal."""
    return lives_da_pasta(instance_root() / "channels" / canal_id / "projetos")
