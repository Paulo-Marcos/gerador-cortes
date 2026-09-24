"""D-484: criar um short que a IA nao propos.

A ARMADILHA que definiu o desenho desta demanda, encontrada antes de escrever
qualquer linha: `registrar_sugestoes` apaga TODOS os candidatos ainda SUGERIDOS
ao regerar. Um short manual nascendo sugerido — que e o certo, porque ele passa
pela mesma curadoria — seria varrido junto, em silencio, na proxima vez que
alguem clicasse em gerar shorts.

Dai a coluna `origem`. Ela nao e informativa: e o que mantem o trabalho do
operador vivo. O teste que mais importa neste arquivo e
`test_regerar_nao_apaga_o_manual`.
"""

import pytest
import pytest_asyncio
from app.domain.short.shorts import ResultadoSugestoes, SugestaoShort
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import shorts as servico
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch):
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
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                duracao_clip_seg=600.0,
            )
        )
        await db.commit()

    yield factory
    await engine.dispose()


def _contexto():
    return servico.ContextoShorts(
        corte_id="c1",
        projeto_id="p1",
        titulo="Corte 1",
        tema_central="Economia",
        duracao_seg=600.0,
        texto_transcricao="",
    )


def _sugestoes(*intervalos):
    return ResultadoSugestoes(
        sugestoes=[
            SugestaoShort(
                titulo=f"IA {i}",
                gancho="g",
                inicio_seg=ini,
                fim_seg=fim,
                score=8.0,
                justificativa="j",
            )
            for i, (ini, fim) in enumerate(intervalos)
        ],
        descartes=[],
    )


class TestCriar:
    @pytest.mark.asyncio
    async def test_nasce_sugerido_e_marcado_como_manual(self, ambiente):
        """SUGERIDO porque passa pela mesma curadoria; MANUAL porque sobrevive a ela."""
        short = await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=45.0)

        assert short["status"] == StatusShort.SUGERIDO.value
        assert short["origem"] == servico.ORIGEM_MANUAL
        assert (short["inicio_seg"], short["fim_seg"]) == (10.0, 45.0)

    @pytest.mark.asyncio
    async def test_sem_titulo_ganha_um_que_se_explica(self, ambiente):
        short = await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=45.0)

        assert "manual" in short["titulo"].lower()

    @pytest.mark.asyncio
    async def test_o_titulo_do_operador_manda(self, ambiente):
        short = await servico.criar_manual(
            "c1", inicio_seg=10.0, fim_seg=45.0, titulo="  O erro dos juros  "
        )

        assert short["titulo"] == "O erro dos juros"

    @pytest.mark.asyncio
    async def test_nao_recebe_nota_inventada(self, ambiente):
        """O score ordena os palpites da IA entre si.

        Dar uma nota ao trecho humano o misturaria nessa fila como se fosse mais
        um chute — e uma nota alta o poria no topo sem ter sido avaliado por
        ninguem.
        """
        short = await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=45.0)

        assert short["score"] == 0.0

    @pytest.mark.asyncio
    async def test_usa_a_mesma_validacao_de_bordas_do_patch(self, ambiente):
        """Um segundo caminho de escrita com regra propria discordaria do primeiro."""
        with pytest.raises(ValueError, match="depois do inicio"):
            await servico.criar_manual("c1", inicio_seg=50.0, fim_seg=20.0)
        with pytest.raises(ValueError, match="negativo"):
            await servico.criar_manual("c1", inicio_seg=-5.0, fim_seg=20.0)
        with pytest.raises(ValueError, match="duracao do bruto"):
            await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=9999.0)

    @pytest.mark.asyncio
    async def test_aceita_duracao_fora_de_15_90s(self, ambiente):
        """A faixa disciplina a IA, nao o humano — mesma regra do PATCH."""
        curto = await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=13.0)

        assert curto["duracao_seg"] == 3.0

    @pytest.mark.asyncio
    async def test_corte_inexistente_e_404(self, ambiente):
        with pytest.raises(LookupError):
            await servico.criar_manual("nao-existe", inicio_seg=10.0, fim_seg=45.0)


