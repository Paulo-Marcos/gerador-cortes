"""D-447: montagem do material avaliado e a SÉRIE de avaliações do bruto."""

import json

import pytest
import pytest_asyncio
from app.domain.corte.avaliacao_bruto import AvaliacaoNormalizada
from app.models import Base, Corte, Projeto
from app.services import avaliacao_bruto as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def session_factory(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(servico, "AsyncSessionLocal", factory)
    yield factory
    await engine.dispose()


async def _seed_corte(factory, *, corte_id="c1", transcricao_final=None, desvios=None):
    async with factory() as db:
        if await db.get(Projeto, "proj-1") is None:
            db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id=corte_id,
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="Tema A",
                tema_central="Economia",
                inicio_seg=0.0,
                fim_seg=100.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                desvios=json.dumps(desvios or []),
                transcricao_final=json.dumps(
                    transcricao_final
                    if transcricao_final is not None
                    else [{"start": 0.0, "texto": "fala"}]
                ),
            )
        )
        await db.commit()


def _avaliacao(nota=4, veredito="coesa"):
    return AvaliacaoNormalizada(
        nota=nota,
        veredito=veredito,
        parecer="flui bem",
        apontamentos=[
            {"tipo": "repeticao", "gravidade": "leve", "momento": "00:10", "descricao": "x"}
        ],
    )


@pytest.mark.asyncio
async def test_contexto_marca_as_emendas_do_corte(session_factory):
    await _seed_corte(
        session_factory,
        transcricao_final=[
            {"start": 0.0, "texto": "antes"},
            {"start": 30.0, "texto": "depois"},
        ],
        desvios=[
            {
                "inicio_hms": "00:00:30.000",
                "fim_hms": "00:00:50.000",
                "inicio_seg": 30.0,
                "fim_seg": 50.0,
                "motivo": "papo com o chat",
            }
        ],
    )

    contexto = await servico.montar_contexto("c1")

    assert contexto.total_emendas == 1
    assert contexto.removido_seg == 20.0
    assert "EMENDA 1" in contexto.texto_avaliado
    assert contexto.titulo == "Tema A"


@pytest.mark.asyncio
async def test_corte_sem_transcricao_final_nao_vai_para_a_ia(session_factory):
    # Prompt vazio só produziria parecer inventado — melhor recusar antes.
    await _seed_corte(session_factory, transcricao_final=[])

    with pytest.raises(ValueError, match="transcrição final"):
        await servico.montar_contexto("c1")


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(session_factory):
    with pytest.raises(LookupError):
        await servico.montar_contexto("nao-existe")


@pytest.mark.asyncio
async def test_desvios_corrompidos_nao_derrubam_a_montagem(session_factory):
    await _seed_corte(session_factory)
    async with session_factory() as db:
        corte = await db.get(Corte, "c1")
        corte.desvios = "{isso não é json}"
        await db.commit()

    contexto = await servico.montar_contexto("c1")

    assert contexto.total_emendas == 0


@pytest.mark.asyncio
async def test_cada_geracao_vira_uma_linha_nova(session_factory):
    await _seed_corte(session_factory)
    contexto = await servico.montar_contexto("c1")

    await servico.registrar_avaliacao(contexto, _avaliacao(nota=2, veredito="quebrada"))
    await servico.registrar_avaliacao(contexto, _avaliacao(nota=5, veredito="coesa"))

    serie = await servico.historico("c1")
    assert [a["nota"] for a in serie] == [5, 2]
    assert (await servico.ultima_avaliacao("c1"))["veredito"] == "coesa"


@pytest.mark.asyncio
async def test_corte_nunca_avaliado_devolve_none(session_factory):
    await _seed_corte(session_factory)

    assert await servico.ultima_avaliacao("c1") is None


@pytest.mark.asyncio
async def test_apontamento_sai_com_rotulo_pronto_para_a_ui(session_factory):
    await _seed_corte(session_factory)
    contexto = await servico.montar_contexto("c1")
    await servico.registrar_avaliacao(contexto, _avaliacao())

    avaliacao = await servico.ultima_avaliacao("c1")

    assert avaliacao["apontamentos"][0]["rotulo"] == "Repetição que sobrou"


@pytest.mark.asyncio
async def test_visao_do_projeto_traz_so_a_ultima_de_cada_corte(session_factory):
    await _seed_corte(session_factory, corte_id="c1")
    await _seed_corte(session_factory, corte_id="c2")

    ctx1 = await servico.montar_contexto("c1")
    await servico.registrar_avaliacao(ctx1, _avaliacao(nota=1))
    await servico.registrar_avaliacao(ctx1, _avaliacao(nota=4))
    await servico.registrar_avaliacao(await servico.montar_contexto("c2"), _avaliacao(nota=3))

    do_projeto = await servico.avaliacoes_do_projeto("proj-1")

    assert len(do_projeto) == 2
    assert {a["corte_id"]: a["nota"] for a in do_projeto} == {"c1": 4, "c2": 3}
