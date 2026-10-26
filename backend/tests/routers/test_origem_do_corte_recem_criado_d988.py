"""O corte recém-gravado sai sem origem, sem ir ao banco (D-988).

Criar manual e dividir devolvem o corte que acabaram de gravar, sem reler. A
relação `snapshot` desse objeto nunca foi carregada; lê-la ali dispararia um
lazy load fora do contexto assíncrono (MissingGreenlet → 500). Pego na auditoria.
"""

from __future__ import annotations

import pytest
from app.models import Base, Corte, Projeto
from app.routers.cortes_helpers import _corte_to_dict
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest.mark.asyncio
async def test_corte_recem_criado_sai_sem_origem_sem_ir_ao_banco():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    fabrica = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with fabrica() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        novo = Corte(id="c9", projeto_id="p1", numero=9, inicio_seg=0.0, fim_seg=60.0)
        db.add(novo)
        await db.commit()
        assert _corte_to_dict(novo)["origem_analise"] is None
    await engine.dispose()
