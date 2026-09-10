"""D-454: montagem do material do prompt e persistência dos candidatos.

O teste mais importante deste arquivo é o do INSUMO: o contexto tem de sair da
`transcricao_final` (timeline do bruto), nunca da `transcricao_raw` (timeline da
live). Trocar a fonte num refactor futuro não quebraria nada visível — só
produziria shorts recortados no lugar errado, meses depois.
"""

import json

import pytest
import pytest_asyncio
from app.domain.shorts import ResultadoSugestoes, SugestaoShort
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy import select
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


async def _seed_corte(factory, *, transcricao_final=None, duracao_clip_seg=120.0):
    async with factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="O erro dos juros",
                tema_central="Economia",
                inicio_seg=600.0,
                fim_seg=900.0,
                inicio_hms="00:10:00.000",
                fim_hms="00:15:00.000",
                duracao_clip_seg=duracao_clip_seg,
                transcricao_final=json.dumps(
                    transcricao_final
                    if transcricao_final is not None
                    else [
                        {"start": 0.0, "texto": "abertura"},
                        {"start": 65.0, "end": 120.0, "texto": "remate"},
                    ]
                ),
            )
        )
        await db.commit()


def _sugestao(titulo: str, inicio: float, fim: float, score: float = 8.0) -> SugestaoShort:
    return SugestaoShort(
        titulo=titulo,
        gancho=f"gancho de {titulo}",
        inicio_seg=inicio,
        fim_seg=fim,
        score=score,
        justificativa="fecha sozinho",
    )


@pytest.mark.asyncio
async def test_contexto_sai_da_transcricao_do_bruto_nao_da_live(session_factory):
    """O corte comeca aos 10min da live, mas o bruto comeca no zero."""
    await _seed_corte(session_factory)

    contexto = await servico.montar_contexto("c1")

    assert contexto.texto_transcricao == "[00:00] abertura\n[01:05] remate"
    assert contexto.duracao_seg == 120.0
    assert contexto.titulo == "O erro dos juros"
    assert contexto.projeto_id == "proj-1"


@pytest.mark.asyncio
async def test_sem_transcricao_final_recusa_em_vez_de_inventar(session_factory):
    await _seed_corte(session_factory, transcricao_final=[])

    with pytest.raises(ValueError, match="gere o bruto"):
        await servico.montar_contexto("c1")


@pytest.mark.asyncio
async def test_corte_inexistente_levanta_lookup(session_factory):
    with pytest.raises(LookupError):
        await servico.montar_contexto("nao-existe")


@pytest.mark.asyncio
async def test_duracao_cai_para_a_transcricao_quando_o_probe_falhou(session_factory):
    """`duracao_clip_seg` zerada e o sintoma da D-369 em corte antigo."""
    await _seed_corte(session_factory, duracao_clip_seg=0.0)

    contexto = await servico.montar_contexto("c1")

    assert contexto.duracao_seg == 120.0


@pytest.mark.asyncio
async def test_registrar_grava_os_candidatos_ordenados(session_factory):
    await _seed_corte(session_factory)
    contexto = await servico.montar_contexto("c1")

    gravados = await servico.registrar_sugestoes(
        contexto,
        ResultadoSugestoes(
            sugestoes=[_sugestao("forte", 0.0, 40.0, 9.0), _sugestao("medio", 50.0, 90.0, 6.0)],
            descartes=["algum: sobrepõe um candidato de nota maior"],
        ),
    )

    assert [s["titulo"] for s in gravados] == ["forte", "medio"]
    assert [s["numero"] for s in gravados] == [1, 2]
    assert gravados[0]["duracao_seg"] == 40.0
    assert gravados[0]["status"] == StatusShort.SUGERIDO


@pytest.mark.asyncio
async def test_regerar_substitui_sugeridos_e_preserva_curadoria(session_factory):
    """Refazer o palpite da IA nao pode desfazer o que o operador ja decidiu."""
    await _seed_corte(session_factory)
    contexto = await servico.montar_contexto("c1")

    await servico.registrar_sugestoes(
        contexto, ResultadoSugestoes(sugestoes=[_sugestao("palpite velho", 0.0, 30.0)])
    )
    async with session_factory() as db:
        aprovado = Short(
            id="aprovado-1",
            corte_id="c1",
            numero=99,
            titulo_sugerido="o que eu ja escolhi",
            status=StatusShort.APROVADO,
        )
        db.add(aprovado)
        await db.commit()

    await servico.registrar_sugestoes(
        contexto, ResultadoSugestoes(sugestoes=[_sugestao("palpite novo", 60.0, 100.0)])
    )

    async with session_factory() as db:
        titulos = {s.titulo_sugerido for s in (await db.scalars(select(Short))).all()}
        numeros = {s.titulo_sugerido: s.numero for s in (await db.scalars(select(Short))).all()}

    assert titulos == {"o que eu ja escolhi", "palpite novo"}
    # Numeracao continua depois do que sobreviveu, sem colidir com o aprovado.
    assert numeros["palpite novo"] == 100


