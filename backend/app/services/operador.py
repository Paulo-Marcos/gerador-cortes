"""Caso de uso do nome do operador (D-1129)."""

from __future__ import annotations

from app.core import channel_paths
from app.domain.compartilhado.nome_do_operador import normalizar_nome
from app.infrastructure import operador_store


def ler_nome() -> str:
    return operador_store.ler_nome(channel_paths.settings_db_path())


def definir_nome(texto: str | None) -> str:
    """Grava o nome normalizado e o devolve; nome vazio limpa."""
    nome = normalizar_nome(texto)
    operador_store.gravar_nome(channel_paths.settings_db_path(), nome)
    return nome