class TestSobrevivenciaARegeracao:
    @pytest.mark.asyncio
    async def test_regerar_nao_apaga_o_manual(self, ambiente):
        """O TESTE QUE JUSTIFICA A COLUNA `origem`.

        Sem ela, o trecho que o operador marcou a mao sumiria no proximo clique
        em "gerar shorts" — sem aviso, sem log, sem nada na tela.
        """
        manual = await servico.criar_manual("c1", inicio_seg=100.0, fim_seg=140.0)
        await servico.registrar_sugestoes(_contexto(), _sugestoes((10.0, 40.0)))

        await servico.registrar_sugestoes(_contexto(), _sugestoes((200.0, 240.0)))

        restantes = await servico.listar_shorts("c1")
        ids = {s["id"] for s in restantes}

        assert manual["id"] in ids, "a regeracao apagou o short manual"

    @pytest.mark.asyncio
    async def test_regerar_continua_apagando_o_palpite_antigo_da_ia(self, ambiente):
        """A poupanca do manual nao pode virar acumulo de lixo da maquina."""
        await servico.registrar_sugestoes(_contexto(), _sugestoes((10.0, 40.0), (50.0, 80.0)))

        await servico.registrar_sugestoes(_contexto(), _sugestoes((200.0, 240.0)))

        da_ia = [s for s in await servico.listar_shorts("c1") if s["origem"] == servico.ORIGEM_IA]

        assert len(da_ia) == 1
        assert da_ia[0]["inicio_seg"] == 200.0

    @pytest.mark.asyncio
    async def test_o_manual_nao_perde_a_numeracao_para_um_novo_palpite(self, ambiente):
        """Numeracao contando so os curados daria a dois candidatos o mesmo numero."""
        manual = await servico.criar_manual("c1", inicio_seg=100.0, fim_seg=140.0)

        await servico.registrar_sugestoes(_contexto(), _sugestoes((10.0, 40.0), (50.0, 80.0)))

        numeros = [s["numero"] for s in await servico.listar_shorts("c1")]

        assert len(numeros) == len(set(numeros)), f"numero repetido: {numeros}"
        assert manual["numero"] in numeros

    @pytest.mark.asyncio
    async def test_curado_da_ia_continua_sobrevivendo(self, ambiente):
        """A regra antiga nao regrediu: aprovado/rejeitado nunca foram apagados."""
        await servico.registrar_sugestoes(_contexto(), _sugestoes((10.0, 40.0)))
        aprovado = (await servico.listar_shorts("c1"))[0]
        await servico.atualizar_short(aprovado["id"], status=StatusShort.APROVADO.value)

        await servico.registrar_sugestoes(_contexto(), _sugestoes((200.0, 240.0)))

        ids = {s["id"] for s in await servico.listar_shorts("c1")}

        assert aprovado["id"] in ids


class TestContagem:
    @pytest.mark.asyncio
    async def test_o_manual_entra_nas_contagens_como_qualquer_candidato(self, ambiente):
        """Ele passa pela mesma curadoria, entao conta na mesma fila."""
        await servico.criar_manual("c1", inicio_seg=10.0, fim_seg=45.0)

        async with ambiente() as db:
            total = len((await db.scalars(select(Short).where(Short.corte_id == "c1"))).all())

        assert total == 1

    @pytest.mark.asyncio
    async def test_short_da_ia_nasce_com_origem_ia(self, ambiente):
        """O default da coluna precisa valer para o caminho que ja existia."""
        await servico.registrar_sugestoes(_contexto(), _sugestoes((10.0, 40.0)))

        assert (await servico.listar_shorts("c1"))[0]["origem"] == servico.ORIGEM_IA
