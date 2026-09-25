"""Cada campo que o PATCH do corte grava (D-716).

Teste de caracterização, antes de fatiar `CorteService.atualizar` (complexidade
29). A suíte cobria o título, o status, os desvios e as cenas que mudam, e
deixava 13 ramos sem teste — as bordas em HMS, o arranjo de blocos que acompanha
a borda, os campos da leitura, o offset do áudio, a cena fora do corte e o
layout. Os valores derivados são conferidos contra as MESMAS funções do domínio:
o teste prende que o service as aplica, não a regra delas.
"""

import json

import pytest
import pytest_asyncio
from app.domain.corte import arranjo_blocos
from app.domain.corte.youtube_layout import normalizar_layout_youtube
from app.models import Base, Corte, Projeto
from app.services import corte as corte_module
from app.services.corte import AtualizarCorteDTO, CorteService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

atualizar = CorteService.atualizar

_ARRANJO_INVERTIDO = [{"inicio_seg": 60.0, "fim_seg": 100.0}, {"inicio_seg": 0.0, "fim_seg": 60.0}]


@pytest_asyncio.fixture
async def fabrica(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(corte_module, "AsyncSessionLocal", f)

    async def _sem_resync(corte_id, db=None):
        return None

    monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(_sem_resync))
    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=100.0,
                status="proposto",
                cenas_validadas=1,
                arranjo_blocos=json.dumps(_ARRANJO_INVERTIDO),
                layout_youtube=json.dumps(normalizar_layout_youtube({}), ensure_ascii=False),
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


async def _patch(fabrica, **campos) -> Corte:
    async with fabrica() as db:
        return await atualizar(db, "c1", AtualizarCorteDTO(**campos))


async def _corte(fabrica) -> Corte:
    async with fabrica() as db:
        return await db.get(Corte, "c1")


# ─── Bordas e arranjo ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bordas_em_hms_gravam_como_vieram(fabrica):
    await _patch(fabrica, inicio_hms="00:00:05.000", fim_hms="00:01:30.000")

    corte = await _corte(fabrica)
    assert (corte.inicio_hms, corte.fim_hms) == ("00:00:05.000", "00:01:30.000")


@pytest.mark.asyncio
async def test_mexer_na_borda_reencaixa_o_arranjo_mantendo_a_ordem(fabrica):
    await _patch(fabrica, fim_seg=80.0)

    esperado = arranjo_blocos.serializar(
        arranjo_blocos.reconciliar(arranjo_blocos.parse(_ARRANJO_INVERTIDO), 0.0, 80.0)
    )
    assert json.loads((await _corte(fabrica)).arranjo_blocos) == esperado
    assert esperado[0]["inicio_seg"] == 60.0


@pytest.mark.asyncio
async def test_mexer_fora_da_borda_nao_toca_o_arranjo(fabrica):
    await _patch(fabrica, titulo_proposto="T")

    assert json.loads((await _corte(fabrica)).arranjo_blocos) == _ARRANJO_INVERTIDO


# ─── Leitura, transcrição, dica da capa e áudio ──────────────────────────────


@pytest.mark.asyncio
async def test_campos_de_texto_gravam_aparados(fabrica):
    await _patch(
        fabrica,
        autor_leitura="  Machado  ",
        hints_thumbnail="  rosto à esquerda  ",
        transcricao_corte=[{"texto": "ação"}],
    )

    corte = await _corte(fabrica)
    assert (corte.autor_leitura, corte.hints_thumbnail) == ("Machado", "rosto à esquerda")
    assert corte.transcricao_corte == '[{"texto": "ação"}]'


@pytest.mark.parametrize(("parte", "gravada"), [(0, 1), (-3, 1), (4, 4)])
@pytest.mark.asyncio
async def test_a_parte_da_leitura_comeca_em_um(fabrica, parte, gravada):
    await _patch(fabrica, parte_leitura=parte)

    assert (await _corte(fabrica)).parte_leitura == gravada


@pytest.mark.parametrize(
    ("offset", "gravado"), [(250, 250), (-99_999, -10_000), (99_999, 10_000), (12.9, 12)]
)
@pytest.mark.asyncio
async def test_o_offset_do_audio_fica_entre_menos_e_mais_dez_segundos(fabrica, offset, gravado):
    await _patch(fabrica, audio_offset_ms=offset)

    assert (await _corte(fabrica)).audio_offset_ms == gravado


# ─── Cenas e layout ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cena_fora_do_corte_e_recusada_com_o_exemplo(fabrica):
    cenas = [
        {"tipo": "barra_inferior", "inicio": 1.0, "fim": 4.0},
        {"tipo": "barra_inferior", "inicio": 2300.0, "fim": 2305.0},
    ]

    with pytest.raises(ValueError, match=r"1 cena\(s\) com tempo fora do corte.*cena 1 em 2300"):
        await _patch(fabrica, cenas_remotion=cenas)

    assert (await _corte(fabrica)).cenas_validadas == 1


@pytest.mark.asyncio
async def test_o_layout_grava_normalizado_e_so_invalida_a_marca_quando_muda(fabrica):
    await _patch(fabrica, layout_youtube={})
    assert (await _corte(fabrica)).cenas_validadas == 1

    novo = {"modo_padrao": "compartilhada", "regioes": []}
    await _patch(fabrica, layout_youtube=novo)

    corte = await _corte(fabrica)
    assert corte.layout_youtube == json.dumps(normalizar_layout_youtube(novo), ensure_ascii=False)
    assert (corte.cenas_validadas, corte.cenas_validadas_em) == (0, None)
