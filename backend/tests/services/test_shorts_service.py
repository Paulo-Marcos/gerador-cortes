"""D-454: montagem do material do prompt e persistência dos candidatos.

O teste mais importante deste arquivo é o do INSUMO: o contexto tem de sair da
`transcricao_final` (timeline do bruto), nunca da `transcricao_raw` (timeline da
live). Trocar a fonte num refactor futuro não quebraria nada visível — só
produziria shorts recortados no lugar errado, meses depois.
"""

import json

import pytest
import pytest_asyncio
from app.domain.short.shorts import ResultadoSugestoes, SugestaoShort
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


class TestPostDoShort:
    """D-565 (onda 3): o texto de publicacao, gravado no MetadadoShort.

    A tabela existe desde a D-452 e nunca foi preenchida. O risco desta onda nao
    e a geracao — e o FALLBACK: um short que nunca passou pelo modal do post
    precisa continuar publicavel com o texto de sempre. Exigir a etapa nova
    quebraria os candidatos que ja existem em PROD por um motivo burocratico.
    """

    @pytest_asyncio.fixture
    async def store(self, session_factory):
        """O servico do post ligado ao mesmo banco em memoria do fixture.

        Ele tem a PROPRIA `AsyncSessionLocal`; sem troca-la tambem, estes testes
        leriam o banco de desenvolvimento de verdade.
        """
        from app.services import metadados_short as post_store

        original = post_store.AsyncSessionLocal
        post_store.AsyncSessionLocal = servico.AsyncSessionLocal
        yield post_store
        post_store.AsyncSessionLocal = original

    @pytest_asyncio.fixture
    async def com_short(self, session_factory, **kwargs):
        """Um corte com transcricao e um short `s1` sobre ele."""
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=60.0))
            await db.commit()

    @pytest.mark.asyncio
    async def test_o_contexto_manda_o_gancho_para_nao_ser_repetido(self, session_factory, store):
        """Quem le o titulo ja viu o gancho dentro do video."""
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(
                Short(
                    id="s1",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    gancho_tela="o juro trabalha contra voce",
                )
            )
            await db.commit()

        contexto = await store.montar_contexto("s1")

        assert contexto.gancho_na_tela == "o juro trabalha contra voce"
        # A plataforma mais apertada e a que define onde o peso do titulo cai.
        assert contexto.titulo_visivel == 40
        assert contexto.titulo_max == 100

    @pytest.mark.asyncio
    async def test_short_sem_gancho_avisa_em_vez_de_mandar_vazio(self, store, com_short):

        contexto = await store.montar_contexto("s1")

        assert "nao tem gancho" in contexto.gancho_na_tela

    @pytest.mark.asyncio
    async def test_gravar_cria_o_registro_que_nunca_existiu(self, store, com_short):
        from app.domain.short.metadados_short import PostDoShort

        gravado = await store.gravar(
            "s1", PostDoShort(titulo="Um titulo", descricao="contexto", hashtags=["juros"])
        )

        assert gravado["titulo"] == "Um titulo"
        assert gravado["hashtags"] == ["juros"]
        assert gravado["gerado"] is True

    @pytest.mark.asyncio
    async def test_post_vazio_nao_apaga_o_que_o_operador_escreveu(self, store, com_short):
        """A skill devolver lixo nao pode custar o texto escrito a mao."""
        from app.domain.short.metadados_short import PostDoShort

        await store.atualizar("s1", titulo="escrito a mao")
        depois = await store.gravar("s1", PostDoShort())

        assert depois["titulo"] == "escrito a mao"

    @pytest.mark.asyncio
    async def test_editar_com_string_vazia_apaga(self, store, com_short):
        """E assim que o operador tira um texto que a IA escreveu."""
        await store.atualizar("s1", titulo="vai sair")
        depois = await store.atualizar("s1", titulo="")

        assert depois["titulo"] == ""
        assert depois["gerado"] is False

    @pytest.mark.asyncio
    async def test_hashtags_editadas_a_mao_passam_pela_limpeza(self, store, com_short):
        depois = await store.atualizar("s1", hashtags=["#juros", "juros", "taxa de juros"])

        assert depois["hashtags"] == ["juros", "taxadejuros"]


