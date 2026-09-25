"""D-459: a decisão do operador sobre um candidato a short.

Duas regras carregam esta demanda:

  - a curadoria atribui `aprovado`/`rejeitado`/`sugerido`, nunca `renderizado`
    — esse é carimbo do render, quando o MP4 existe em disco;
  - as bordas são validadas contra o BRUTO, não contra a faixa de duração da
    skill. A faixa disciplina a IA; o humano que assistiu ao trecho tem o
    direito de discordar dela. O que ele não pode é apontar para fora do
    arquivo.
"""

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", sessions)

    async with sessions() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=300.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:05:00.000",
                duracao_clip_seg=300.0,
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                titulo_sugerido="candidato",
                inicio_seg=30.0,
                fim_seg=70.0,
                score=8.0,
            )
        )
        await db.commit()

    yield sessions
    await engine.dispose()


@pytest.mark.asyncio
async def test_aprovar_muda_o_status(factory):
    short = await servico.atualizar_short(
        "s1", servico.AtualizarShortDTO(status=StatusShort.APROVADO.value)
    )

    assert short["status"] == "aprovado"


@pytest.mark.asyncio
async def test_rejeitar_nao_apaga_o_candidato(factory):
    """Rejeitado fica no historico — o operador pode mudar de ideia."""
    await servico.atualizar_short(
        "s1", servico.AtualizarShortDTO(status=StatusShort.REJEITADO.value)
    )

    assert [s["id"] for s in await servico.listar_shorts("c1")] == ["s1"]


@pytest.mark.asyncio
async def test_curadoria_nao_carimba_renderizado(factory):
    with pytest.raises(ValueError, match="curadoria"):
        await servico.atualizar_short(
            "s1", servico.AtualizarShortDTO(status=StatusShort.RENDERIZADO.value)
        )


@pytest.mark.asyncio
async def test_status_inventado_e_recusado(factory):
    with pytest.raises(ValueError):
        await servico.atualizar_short("s1", servico.AtualizarShortDTO(status="genial"))


@pytest.mark.asyncio
async def test_ajustar_bordas_dentro_do_bruto(factory):
    short = await servico.atualizar_short(
        "s1", servico.AtualizarShortDTO(inicio_seg=25.5, fim_seg=95.25)
    )

    assert (short["inicio_seg"], short["fim_seg"]) == (25.5, 95.25)
    assert short["duracao_seg"] == 69.75


@pytest.mark.asyncio
async def test_mover_so_uma_borda_preserva_a_outra(factory):
    short = await servico.atualizar_short("s1", servico.AtualizarShortDTO(inicio_seg=10.0))

    assert (short["inicio_seg"], short["fim_seg"]) == (10.0, 70.0)


@pytest.mark.asyncio
async def test_operador_pode_sair_da_faixa_de_duracao_da_skill(factory):
    """8 segundos esta fora do minimo da IA — e a decisao e do humano."""
    short = await servico.atualizar_short(
        "s1", servico.AtualizarShortDTO(inicio_seg=30.0, fim_seg=38.0)
    )

    assert short["duracao_seg"] == 8.0


@pytest.mark.asyncio
async def test_borda_alem_do_bruto_e_recusada(factory):
    with pytest.raises(ValueError, match="duracao do bruto"):
        await servico.atualizar_short("s1", servico.AtualizarShortDTO(fim_seg=400.0))


@pytest.mark.asyncio
async def test_intervalo_invertido_e_recusado(factory):
    with pytest.raises(ValueError, match="depois do inicio"):
        await servico.atualizar_short(
            "s1", servico.AtualizarShortDTO(inicio_seg=80.0, fim_seg=40.0)
        )


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup(factory):
    with pytest.raises(LookupError):
        await servico.atualizar_short("nao-existe", servico.AtualizarShortDTO(status="aprovado"))
