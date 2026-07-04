"""Migration 001 — baseline.

Carimba o schema existente como versão ``1`` SEM alterar dados nem estrutura.
O schema base (tabelas + colunas incrementais) já é garantido por
``Base.metadata.create_all`` e pelo bloco de ALTERs idempotentes em
``database.init_db``; esta baseline apenas estabelece o ponto de partida do
versionamento, de modo que um banco já existente suba sem perda de dados.

A versão é carimbada pelo runner (``aplicar_migrations``) após este ``upgrade``;
por isso aqui não há nenhum ``PRAGMA user_version``.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncConnection


async def upgrade(conn: AsyncConnection) -> None:
    # Baseline: nenhuma alteração de schema (a assinatura segue o contrato de
    # migration; o parâmetro `conn` existe para uniformidade com migrations reais).
    return None