@pytest.mark.asyncio
async def test_listar_ordena_pelo_score(session_factory):
    await _seed_corte(session_factory)
    contexto = await servico.montar_contexto("c1")
    await servico.registrar_sugestoes(
        contexto,
        ResultadoSugestoes(
            sugestoes=[_sugestao("baixo", 0.0, 30.0, 4.0), _sugestao("alto", 40.0, 80.0, 9.5)]
        ),
    )

    listados = await servico.listar_shorts("c1")

    assert [s["titulo"] for s in listados] == ["alto", "baixo"]


class TestContextoDoGancho:
    """D-565: o material que a skill do gancho le.

    Este bloco nasceu de um erro que so aparecia em runtime: um campo novo no
    dataclass, a construcao sem ele, e um 500 na cara do operador. Nenhum teste
    de dominio pegaria — a montagem e que estava incompleta.

    O resto vigia as duas escolhas editoriais do contexto: a base e a
    TRANSCRICAO DO TRECHO (nao o resumo do corte), e o historico serve para
    EVITAR repeticao — o inverso da etiqueta da capa do TikTok.
    """

    @pytest.mark.asyncio
    async def test_a_base_e_a_fala_do_trecho_e_nao_o_bruto_inteiro(self, session_factory):
        """Gancho escrito sobre o bruto todo prometeria os outros minutos."""
        await _seed_corte(
            session_factory,
            transcricao_final=[
                {"start": 0.0, "end": 4.0, "texto": "antes do trecho"},
                {"start": 20.0, "end": 25.0, "texto": "dentro do trecho"},
                {"start": 90.0, "end": 95.0, "texto": "depois do trecho"},
            ],
        )
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=15.0, fim_seg=40.0))
            await db.commit()

        contexto = await servico.montar_contexto_do_gancho("s1")

        assert "dentro do trecho" in contexto.texto_transcricao
        assert "antes do trecho" not in contexto.texto_transcricao
        assert "depois do trecho" not in contexto.texto_transcricao
        assert contexto.duracao_seg == 25.0

    @pytest.mark.asyncio
    async def test_o_historico_vem_nas_duas_formas(self, session_factory):
        """Uma para o prompt (texto), outra para o parser (lista).

        O prompt PEDE para nao repetir; a lista e o que deixa o parser GARANTIR.
        Foi o campo que faltou na construcao e derrubou a primeira chamada real.
        """
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=60.0))
            db.add(
                Short(
                    id="s2",
                    corte_id="c1",
                    numero=2,
                    inicio_seg=0.0,
                    fim_seg=30.0,
                    gancho_tela="um gancho ja gasto",
                )
            )
            await db.commit()

        contexto = await servico.montar_contexto_do_gancho("s1")

        assert contexto.ganchos_gastos == ["um gancho ja gasto"]
        assert "um gancho ja gasto" in contexto.ganchos_recentes

    @pytest.mark.asyncio
    async def test_o_proprio_gancho_nao_entra_no_historico(self, session_factory):
        """Senao o modelo evitaria justamente o texto que se quer melhorar."""
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(
                Short(
                    id="s1",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    gancho_tela="o meu proprio gancho",
                )
            )
            await db.commit()

        contexto = await servico.montar_contexto_do_gancho("s1")

        assert contexto.ganchos_gastos == []

    @pytest.mark.asyncio
    async def test_trecho_sem_fala_recusa_em_vez_de_inventar(self, session_factory):
        await _seed_corte(session_factory, transcricao_final=[])
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
            await db.commit()

        with pytest.raises(ValueError, match="fala transcrita"):
            await servico.montar_contexto_do_gancho("s1")

    @pytest.mark.asyncio
    async def test_short_inexistente_levanta_lookup(self, session_factory):
        await _seed_corte(session_factory)
        with pytest.raises(LookupError):
            await servico.montar_contexto_do_gancho("nao-existe")