class TestTextoDaPublicacao:
    """D-565 (onda 3): qual texto vai para o feed.

    Este e o ponto de REGRESSAO da onda. A publicacao do short funciona desde a
    D-468 montando o texto na hora; se a preferencia pelo `MetadadoShort` for
    escrita errada, o sintoma nao e um erro — e um short subindo com titulo
    vazio, descoberto depois de publicado.
    """

    @pytest_asyncio.fixture
    async def cenario(self, session_factory):
        """Um corte, um short renderizado, e a sessao para consultar."""
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(
                Short(
                    id="s1",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    titulo_sugerido="titulo da curadoria",
                    gancho="gancho da curadoria",
                )
            )
            await db.commit()
        return session_factory

    async def _texto(self, factory, short_id="s1"):
        from app.services.publicacao_destinos import _texto_do_short

        async with factory() as db:
            short = await db.get(Short, short_id)
            corte = await db.get(Corte, "c1")
            return await _texto_do_short(db, short, corte)

    @pytest.mark.asyncio
    async def test_sem_post_escrito_cai_no_texto_de_antes(self, cenario):
        """Short que nunca passou pelo modal continua publicavel."""
        base = await self._texto(cenario)

        assert base.titulo == "titulo da curadoria"
        assert base.descricao == "gancho da curadoria"

    @pytest.mark.asyncio
    async def test_post_escrito_tem_preferencia(self, cenario):
        from app.models import MetadadoShort

        async with cenario() as db:
            db.add(
                MetadadoShort(
                    id="m1",
                    short_id="s1",
                    titulo_youtube="titulo do feed",
                    descricao_youtube="contexto do feed",
                    tags_youtube='["juros"]',
                )
            )
            await db.commit()

        base = await self._texto(cenario)

        assert base.titulo == "titulo do feed"
        assert base.descricao == "contexto do feed"
        assert base.hashtags == ["juros"]

    @pytest.mark.asyncio
    async def test_registro_vazio_nao_apaga_o_fallback(self, cenario):
        """`MetadadoShort` criado mas nunca preenchido nao pode zerar o post.

        Acontece de verdade: abrir o modal e fechar sem gerar ja cria a linha.
        """
        from app.models import MetadadoShort

        async with cenario() as db:
            db.add(MetadadoShort(id="m1", short_id="s1"))
            await db.commit()

        base = await self._texto(cenario)

        assert base.titulo == "titulo da curadoria"
        assert base.descricao == "gancho da curadoria"

    @pytest.mark.asyncio
    async def test_titulo_proprio_sem_hashtags_ainda_usa_as_do_corte(self, cenario):
        """Titulo e hashtags sao decisoes separadas.

        As do corte, nesse caso, sao melhores que nenhuma.
        """
        from app.models import MetadadoShort

        async with cenario() as db:
            db.add(MetadadoShort(id="m1", short_id="s1", titulo_youtube="so o titulo"))
            await db.commit()

        base = await self._texto(cenario)

        assert base.titulo == "so o titulo"
        # O corte deste fixture tem tema "Economia", e e dele que a hashtag sai.
        assert base.hashtags == ["Economia"]

    @pytest.mark.asyncio
    async def test_tags_corrompidas_no_banco_nao_derrubam_a_publicacao(self, cenario):
        from app.models import MetadadoShort

        async with cenario() as db:
            db.add(
                MetadadoShort(
                    id="m1", short_id="s1", titulo_youtube="tem titulo", tags_youtube="{quebrado"
                )
            )
            await db.commit()

        base = await self._texto(cenario)

        assert base.titulo == "tem titulo"
        # JSON quebrado vira lista vazia, e a publicacao cai nas tags do corte.
        assert base.hashtags == ["Economia"]


