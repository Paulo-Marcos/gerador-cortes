"""A migration 008 reconhece todos os apelidos de FULL (auditoria do PR #234, D-966).

`_normalizar_modo` lê "default" como full. Sem ele na lista da migration, a
sentinela `{"modo_padrao": "default"}` — que a leitura antiga fazia herdar —
ficava gravada e passava a valer como FULL escolhido.
"""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def conn():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conexao:
        await conexao.execute(text("CREATE TABLE cortes (id TEXT, layout_youtube TEXT)"))
        yield conexao
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("apelido", ["default", "padrao", "tela_cheia", "FULL"])
async def test_apelido_de_full_na_sentinela_sai_e_o_corte_herda(conn, apelido):
    from app.migrations import migration_008_modo_do_corte_e_global_vivo as migration

    await conn.execute(
        text("INSERT INTO cortes (id, layout_youtube) VALUES ('c1', :l)"),
        {"l": json.dumps({"modo_padrao": apelido, "regioes": []})},
    )

    await migration.upgrade(conn, global_padrao="{}")

    gravado = (await conn.execute(text("SELECT layout_youtube FROM cortes"))).scalar_one()
    assert json.loads(gravado) == {"regioes": []}
