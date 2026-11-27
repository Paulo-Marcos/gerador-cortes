"""D-1170: a capa 9:16 que a linha da lista de Shorts mostra.

A escolha: a capa do primeiro short pronto; sem ela, a capa VERTICAL do corte;
sem as duas, nada. A 16:9 do YouTube nunca entra (D-522).
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, MetadadoShort, Projeto, Short, StatusShort
from app.routers.fabrica_schemas import FiresResponse
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

CAPA_DO_CORTE = "thumbnails/capa_tiktok_c1.png"
CAPA_16_9 = "thumbnails/youtube_c1.jpg"


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app.core import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u", titulo_live="Live de terca"))
        db.add(Corte(id="c1", projeto_id="p1", numero=1, is_fire=True))
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


def _arquivo(raiz, relativo: str) -> str:
    caminho = raiz / "p1" / relativo
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"jpg")
    return relativo


async def _capas_do_corte(factory, *, vertical: str = "", deitada: str = "") -> None:
    async with factory() as db:
        db.add(
            MetadadoCorte(
                id="m1", corte_id="c1", thumbnail_tiktok_path=vertical, thumbnail_path=deitada
            )
        )
        await db.commit()


async def _short(
    factory, numero: int, *, capa: str = "", status: str = StatusShort.RENDERIZADO
) -> None:
    async with factory() as db:
        db.add(
            Short(
                id=f"s{numero}",
                corte_id="c1",
                numero=numero,
                inicio_seg=0.0,
                fim_seg=30.0,
                status=status,
            )
        )
        db.add(MetadadoShort(id=f"ms{numero}", short_id=f"s{numero}", capa_path=capa))
        await db.commit()


async def _capa_do_fire() -> str:
    return (await servico.listar_fires_com_bruto())[0]["capa_path"]


@pytest.mark.asyncio
async def test_a_capa_do_primeiro_short_pronto_vence_a_do_corte(ambiente):
    factory, raiz = ambiente
    await _capas_do_corte(factory, vertical=_arquivo(raiz, CAPA_DO_CORTE))
    # Gravados fora de ordem: quem manda e o NUMERO, nao a ordem de insercao.
    await _short(factory, 3, capa=_arquivo(raiz, "shorts/s3/capa.jpg"))
    await _short(factory, 2, capa=_arquivo(raiz, "shorts/s2/capa.jpg"))
    await _short(factory, 1, capa=_arquivo(raiz, "shorts/s1/capa.jpg"), status=StatusShort.APROVADO)

    assert await _capa_do_fire() == "shorts/s2/capa.jpg"


@pytest.mark.asyncio
async def test_short_pronto_sem_capa_em_disco_passa_a_vez_ao_seguinte(ambiente):
    factory, raiz = ambiente
    await _short(factory, 1)
    await _short(factory, 2, capa="shorts/s2/sumiu.jpg")
    await _short(factory, 3, capa=_arquivo(raiz, "shorts/s3/capa.jpg"))

    assert await _capa_do_fire() == "shorts/s3/capa.jpg"


@pytest.mark.asyncio
async def test_sem_short_pronto_vale_a_capa_vertical_do_corte(ambiente):
    factory, raiz = ambiente
    await _capas_do_corte(factory, vertical=_arquivo(raiz, CAPA_DO_CORTE))
    await _short(factory, 1, capa=_arquivo(raiz, "shorts/s1/capa.jpg"), status=StatusShort.SUGERIDO)

    assert await _capa_do_fire() == CAPA_DO_CORTE


@pytest.mark.asyncio
async def test_sem_nada_a_capa_vem_vazia_e_a_16_9_nao_entra(ambiente):
    factory, raiz = ambiente
    await _capas_do_corte(factory, deitada=_arquivo(raiz, CAPA_16_9))

    assert await _capa_do_fire() == ""


@pytest.mark.asyncio
async def test_capa_do_corte_que_sumiu_do_disco_nao_e_oferecida(ambiente):
    factory, _ = ambiente
    await _capas_do_corte(factory, vertical=CAPA_DO_CORTE)

    assert await _capa_do_fire() == ""


@pytest.mark.asyncio
async def test_o_contrato_do_fire_leva_a_capa(ambiente):
    factory, raiz = ambiente
    await _capas_do_corte(factory, vertical=_arquivo(raiz, CAPA_DO_CORTE))

    resposta = FiresResponse.model_validate({"fires": await servico.listar_fires_com_bruto()})

    assert resposta.model_dump()["fires"][0]["capa_path"] == CAPA_DO_CORTE
