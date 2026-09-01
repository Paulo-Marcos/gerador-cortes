"""D-458: a lista de Fires que abre a tela de Shorts.

O filtro que importa e o de DISCO. Um corte Fire cujo bruto ja foi descartado
nao tem de onde recortar short — lista-lo so daria ao operador um item que
frustra quando ele clica. E a checagem precisa ser no ARQUIVO, nao no ponteiro:
o `arquivo_clip_path` pode continuar preenchido depois de alguem apagar a pasta
por fora do app.
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, MetadadoCorte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths

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

    yield factory, tmp_path
    await engine.dispose()


def _criar_bruto(raiz, corte_id: str) -> str:
    corte_dir = raiz / "p1" / "cortes" / corte_id
    corte_dir.mkdir(parents=True, exist_ok=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * (3 * 1024 * 1024))
    return f"cortes/{corte_id}/clip_raw_1.mkv"


async def _semear(
    factory, *, corte_id: str, fire: bool, clip_path: str = "", numero: int = 1
) -> None:
    async with factory() as db:
        if await db.get(Projeto, "p1") is None:
            db.add(Projeto(id="p1", youtube_url="u", titulo_live="Live de terca"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="p1",
                numero=numero,
                titulo_proposto=f"Corte {numero}",
                tema_central="Economia",
                duracao_clip_seg=180.0,
                arquivo_clip_path=clip_path,
            )
        )
        db.add(MetadadoCorte(id=f"m-{corte_id}", corte_id=corte_id, is_fire=fire))
        await db.commit()


@pytest.mark.asyncio
async def test_lista_o_fire_que_tem_bruto_em_disco(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))

    fires = await servico.listar_fires_com_bruto()

    assert len(fires) == 1
    assert fires[0]["corte_id"] == "c1"
    assert fires[0]["projeto_titulo"] == "Live de terca"
    assert fires[0]["bruto_mb"] == 3.1
    assert fires[0]["shorts"]["total"] == 0


@pytest.mark.asyncio
async def test_corte_comum_nao_entra_na_lista(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=False, clip_path=_criar_bruto(raiz, "c1"))

    assert await servico.listar_fires_com_bruto() == []


@pytest.mark.asyncio
async def test_fire_sem_bruto_no_disco_fica_de_fora(ambiente):
    """Ponteiro preenchido nao basta: o arquivo pode ter sumido por fora do app."""
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path="cortes/c1/clip_raw_1.mkv")

    assert await servico.listar_fires_com_bruto() == []


@pytest.mark.asyncio
async def test_fire_sem_ponteiro_de_bruto_fica_de_fora(ambiente):
    factory, _ = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path="")

    assert await servico.listar_fires_com_bruto() == []


@pytest.mark.asyncio
async def test_contagem_de_shorts_vem_por_status(ambiente):
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))
    async with factory() as db:
        db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.SUGERIDO))
        db.add(Short(id="s2", corte_id="c1", numero=2, status=StatusShort.SUGERIDO))
        db.add(Short(id="s3", corte_id="c1", numero=3, status=StatusShort.APROVADO))
        await db.commit()

    fires = await servico.listar_fires_com_bruto()

    assert fires[0]["shorts"]["total"] == 3
    assert fires[0]["shorts"]["sugerido"] == 2
    assert fires[0]["shorts"]["aprovado"] == 1
    assert fires[0]["shorts"]["renderizado"] == 0


@pytest.mark.asyncio
async def test_contagem_nao_vaza_entre_cortes(ambiente):
    """Uma consulta agrupada serve a lista inteira; o agrupamento tem de separar."""
    factory, raiz = ambiente
    await _semear(factory, corte_id="c1", fire=True, clip_path=_criar_bruto(raiz, "c1"))
    await _semear(factory, corte_id="c2", fire=True, clip_path=_criar_bruto(raiz, "c2"), numero=2)
    async with factory() as db:
        db.add(Short(id="s1", corte_id="c1", numero=1, status=StatusShort.SUGERIDO))
        await db.commit()

    por_corte = {
        f["corte_id"]: f["shorts"]["total"] for f in await servico.listar_fires_com_bruto()
    }

    assert por_corte == {"c1": 1, "c2": 0}
