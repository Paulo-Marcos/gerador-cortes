"""D-487: de onde vêm as regiões do palco de um corte.

A armadilha que motivou esta demanda vir ANTES da composição: sem região
marcada, o palco cai em "pessoa cheia" usando o quadro INTEIRO — e o chrome
verde da live volta, que é justamente o que o palco existe para evitar. O corte
real do dev está assim (`{"modo_padrao": "full", "regioes": []}`).

Por isso `origem` volta em toda resposta: um palco montado errado precisa dizer
POR QUE está assim, senão o operador mexe no arranjo achando que o problema é o
modelo, quando é a falta de região.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, LayoutPreset, Projeto, Short
from app.services import palco_shorts as servico
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

FACECAM = {"x": 24, "y": 410, "w": 340, "h": 260}
TELA = {"x": 365, "y": 180, "w": 1325, "h": 720}

PRESET_COMPARTILHADO = {
    "compartilhada": {"telas": 2, "crop_facecam": FACECAM, "crop_tela": TELA},
    "fundo": "hud-topo",
}
PRESET_VAZIO = {"fundo": "hud-topo", "placa": {"nome": "", "papel": ""}}


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
                fim_seg=100.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:40.000",
                # O caso real: corte nunca posicionado.
                layout_youtube=json.dumps({"modo_padrao": "full", "regioes": []}),
            )
        )
        db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=10.0, fim_seg=40.0))
        db.add(
            LayoutPreset(
                id="pre-1",
                nome="Comp. 2 OBS",
                tipo="posicionamento",
                payload=json.dumps(PRESET_COMPARTILHADO),
            )
        )
        db.add(
            LayoutPreset(
                id="pre-vazio",
                nome="Sem regiao",
                tipo="posicionamento",
                payload=json.dumps(PRESET_VAZIO),
            )
        )
        await db.commit()

    yield factory
    await engine.dispose()


class TestCatalogo:
    def test_traz_os_quatro_com_o_porque(self):
        catalogo = servico.catalogo_modelos()

        assert len(catalogo) == 4
        for modelo in catalogo:
            assert modelo["porque"], "escolher sem saber para que serve e adivinhacao"
            assert modelo["regioes_exigidas"]


class TestDescrever:
    @pytest.mark.asyncio
    async def test_corte_sem_posicionamento_admite_que_nao_tem_regiao(self, ambiente):
        """O caso real. Sem isto o operador nao entende por que o verde ficou."""
        estado = await servico.descrever("c1")

        assert estado["origem"] == servico.ORIGEM_NENHUMA
        assert estado["regioes"] == {}

    @pytest.mark.asyncio
    async def test_oferece_os_presets_que_tem_regiao(self, ambiente):
        estado = await servico.descrever("c1")
        nomes = [p["nome"] for p in estado["presets_disponiveis"]]

        assert "Comp. 2 OBS" in nomes
        assert "Sem regiao" not in nomes, "preset sem crop nao serve de nada aqui"

    @pytest.mark.asyncio
    async def test_layout_do_corte_serve_sem_cadastro_nenhum(self, ambiente):
        """Corte ja posicionado para o horizontal ja tem os crops."""
        async with ambiente() as db:
            corte = await db.get(Corte, "c1")
            corte.layout_youtube = json.dumps({"crop_facecam": FACECAM, "crop_tela": TELA})
            await db.commit()

        estado = await servico.descrever("c1")

        assert estado["origem"] == servico.ORIGEM_LAYOUT
        assert estado["regioes"] == {"pessoa": FACECAM, "tela": TELA}
        assert estado["modelo_sugerido"] == "tela_cima_pessoa_baixo"

    @pytest.mark.asyncio
    async def test_corte_inexistente_e_404(self, ambiente):
        with pytest.raises(LookupError):
            await servico.descrever("nao-existe")


class TestEscolherPreset:
    @pytest.mark.asyncio
    async def test_o_preset_escolhido_passa_a_mandar(self, ambiente):
        estado = await servico.escolher_preset("c1", "pre-1")

        assert estado["origem"] == servico.ORIGEM_PRESET
        assert estado["preset"] == "Comp. 2 OBS"
        assert estado["regioes"] == {"pessoa": FACECAM, "tela": TELA}

    @pytest.mark.asyncio
    async def test_preset_vence_o_layout_do_corte(self, ambiente):
        """A escolha explicita do operador ganha da deducao."""
        outro = {"x": 0, "y": 0, "w": 100, "h": 100}
        async with ambiente() as db:
            corte = await db.get(Corte, "c1")
            corte.layout_youtube = json.dumps({"crop_facecam": outro})
            await db.commit()

        estado = await servico.escolher_preset("c1", "pre-1")

        assert estado["regioes"]["pessoa"] == FACECAM

    @pytest.mark.asyncio
    async def test_preset_sem_regiao_e_recusado(self, ambiente):
        """Apontar para um preset vazio deixaria o corte PARECENDO configurado."""
        with pytest.raises(ValueError, match="quadro inteiro"):
            await servico.escolher_preset("c1", "pre-vazio")

    @pytest.mark.asyncio
    async def test_vazio_volta_ao_automatico(self, ambiente):
        await servico.escolher_preset("c1", "pre-1")

        estado = await servico.escolher_preset("c1", "")

        assert estado["origem"] == servico.ORIGEM_NENHUMA

    @pytest.mark.asyncio
    async def test_preset_inexistente_e_404(self, ambiente):
        with pytest.raises(LookupError):
            await servico.escolher_preset("c1", "nao-existe")


class TestResolverParaRender:
    @pytest.mark.asyncio
    async def test_sem_regiao_devolve_plano_nulo_e_diz_o_porque(self, ambiente):
        """Degradar para o recorte antigo e melhor que abortar — mas tem de constar."""
        resolvido = await servico.resolver_para_render("s1")

        assert resolvido["plano"] is None
        assert resolvido["origem"] == servico.ORIGEM_NENHUMA

    @pytest.mark.asyncio
    async def test_com_preset_monta_o_plano_sugerido(self, ambiente):
        await servico.escolher_preset("c1", "pre-1")

        resolvido = await servico.resolver_para_render("s1")

        assert resolvido["modelo"] == "tela_cima_pessoa_baixo"
        assert {r.regiao for r in resolvido["plano"].recortes} == {"pessoa", "tela"}

    @pytest.mark.asyncio
    async def test_a_escolha_do_operador_vence_o_sugerido(self, ambiente):
        await servico.escolher_preset("c1", "pre-1")
        async with ambiente() as db:
            short = await db.get(Short, "s1")
            short.modelo_palco = "pessoa_com_insert"
            await db.commit()

        resolvido = await servico.resolver_para_render("s1")

        assert resolvido["modelo"] == "pessoa_com_insert"

    @pytest.mark.asyncio
    async def test_modelo_que_as_regioes_nao_comportam_cai_no_sugerido(self, ambiente, caplog):
        """Preset so com facecam + operador pedindo tela: render segue, com aviso.

        Abortar o render por causa de uma escolha de arranjo seria punir o
        operador por experimentar; seguir calado esconderia que ele nao recebeu
        o que pediu.
        """
        async with ambiente() as db:
            preset = await db.get(LayoutPreset, "pre-1")
            preset.payload = json.dumps({"crop_facecam": FACECAM})
            short = await db.get(Short, "s1")
            short.modelo_palco = "tela_cima_pessoa_baixo"
            await db.commit()
        await servico.escolher_preset("c1", "pre-1")

        resolvido = await servico.resolver_para_render("s1")

        assert resolvido["modelo"] == "pessoa_cheia"
        assert "nao serve" in caplog.text

    @pytest.mark.asyncio
    async def test_short_inexistente_e_404(self, ambiente):
        with pytest.raises(LookupError):
            await servico.resolver_para_render("nao-existe")


class TestSimular:
    """D-500: o plano que ESTES ajustes dariam, sem tocar no banco.

    É o que permite a prévia redesenhar durante o arraste. A alternativa era
    portar a matemática de recorte para o frontend — a segunda implementação de
    geometria que este épico inteiro evitou, e que já custou dois bugs de
    divergência silenciosa (D-490, D-493).
    """

    @pytest_asyncio.fixture
    async def com_regiao(self, ambiente):
        await servico.escolher_preset("c1", "pre-1")
        return ambiente

    @pytest.mark.asyncio
    async def test_o_ajuste_hipotetico_muda_o_desenho(self, com_regiao):
        gravado = await servico.plano_desenhavel("s1")
        alvo = {"x": 40, "y": 900, "w": 500, "h": 500}

        simulado = await servico.plano_desenhavel("s1", {"pessoa": alvo})

        assert simulado["slots"]["pessoa"] == alvo
        assert simulado["slots"]["pessoa"] != gravado["slots"]["pessoa"]

    @pytest.mark.asyncio
    async def test_simular_nao_grava(self, com_regiao):
        """Se gravasse, cada quadro do arraste viraria um estado do banco."""
        await servico.plano_desenhavel("s1", {"pessoa": {"x": 40, "y": 900, "w": 500, "h": 500}})

        async with com_regiao() as db:
            short = await db.get(Short, "s1")
            assert short.ajustes_palco in ("", "{}")

        assert (await servico.plano_desenhavel("s1"))["ajustados"] == []

    @pytest.mark.asyncio
    async def test_o_video_dentro_do_bloco_reflui_junto(self, com_regiao):
        """O ponto da demanda.

        Antes, arrastar movia um retângulo vazio: o `destino` do recorte só
        mudava depois do refetch. Se a simulação devolvesse o slot novo com o
        desenho velho, o arraste continuaria mentindo — só que mais rápido.
        """
        gravado = await servico.plano_desenhavel("s1")

        simulado = await servico.plano_desenhavel(
            "s1", {"pessoa": {"x": 40, "y": 900, "w": 500, "h": 500}}
        )

        # A ordem dos recortes e a de empilhamento do modelo, e nao muda.
        indice = list(gravado["slots"]).index("pessoa")
        antes, depois = gravado["recortes"][indice], simulado["recortes"][indice]

        assert depois["destino"] != antes["destino"]
        assert depois["recorta"] != antes["recorta"]

    @pytest.mark.asyncio
    async def test_ajuste_vazio_e_o_plano_gravado(self, com_regiao):
        """`{}` significa "sem override", não "apague os ajustes"."""
        async with com_regiao() as db:
            short = await db.get(Short, "s1")
            short.ajustes_palco = json.dumps({"pessoa": {"x": 10, "y": 20, "w": 300, "h": 300}})
            await db.commit()

        simulado = await servico.plano_desenhavel("s1", {})

        assert simulado["slots"]["pessoa"] == {"x": 10, "y": 20, "w": 300, "h": 300}

    @pytest.mark.asyncio
    async def test_arrastar_um_bloco_nao_devolve_o_outro_ao_lugar(self, com_regiao):
        """O arraste manda só o bloco na mão; o resto continua como está.

        Substituir o mapa inteiro faria a tela pular de volta ao padrão sempre
        que o operador mexesse na pessoa — e o pulo não teria explicação nenhuma
        na tela.
        """
        fixo = {"x": 0, "y": 0, "w": 1080, "h": 600}
        async with com_regiao() as db:
            short = await db.get(Short, "s1")
            short.ajustes_palco = json.dumps({"tela": fixo})
            await db.commit()

        simulado = await servico.plano_desenhavel(
            "s1", {"pessoa": {"x": 40, "y": 900, "w": 500, "h": 500}}
        )

        assert simulado["slots"]["tela"] == fixo

    @pytest.mark.asyncio
    async def test_simular_nao_esconde_a_moldura(self, com_regiao):
        """A assinatura do canal não é ajuste de bloco; ela fica.

        Sem isso o operador arrastaria vendo um enquadramento sem moldura e
        renderizaria outro com — a prévia deixaria de descrever o arquivo
        exatamente no momento em que ele está decidindo o enquadramento.
        """
        simulado = await servico.plano_desenhavel(
            "s1", {"pessoa": {"x": 40, "y": 900, "w": 500, "h": 500}}
        )

        assert simulado["faixas"], "a moldura sumiu no rascunho"

    @pytest.mark.asyncio
    async def test_short_inexistente_e_404(self, ambiente):
        with pytest.raises(LookupError):
            await servico.plano_desenhavel("nao-existe", {})
