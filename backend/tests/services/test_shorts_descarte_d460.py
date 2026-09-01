"""D-460: o descarte do bruto pela tela de Shorts.

É o outro lado da retenção que a D-456 criou: o bruto do Fire fica guardado por
padrão, e este é o caminho para devolver o disco quando o trabalho acabou.

A regra que mais importa é a do ponteiro: `arquivo_clip_path` só é zerado se o
arquivo realmente saiu. Com o bruto travado pelo player o `unlink` falha, e
mentir no banco esconderia disco ainda ocupado — a lista de Fires passaria a
omitir um corte cujo arquivo continua lá.
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import media_retention as retention_module
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    monkeypatch.setattr(retention_module, "projetos_dir", lambda: tmp_path)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)

    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True)
    bruto = corte_dir / "clip_raw_1.mkv"
    bruto.write_bytes(b"x" * (2 * 1024 * 1024))
    graded = corte_dir / "graded" / "clip_graded.mp4"
    graded.parent.mkdir()
    graded.write_bytes(b"y" * 1024)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=100.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                arquivo_clip_path="cortes/c1/clip_raw_1.mkv",
            )
        )
        await db.commit()

    yield factory, bruto, graded
    await engine.dispose()


@pytest.mark.asyncio
async def test_descarte_libera_o_bruto_e_zera_o_ponteiro(ambiente):
    factory, bruto, _ = ambiente

    resultado = await servico.descartar_bruto("c1")

    assert not bruto.exists()
    assert resultado["liberado_mb"] > 0
    async with factory() as db:
        assert (await db.get(Corte, "c1")).arquivo_clip_path == ""


@pytest.mark.asyncio
async def test_descarte_nao_leva_o_resto_da_pasta(ambiente):
    """É descarte PONTUAL do bruto, não limpeza do corte."""
    _, _, graded = ambiente

    await servico.descartar_bruto("c1")

    assert graded.exists()


@pytest.mark.asyncio
async def test_corte_sem_bruto_no_disco_nao_quebra(ambiente):
    factory, bruto, _ = ambiente
    bruto.unlink()

    resultado = await servico.descartar_bruto("c1")

    assert resultado["liberado_mb"] == 0
    assert resultado["erros"] == []


@pytest.mark.asyncio
async def test_falha_ao_remover_preserva_o_ponteiro(ambiente, monkeypatch):
    """Bruto travado pelo player: o banco não pode dizer que o arquivo sumiu."""
    factory, bruto, _ = ambiente

    def _travado(self, *args, **kwargs):
        raise PermissionError("arquivo em uso")

    monkeypatch.setattr("pathlib.Path.unlink", _travado)

    resultado = await servico.descartar_bruto("c1")

    assert resultado["erros"]
    assert bruto.exists()
    async with factory() as db:
        assert (await db.get(Corte, "c1")).arquivo_clip_path == "cortes/c1/clip_raw_1.mkv"


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(ambiente):
    with pytest.raises(LookupError):
        await servico.descartar_bruto("nao-existe")
