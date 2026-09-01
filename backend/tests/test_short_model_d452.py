"""D-452: modelos de Short reativados sobre as tabelas que a D-345 deixou órfãs.

Três invariantes sustentam a reativação:

  - banco NOVO recebe `shorts`/`metadados_shorts` por `create_all`, e a navegação
    `corte.shorts` funciona nos dois sentidos;
  - apagar o corte apaga seus shorts (cascade) — comportamento NOVO, então fica
    travado por teste;
  - banco ANTIGO, com as tabelas órfãs no formato de julho e registros dentro,
    ganha as colunas novas pela reconciliação da D-403 **sem perder linha**.
    É o caso real de PROD: 6 registros sobreviveram à remoção.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from app.migrations import reconciliacao
from app.models import (
    Base,
    Corte,
    MetadadoShort,
    Projeto,
    Short,
    StatusProjeto,
    StatusShort,
)
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Formato das tabelas como estavam no commit da D-345 (b25934b): sem `gancho`,
# `score` nem `justificativa`. É o que existe nos bancos de PROD hoje.
_SHORTS_FORMATO_ANTIGO = """
    CREATE TABLE shorts (
        id VARCHAR(36) PRIMARY KEY,
        corte_id VARCHAR(36),
        numero INTEGER,
        titulo_sugerido VARCHAR(500) DEFAULT '',
        inicio_seg FLOAT DEFAULT 0.0,
        fim_seg FLOAT DEFAULT 0.0,
        cenas_remotion TEXT DEFAULT '[]',
        desvios TEXT DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'sugerido',
        arquivo_short_path VARCHAR(1000) DEFAULT '',
        criado_em DATETIME,
        atualizado_em DATETIME
    )
"""


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _semear_corte(db: AsyncSession) -> str:
    projeto = Projeto(id="proj-1", youtube_url="https://y.tube/x", status=StatusProjeto.PRONTO)
    corte = Corte(id="corte-1", projeto_id="proj-1", numero=1)
    db.add_all([projeto, corte])
    await db.commit()
    return corte.id


@pytest.mark.asyncio
async def test_short_nasce_ligado_ao_corte_com_metadado(session_factory):
    """Caminho feliz: short sugerido com metadado, navegável a partir do corte."""
    async with session_factory() as db:
        corte_id = await _semear_corte(db)
        db.add(
            Short(
                id="short-1",
                corte_id=corte_id,
                numero=1,
                titulo_sugerido="O erro que todo mundo comete",
                gancho="Ninguém te conta isso sobre juros",
                score=8.5,
                justificativa="Trecho auto-contido, tensão nos 3 primeiros segundos.",
                inicio_seg=12.0,
                fim_seg=57.5,
                metadado=MetadadoShort(id="meta-1", short_id="short-1"),
            )
        )
        await db.commit()

    async with session_factory() as db:
        corte = await db.get(Corte, "corte-1")
        # Carga explicita: a relacao entra com `lazy` default de proposito, entao
        # tocar `corte.shorts` sem pedir levantaria MissingGreenlet no async.
        await db.refresh(corte, ["shorts"])

        assert [s.id for s in corte.shorts] == ["short-1"]
        short = corte.shorts[0]
        assert short.status == StatusShort.SUGERIDO
        assert short.score == 8.5
        assert short.gancho.startswith("Ninguém")
        assert short.metadado.short_id == "short-1"
        assert short.arquivo_short_path == ""


@pytest.mark.asyncio
async def test_apagar_o_corte_apaga_seus_shorts(session_factory):
    """Cascade: o short não sobrevive ao corte que o originou."""
    async with session_factory() as db:
        corte_id = await _semear_corte(db)
        db.add(Short(id="short-1", corte_id=corte_id, numero=1))
        await db.commit()

    async with session_factory() as db:
        corte = await db.get(Corte, "corte-1")
        await db.refresh(corte, ["shorts"])
        await db.delete(corte)
        await db.commit()

    async with session_factory() as db:
        assert (await db.scalars(select(Short))).all() == []


@pytest.mark.asyncio
async def test_tabela_orfa_antiga_ganha_as_colunas_novas_sem_perder_registro(engine):
    """O caso de PROD: tabela no formato de julho, com dados, reconciliada no boot."""
    async with engine.begin() as conn:
        await conn.execute(text(_SHORTS_FORMATO_ANTIGO))
        await conn.execute(
            text(
                "INSERT INTO shorts (id, corte_id, numero, titulo_sugerido, status) "
                "VALUES ('legado-1', 'corte-antigo', 1, 'Short de julho', 'sugerido')"
            )
        )

    async with engine.begin() as conn:
        reparos = await reconciliacao.reconciliar_schema(conn)

    assert set(reparos.get("shorts", [])) >= {"gancho", "score", "justificativa"}

    async with engine.begin() as conn:
        linha = (
            await conn.execute(
                text("SELECT titulo_sugerido, gancho, score FROM shorts WHERE id = 'legado-1'")
            )
        ).first()

    assert linha[0] == "Short de julho"
    assert linha[1] == ""
    assert linha[2] == 0.0
