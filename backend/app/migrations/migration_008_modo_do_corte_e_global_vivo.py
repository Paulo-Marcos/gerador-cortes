"""Migration 008 — o modo do corte vira decisão, e o Global volta a chegar vivo (D-966).

RN-10: a chave ausente é a herança. Dois resíduos contrariavam a regra:

1. **A sentinela do corte.** Todo corte nascia com `{"modo_padrao": "full",
   "regioes": []}`, e a leitura adivinhava se aquele `full` era escolha ou
   herança. A leitura agora trata `modo_padrao` gravado como decisão; aqui o
   `full` da sentinela sai dos cortes que a leitura antiga fazia HERDAR (sem
   fundo, placa, recortes nem regiões) — o modo efetivo de cada um não muda.
2. **As cópias do Global.** "Definir Global" copiava o padrão em todo projeto
   (F-020). Cada chave do projeto IGUAL à do Global sai, e o projeto volta a
   herdá-la; o que o projeto ajustou (valor diferente) fica.

Idempotente: rodar de novo não acha sentinela nem cópia.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

logger = logging.getLogger(__name__)

# O que a leitura antiga (`corte_configurado`) via como "o corte configurou algo".
_CHAVES_QUE_CONFIGURAVAM = ("fundo", "placa", "compartilhada", "full")
_MODOS_FULL = ("full", "padrao", "tela_cheia")


def _como_dict(valor: Any) -> dict[str, Any] | None:
    try:
        lido = json.loads(valor) if isinstance(valor, str) and valor.strip() else valor
    except ValueError:
        return None
    return lido if isinstance(lido, dict) else None


def _sem_sentinela(layout: dict[str, Any]) -> dict[str, Any] | None:
    """O layout sem o `full` da sentinela; `None` quando ele não é sentinela."""
    modo = str(layout.get("modo_padrao") or "").strip().lower()
    if modo not in _MODOS_FULL:
        return None
    if any(chave in layout for chave in _CHAVES_QUE_CONFIGURAVAM) or layout.get("regioes"):
        return None
    return {chave: valor for chave, valor in layout.items() if chave != "modo_padrao"}


def _sem_copia_do_global(padrao: dict[str, Any], global_: dict[str, Any]) -> dict[str, Any] | None:
    """O padrão do projeto sem as chaves iguais às do Global; `None` se nada sai."""
    restante = {chave: valor for chave, valor in padrao.items() if global_.get(chave) != valor}
    return restante if len(restante) < len(padrao) else None


async def _tirar_sentinelas(conn: AsyncConnection) -> None:
    linhas = (await conn.execute(text("SELECT id, layout_youtube FROM cortes"))).fetchall()
    for corte_id, valor in linhas:
        layout = _como_dict(valor)
        novo = _sem_sentinela(layout) if layout is not None else None
        if novo is not None:
            await conn.execute(
                text("UPDATE cortes SET layout_youtube = :l WHERE id = :id"),
                {"l": json.dumps(novo, ensure_ascii=False), "id": corte_id},
            )


async def _soltar_copias_do_global(conn: AsyncConnection, global_padrao: Any) -> None:
    global_ = _como_dict(global_padrao)
    if not global_:
        return
    linhas = (await conn.execute(text("SELECT id, layout_youtube_padrao FROM projetos"))).fetchall()
    for projeto_id, valor in linhas:
        padrao = _como_dict(valor)
        novo = _sem_copia_do_global(padrao, global_) if padrao else None
        if novo is not None:
            await conn.execute(
                text("UPDATE projetos SET layout_youtube_padrao = :l WHERE id = :id"),
                {"l": json.dumps(novo, ensure_ascii=False), "id": projeto_id},
            )


def _global_salvo() -> str | None:
    # Import tardio: o Global mora no settings.db da instância, não neste banco.
    try:
        from app.services.app_settings import AppSettingsService

        return AppSettingsService.get().youtube_layout_padrao_global
    except Exception:  # noqa: BLE001 — sem o Global, só as cópias ficam para depois
        logger.warning("[D-966] Global ilegível; as cópias nos projetos ficam", exc_info=True)
        return None


async def _tabelas(conn: AsyncConnection) -> set[str]:
    resultado = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
    return {linha[0] for linha in resultado.fetchall()}


async def upgrade(conn: AsyncConnection, global_padrao: Any = None) -> None:
    tabelas = await _tabelas(conn)
    if "cortes" in tabelas:
        await _tirar_sentinelas(conn)
    if "projetos" in tabelas:
        global_ = global_padrao if global_padrao is not None else _global_salvo()
        await _soltar_copias_do_global(conn, global_)
