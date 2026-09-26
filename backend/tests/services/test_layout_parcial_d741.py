"""O corte com layout parcial continua parcial depois de editado (D-741).

RN-10 e ADR-0013: a chave ausente é o que faz o corte herdar do projeto e do
global. Os três caminhos que gravam o layout — o PATCH do corte, juntar dois
cortes e decidir um segmento detectado — normalizavam o layout INTEIRO antes de
gravar, preenchendo fundo, placa e recortes com os defaults: o corte deixava de
acompanhar o padrão. Nenhum teste pegava, porque todos semeavam o corte já com o
layout completo.
"""

import json

import pytest
import pytest_asyncio
from app.domain.corte.youtube_layout import mesclar_no_layout_do_corte, normalizar_layout_youtube
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services import deteccao_segmentos
from app.services.corte import AtualizarCorteDTO, CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

PARCIAL = {"modo_padrao": "full", "regioes": []}
REGIAO = {"inicio": 1.0, "fim": 5.0, "modo": "compartilhada"}


# ─── A mescla, no domínio ────────────────────────────────────────────────────


def test_a_chave_enviada_entra_normalizada_e_as_outras_ficam_ausentes():
    resultado = mesclar_no_layout_do_corte(PARCIAL, {"regioes": [REGIAO, "lixo"]})

    assert set(resultado) == {"modo_padrao", "regioes"}
    assert resultado["regioes"] == normalizar_layout_youtube({"regioes": [REGIAO]})["regioes"]


def test_none_volta_a_herdar_e_chave_desconhecida_nao_entra():
    resultado = mesclar_no_layout_do_corte(
        {**PARCIAL, "fundo": "papel"}, {"fundo": None, "inventada": 1}
    )

    assert resultado == PARCIAL


def test_layout_gravado_ilegivel_vale_como_vazio():
    assert mesclar_no_layout_do_corte("{quebrado", {"regioes": []}) == {"regioes": []}


# ─── Os três caminhos que gravam ─────────────────────────────────────────────


@pytest_asyncio.fixture
async def fabrica(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    for modulo in (corte_module, deteccao_segmentos):
        monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    monkeypatch.setattr(corte_module, "projetos_dir", lambda: tmp_path)

    async def sem_resync(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(sem_resync))
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        await db.commit()
    yield f
    await engine.dispose()


async def _semear(fabrica, corte_id, numero, inicio, fim, layout, **campos):
    async with fabrica() as db:
        db.add(
            Corte(
                id=corte_id,
                projeto_id="p1",
                numero=numero,
                inicio_seg=inicio,
                fim_seg=fim,
                layout_youtube=json.dumps(layout),
                **campos,
            )
        )
        await db.commit()


async def _layout(fabrica, corte_id) -> dict:
    async with fabrica() as db:
        return json.loads((await db.get(Corte, corte_id)).layout_youtube)


@pytest.mark.asyncio
async def test_patch_que_adiciona_regiao_mantem_o_corte_herdando(fabrica):
    await _semear(fabrica, "c1", 1, 0.0, 60.0, PARCIAL)

    async with fabrica() as db:
        await CorteService.atualizar(
            db, "c1", AtualizarCorteDTO(layout_youtube={"regioes": [REGIAO]})
        )

    layout = await _layout(fabrica, "c1")
    assert set(layout) == {"modo_padrao", "regioes"}
    assert [r["modo"] for r in layout["regioes"]] == ["compartilhada"]


@pytest.mark.asyncio
async def test_juntar_cortes_leva_as_regioes_sem_materializar_o_resto(fabrica):
    await _semear(fabrica, "c1", 1, 0.0, 60.0, PARCIAL)
    await _semear(fabrica, "c2", 2, 60.0, 120.0, {"regioes": [REGIAO]})

    await CorteService.juntar_cortes("c1", "c2")

    layout = await _layout(fabrica, "c1")
    assert set(layout) == {"modo_padrao", "regioes"}
    assert [r["inicio"] for r in layout["regioes"]] == [61.0]


@pytest.mark.asyncio
async def test_decidir_segmento_acrescenta_a_regiao_sem_materializar_o_resto(fabrica):
    segmentos = [{"inicio": 10.0, "fim": 20.0, "status": "pendente"}]
    await _semear(fabrica, "c1", 1, 0.0, 60.0, PARCIAL, segmentos_detectados=json.dumps(segmentos))

    await deteccao_segmentos.decidir_segmento("c1", 0, "full")

    layout = await _layout(fabrica, "c1")
    assert set(layout) == {"modo_padrao", "regioes"}
    assert [(r["inicio"], r["modo"]) for r in layout["regioes"]] == [(10.0, "full")]