class TestCapaDoShort:
    """D-565 (onda 4): o quadro de capa.

    A capa do short e um FRAME dele mesmo, e nao a arte montada do corte —
    aquela existe para resolver o problema do video DEITADO, que este nao tem.

    O que precisa de guarda aqui e o INSTANTE: e ele que decide a capa de todo
    short que o operador nao abrir, e ele vem de duas fontes (o gravado e o
    sugerido) que nao podem se confundir.
    """

    @pytest_asyncio.fixture
    async def store(self, session_factory):
        from app.services import capa_short

        original = capa_short.AsyncSessionLocal
        capa_short.AsyncSessionLocal = servico.AsyncSessionLocal
        yield capa_short
        capa_short.AsyncSessionLocal = original

    @pytest.mark.asyncio
    async def test_sem_capa_sugere_o_meio_do_gancho(self, session_factory, store):
        """Com gancho, a capa ja sai com a promessa escrita em cima."""
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(
                Short(
                    id="s1",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=0.0,
                    fim_seg=30.0,
                    gancho_ate_seg=2.5,
                )
            )
            await db.commit()

        capa = await store.obter("s1")

        assert capa["tem_capa"] is False
        assert capa["instante_seg"] == 1.25
        assert capa["duracao_seg"] == 30.0
        assert capa["gancho_ate_seg"] == 2.5

    @pytest.mark.asyncio
    async def test_sem_gancho_sugere_o_primeiro_terco(self, session_factory, store):
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
            await db.commit()

        assert (await store.obter("s1"))["instante_seg"] == 10.0

    @pytest.mark.asyncio
    async def test_com_capa_gravada_devolve_o_instante_dela(self, session_factory, store):
        """O gravado tem precedencia sobre o sugerido — senao reabrir a tela
        jogaria o operador de volta ao palpite, perdendo a escolha dele."""
        from app.models import MetadadoShort

        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(
                Short(
                    id="s1",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=0.0,
                    fim_seg=30.0,
                    gancho_ate_seg=2.5,
                )
            )
            db.add(
                MetadadoShort(
                    id="m1",
                    short_id="s1",
                    capa_path="cortes/c1/shorts/s1/capa.jpg",
                    capa_instante_seg=7.5,
                )
            )
            await db.commit()

        capa = await store.obter("s1")

        assert capa["tem_capa"] is True
        assert capa["instante_seg"] == 7.5

    @pytest.mark.asyncio
    async def test_short_sem_mp4_recusa_antes_de_chamar_o_ffmpeg(self, session_factory, store):
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
            await db.commit()

        with pytest.raises(ValueError, match="renderizado"):
            await store.gerar("s1")

    @pytest.mark.asyncio
    async def test_short_inexistente_levanta_lookup(self, session_factory, store):
        await _seed_corte(session_factory)
        with pytest.raises(LookupError):
            await store.obter("nao-existe")


class TestCapaNaPublicacao:
    """A capa escolhida tem de chegar ao pacote — e a ausencia tem de ser calada."""

    @pytest_asyncio.fixture
    async def cenario(self, session_factory):
        await _seed_corte(session_factory)
        async with session_factory() as db:
            db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
            await db.commit()
        return session_factory

    async def _capa(self, factory):
        from app.services.publicacao_destinos import _capa_do_short

        async with factory() as db:
            short = await db.get(Short, "s1")
            corte = await db.get(Corte, "c1")
            return await _capa_do_short(db, short, corte)

    @pytest.mark.asyncio
    async def test_sem_capa_escolhida_o_pacote_sai_sem_ela(self, cenario):
        """A plataforma congela um quadro sozinha; isso e um estado legitimo."""
        assert await self._capa(cenario) is None

    @pytest.mark.asyncio
    async def test_caminho_morto_conta_como_ausencia(self, cenario):
        """A limpeza de retencao apaga imagem antiga.

        Um caminho morto no pacote e pior que a ausencia declarada: no segundo
        caso o operador escolhe um quadro no upload; no primeiro ele descobre o
        arquivo faltando depois.
        """
        from app.models import MetadadoShort

        async with cenario() as db:
            db.add(MetadadoShort(id="m1", short_id="s1", capa_path="cortes/c1/shorts/s1/sumiu.jpg"))
            await db.commit()

        assert await self._capa(cenario) is None
