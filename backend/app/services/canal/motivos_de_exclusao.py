"""Os motivos de excluir um corte do canal ativo (D-1006).

Vivem no `settings.db`, por canal, editáveis na tela de Canais (ADR-0012). O
apagar aceita só os visíveis; a telemetria conta e nomeia todos, inclusive os
escondidos. As regras moram em `domain/corte/motivos_do_canal.py`.
"""

from __future__ import annotations

from pathlib import Path

from app.core import channel_paths
from app.domain.corte import motivos_do_canal
from app.infrastructure import motivos_de_exclusao_store


def _banco_e_canal() -> tuple[Path, str]:
    return channel_paths.settings_db_path(), channel_paths.active_channel_root().name


def motivos() -> list[dict]:
    """A lista do canal, visíveis e escondidos; a de quem nunca editou é o padrão."""
    return motivos_do_canal.ler_motivos(motivos_de_exclusao_store.ler(*_banco_e_canal()))


def descrever() -> dict:
    """O que a tela de Canais mostra."""
    guardados = motivos_de_exclusao_store.ler(*_banco_e_canal())
    return {
        "motivos": motivos_do_canal.ler_motivos(guardados),
        "personalizado": guardados is not None,
    }


def acrescentar(rotulo: str) -> dict:
    _gravar(motivos_do_canal.acrescentar_motivo(motivos(), rotulo))
    return descrever()


def mostrar(slug: str, *, ativo: bool) -> dict:
    _gravar(motivos_do_canal.mostrar_motivo(motivos(), slug, ativo=ativo))
    return descrever()


def _gravar(lista: list[dict]) -> None:
    motivos_de_exclusao_store.gravar(*_banco_e_canal(), lista)
