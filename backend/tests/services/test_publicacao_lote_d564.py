"""D-564: o lote — uma raia por plataforma, cada uma no seu passo.

Os três comportamentos que este arquivo protege são os três que quebram na mão
do operador se alguém "simplificar" a fila mais tarde:

  1. destino de API termina em PUBLICADO; destino manual termina em SUA_VEZ —
     dizer "concluído" para os dois seria afirmar que o Reels está no ar quando
     ele está numa pasta esperando o celular;
  2. o que já subiu entra como PULADO em vez de subir de novo;
  3. a raia do YouTube para quando a cota do dia acaba, e as outras não param
     junto — é exatamente por isso que elas são raias separadas.
"""

import asyncio
import json
from pathlib import Path

import pytest
import pytest_asyncio
from app.domain.publicacao import ModoPublicacao, Plataforma
from app.domain.ritmo_publicacao import EstadoItem
from app.domain.tiktok_studio import Passo, RoteiroInterrompido
from app.models import Base, Corte, MetadadoCorte, Projeto, PublicacaoShort, Short
from app.services import publicacao_destinos as destinos
from app.services import publicacao_lote as lote_svc
from app.services.publicacao_destinos import Destino
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


class _DestinoDeApi(Destino):
    """Sobe e devolve URL, como o YouTube."""

    modo = ModoPublicacao.API

    def __init__(self, plataforma: Plataforma) -> None:
        self.plataforma = plataforma
        self.enviados: list[str] = []

    async def publicar(self, pacote):
        self.enviados.append(str(pacote.arquivo))
        return {"url": f"https://exemplo/{len(self.enviados)}"}


class _DestinoDePacote(Destino):
    """Monta a pasta e para, como o Instagram e o TikTok de hoje."""

    modo = ModoPublicacao.MANUAL

    def __init__(self, plataforma: Plataforma) -> None:
        self.plataforma = plataforma
        self.preparados: list[str] = []

    async def publicar(self, pacote):
        self.preparados.append(str(pacote.arquivo))
        return {"pasta": f"/pacotes/{self.plataforma.value}", "avisos": []}


class _DestinoQueFalha(Destino):
    modo = ModoPublicacao.API

    def __init__(self, plataforma: Plataforma) -> None:
        self.plataforma = plataforma

    async def publicar(self, pacote):
        raise RuntimeError("a sessao expirou")


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    """Dois shorts renderizados, um banco em memória e destinos de mentira.

    Os destinos reais falam com YouTube e Playwright; o que se testa aqui é a
    FILA, e ela não precisa de nenhum dos dois para provar que respeita o ritmo.
    """
    from app import channel_paths

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)

    for short_id in ("s1", "s2"):
        pasta = tmp_path / "p1" / "cortes" / "c1" / "shorts" / short_id
        pasta.mkdir(parents=True)
        (pasta / "short.mp4").write_bytes(b"video")

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(destinos, "AsyncSessionLocal", factory)
    monkeypatch.setattr(lote_svc, "AsyncSessionLocal", factory)

    async with factory() as db:
        db.add(Projeto(id="p1", youtube_url="u"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="O corte",
                tema_central="Economia",
                inicio_seg=0.0,
                fim_seg=600.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:10:00.000",
                layout_youtube=json.dumps({}),
                youtube_url_publicado="https://youtu.be/longo",
            )
        )
        db.add(MetadadoCorte(id="m1", corte_id="c1", tags_youtube=json.dumps(["pix"])))
        for numero, short_id in enumerate(("s1", "s2"), start=1):
            db.add(
                Short(
                    id=short_id,
                    corte_id="c1",
                    numero=numero,
                    titulo_sugerido=f"Trecho {numero}",
                    inicio_seg=10.0,
                    fim_seg=50.0,
                    arquivo_short_path=f"cortes/c1/shorts/{short_id}/short.mp4",
                )
            )
        await db.commit()

    # As raias são fire-and-forget em produção; no teste elas viram corrotinas
    # que a gente aguarda de propósito — fila com temporização é fila que
    # falha em dia de máquina lenta.
    raias: list = []
    monkeypatch.setattr(lote_svc, "fire_and_forget", lambda coro, name=None: raias.append(coro))
    monkeypatch.setattr(lote_svc, "_lote_atual", None)

    registro_original = dict(destinos._REGISTRO)
    yield factory, raias
    destinos._REGISTRO.clear()
    destinos._REGISTRO.update(registro_original)
    await engine.dispose()


async def _rodar(raias: list) -> None:
    for coro in raias:
        await coro
    raias.clear()


async def _esperar_ate(condicao, segundos: float = 2.0) -> None:
    """Espera um estado que OUTRA tarefa produz — com teto, para não pendurar a suíte."""
    limite = asyncio.get_running_loop().time() + segundos
    while not condicao():
        if asyncio.get_running_loop().time() > limite:
            raise AssertionError("o estado esperado nao chegou")
        await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_api_termina_publicado_e_pacote_termina_na_sua_vez(ambiente):
    """O estado tem de distinguir "está no ar" de "está numa pasta esperando você"."""
    _, raias = ambiente
    youtube = _DestinoDeApi(Plataforma.YOUTUBE_SHORTS)
    reels = _DestinoDePacote(Plataforma.INSTAGRAM_REELS)
    destinos.registrar(youtube)
    destinos.registrar(reels)

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")],
        plataformas=[Plataforma.YOUTUBE_SHORTS, Plataforma.INSTAGRAM_REELS],
    )
    await _rodar(raias)

    por_plataforma = {i.plataforma: i for i in lote.itens}
    assert por_plataforma[Plataforma.YOUTUBE_SHORTS].estado is EstadoItem.PUBLICADO
    assert por_plataforma[Plataforma.YOUTUBE_SHORTS].url == "https://exemplo/1"
    assert por_plataforma[Plataforma.INSTAGRAM_REELS].estado is EstadoItem.SUA_VEZ
    assert "/pacotes/instagram_reels" in por_plataforma[Plataforma.INSTAGRAM_REELS].detalhe


class _DestinoDeApiComRessalva(_DestinoDeApi):
    """Sobe, mas a capa não entrou — o caso da D-588."""

    async def publicar(self, pacote):
        resultado = await super().publicar(pacote)
        return {**resultado, "avisos": ["a capa nao entrou"]}


@pytest.mark.asyncio
async def test_publicado_com_ressalva_mostra_o_aviso_no_item(ambiente):
    """D-588: PUBLICADO continua PUBLICADO, mas a capa que falhou aparece."""
    _, raias = ambiente
    destinos.registrar(_DestinoDeApiComRessalva(Plataforma.YOUTUBE_SHORTS))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    assert lote.itens[0].estado is EstadoItem.PUBLICADO
    assert "a capa nao entrou" in lote.itens[0].detalhe


@pytest.mark.asyncio
async def test_a_raia_sobe_os_dois_shorts_na_ordem_da_tela(ambiente):
    _, raias = ambiente
    youtube = _DestinoDeApi(Plataforma.YOUTUBE_SHORTS)
    destinos.registrar(youtube)

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
        plataformas=[Plataforma.YOUTUBE_SHORTS],
    )
    await _rodar(raias)

    assert [i.estado for i in lote.itens] == [EstadoItem.PUBLICADO, EstadoItem.PUBLICADO]
    assert [i.rotulo for i in lote.itens] == ["Trecho 1", "Trecho 2"]
    assert len(youtube.enviados) == 2


@pytest.mark.asyncio
async def test_o_que_ja_subiu_entra_pulado_e_nao_sobe_de_novo(ambiente):
    """Republicar em silêncio é o erro mais caro que uma fila pode cometer."""
    _, raias = ambiente
    youtube = _DestinoDeApi(Plataforma.YOUTUBE_SHORTS)
    destinos.registrar(youtube)

    await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    segundo = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    assert segundo.itens[0].estado is EstadoItem.PULADO
    assert len(youtube.enviados) == 1


@pytest.mark.asyncio
async def test_republicar_sobe_de_novo_o_que_ja_foi(ambiente):
    """D-590: "já subiu" não é "subiu certo" — pedido explícito volta para a fila."""
    _, raias = ambiente
    youtube = _DestinoDeApi(Plataforma.YOUTUBE_SHORTS)
    reels = _DestinoDePacote(Plataforma.INSTAGRAM_REELS)
    destinos.registrar(youtube)
    destinos.registrar(reels)
    plataformas = [Plataforma.YOUTUBE_SHORTS, Plataforma.INSTAGRAM_REELS]

    primeiro = await lote_svc.criar(alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=plataformas)
    await _rodar(raias)
    await lote_svc.confirmar("s1", Plataforma.INSTAGRAM_REELS)
    assert primeiro.terminou

    segundo = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")],
        plataformas=plataformas,
        opcoes=lote_svc.OpcoesDoLote(republicar=True),
    )
    await _rodar(raias)

    por_plataforma = {i.plataforma: i for i in segundo.itens}
    assert por_plataforma[Plataforma.YOUTUBE_SHORTS].estado is EstadoItem.PUBLICADO
    assert por_plataforma[Plataforma.INSTAGRAM_REELS].estado is EstadoItem.SUA_VEZ
    assert len(youtube.enviados) == 2
    assert len(reels.preparados) == 2


@pytest.mark.asyncio
async def test_a_cota_do_youtube_para_a_raia_dele_e_so_a_dele(ambiente, monkeypatch):
    """O Instagram não tem por que esperar o dia do YouTube virar."""
    _, raias = ambiente
    youtube = _DestinoDeApi(Plataforma.YOUTUBE_SHORTS)
    reels = _DestinoDePacote(Plataforma.INSTAGRAM_REELS)
    destinos.registrar(youtube)
    destinos.registrar(reels)

    # Seis já foram hoje: a cota acabou antes de o lote começar.
    async def _cota_estourada(plataforma):
        return 6 if plataforma is Plataforma.YOUTUBE_SHORTS else 0

    monkeypatch.setattr(lote_svc, "_publicados_hoje", _cota_estourada)

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")],
        plataformas=[Plataforma.YOUTUBE_SHORTS, Plataforma.INSTAGRAM_REELS],
    )
    await _rodar(raias)

    por_plataforma = {i.plataforma: i for i in lote.itens}
    assert por_plataforma[Plataforma.YOUTUBE_SHORTS].estado is EstadoItem.AGUARDANDO
    assert "cota" in lote.avisos[Plataforma.YOUTUBE_SHORTS.value].lower()
    assert por_plataforma[Plataforma.INSTAGRAM_REELS].estado is EstadoItem.SUA_VEZ
    assert youtube.enviados == []


@pytest.mark.asyncio
async def test_falha_de_um_item_nao_derruba_a_raia(ambiente):
    """A raia reporta e segue: um erro no primeiro não pode calar o segundo."""
    _, raias = ambiente
    destinos.registrar(_DestinoQueFalha(Plataforma.YOUTUBE_SHORTS))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
        plataformas=[Plataforma.YOUTUBE_SHORTS],
    )
    await _rodar(raias)

    assert all(i.estado is EstadoItem.ERRO for i in lote.itens)
    assert "sessao expirou" in lote.itens[0].detalhe


@pytest.mark.asyncio
async def test_o_estado_de_cada_item_fica_no_banco(ambiente):
    """Um lote de TikTok dura horas; estado só em memória some no primeiro restart."""
    factory, raias = ambiente
    destinos.registrar(_DestinoDeApi(Plataforma.YOUTUBE_SHORTS))

    await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    async with factory() as db:
        registro = (await db.execute(select(PublicacaoShort))).scalars().one()
        assert registro.estado == EstadoItem.PUBLICADO.value
        assert registro.publicado_em is not None
        assert registro.alvo_id == "s1"


@pytest.mark.asyncio
async def test_confirmar_a_mao_fecha_o_item_do_destino_manual(ambiente):
    """No Instagram o upload acontece no celular — a máquina não tem como ver."""
    _, raias = ambiente
    destinos.registrar(_DestinoDePacote(Plataforma.INSTAGRAM_REELS))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.INSTAGRAM_REELS]
    )
    await _rodar(raias)
    assert lote.itens[0].estado is EstadoItem.SUA_VEZ

    assert await lote_svc.confirmar("s1", Plataforma.INSTAGRAM_REELS) is True
    assert lote.itens[0].estado is EstadoItem.PUBLICADO


@pytest.mark.asyncio
async def test_confirmar_a_mao_fecha_o_item_que_deu_erro(ambiente):
    """D-603: o robô quebrou no meio e ele terminou no app — isso é publicado."""
    _, raias = ambiente
    destinos.registrar(_DestinoQueFalha(Plataforma.TIKTOK))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.TIKTOK]
    )
    await _rodar(raias)
    assert lote.itens[0].estado is EstadoItem.ERRO

    assert await lote_svc.confirmar("s1", Plataforma.TIKTOK) is True
    assert lote.itens[0].estado is EstadoItem.PUBLICADO

    assert await lote_svc._ja_publicados(["s1"]) == {"s1": {Plataforma.TIKTOK.value}}


@pytest.mark.asyncio
async def test_confirmar_a_mao_nasce_sem_lote_nenhum(ambiente):
    """D-603: publicou direto no celular, sem nunca ter passado por um lote."""
    assert (
        await lote_svc.confirmar(
            "s1", Plataforma.INSTAGRAM_REELS, url="https://instagram.com/reel/x"
        )
        is True
    )

    async with lote_svc.AsyncSessionLocal() as db:
        registro = (await db.execute(select(PublicacaoShort))).scalars().one()
    assert registro.alvo_tipo == lote_svc.ALVO_SHORT
    assert registro.estado == EstadoItem.PUBLICADO.value
    assert registro.publicado_em is not None
    assert registro.url == "https://instagram.com/reel/x"


@pytest.mark.asyncio
async def test_confirmar_duas_vezes_nao_conta_duas_publicacoes(ambiente):
    """A cota do dia é contada por `publicado_em`: duplicar inflaria a conta."""
    await lote_svc.confirmar("s1", Plataforma.INSTAGRAM_REELS)
    await lote_svc.confirmar("s1", Plataforma.INSTAGRAM_REELS)

    async with lote_svc.AsyncSessionLocal() as db:
        linhas = (await db.execute(select(PublicacaoShort))).scalars().all()
    assert len(linhas) == 1


@pytest.mark.asyncio
async def test_um_lote_de_cada_vez(ambiente):
    """Um operador, um Chrome, uma conta: dois lotes disputariam a mesma aba."""
    _, raias = ambiente
    destinos.registrar(_DestinoDePacote(Plataforma.TIKTOK))

    await lote_svc.criar(alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.TIKTOK])

    with pytest.raises(lote_svc.LoteEmAndamento):
        await lote_svc.criar(alvos=[(lote_svc.ALVO_SHORT, "s2")], plataformas=[Plataforma.TIKTOK])

    await _rodar(raias)


@pytest.mark.asyncio
async def test_cancelar_impede_os_que_ainda_nao_comecaram(ambiente):
    _, raias = ambiente
    destinos.registrar(_DestinoDeApi(Plataforma.YOUTUBE_SHORTS))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
        plataformas=[Plataforma.YOUTUBE_SHORTS],
    )
    assert await lote_svc.cancelar() is lote
    await _rodar(raias)

    assert all(i.estado is EstadoItem.CANCELADO for i in lote.itens)


@pytest.mark.asyncio
async def test_cancelar_marca_os_que_esperam_na_hora_e_no_banco(ambiente):
    """D-591: sem esperar a raia chegar neles — era essa espera que fazia o
    botão parecer morto."""
    factory, raias = ambiente
    destinos.registrar(_DestinoDeApi(Plataforma.YOUTUBE_SHORTS))

    lote = await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
        plataformas=[Plataforma.YOUTUBE_SHORTS],
    )
    await lote_svc.cancelar()

    assert all(i.estado is EstadoItem.CANCELADO for i in lote.itens)
    assert lote.terminou
    async with factory() as db:
        registros = (await db.execute(select(PublicacaoShort))).scalars().all()
    assert {r.estado for r in registros} == {EstadoItem.CANCELADO.value}
    await _rodar(raias)


@pytest.mark.asyncio
async def test_cancelar_lote_que_terminou_nao_faz_nada(ambiente):
    _, raias = ambiente
    destinos.registrar(_DestinoDeApi(Plataforma.YOUTUBE_SHORTS))

    await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    assert await lote_svc.cancelar() is None


@pytest.mark.asyncio
async def test_historico_do_corte_alimenta_a_tela_de_selecao(ambiente):
    _, raias = ambiente
    destinos.registrar(_DestinoDeApi(Plataforma.YOUTUBE_SHORTS))

    await lote_svc.criar(
        alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.YOUTUBE_SHORTS]
    )
    await _rodar(raias)

    historico = await lote_svc.historico_do_corte("c1")

    assert len(historico) == 1
    assert historico[0]["alvo_id"] == "s1"
    assert historico[0]["plataforma"] == Plataforma.YOUTUBE_SHORTS.value
    assert historico[0]["publicado_em"]


class TestRaiaAssistidaDoTikTok:
    """D-564 onda 2: o robô sobe, o operador clica, e a fila anda sozinha.

    O comportamento que estes testes protegem é o encadeamento. Sem ele o lote
    do TikTok seria só "montar N pastas": o operador teria de voltar aqui e
    pedir o próximo, toda vez.
    """

    @pytest.fixture
    def robo(self, monkeypatch):
        """Um TikTok Studio de mentira, que registra a ordem dos acontecimentos."""
        from app.services import tiktok_studio

        eventos: list[str] = []
        estado = {"publica": True, "explode": False, "sozinho": False}

        async def _subir(
            *, video, legenda, capa=None, marca="", publicar_sozinho=False, agendamento=None
        ):
            eventos.append(f"subiu:{Path(video).parent.name}")
            estado["agendamento"] = agendamento
            if estado["explode"]:
                raise RoteiroInterrompido(Passo.SESSAO, "este Chrome nao esta logado no TikTok")
            estado["sozinho"] = publicar_sozinho
            return {
                "passos": [],
                "resumo": "ok",
                "avisos": estado.get("avisos", []),
                "publicado": publicar_sozinho,
            }

        async def _aguardar(*, marca="", segundos=None, parar=None):
            eventos.append(f"esperou:{marca[:16]}")
            if estado.get("segura"):
                # D-591: imita a vigília real — só sai quando o lote dá o sinal.
                await _esperar_ate(lambda: parar is not None and parar.is_set())
                return False
            return estado["publica"]

        monkeypatch.setattr(tiktok_studio, "subir_assistido", _subir)
        monkeypatch.setattr(tiktok_studio, "aguardar_publicacao", _aguardar)
        return eventos, estado

    @pytest.mark.asyncio
    async def test_o_proximo_so_comeca_quando_o_anterior_sai(self, ambiente, robo):
        """Uma aba de upload por vez — não é lentidão, é o que impede a vigília
        de marcar o vídeo errado como publicado (D-512)."""
        _, raias = ambiente
        eventos, _ = robo

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        await _rodar(raias)

        assert [e.split(":")[0] for e in eventos] == ["subiu", "esperou", "subiu", "esperou"]
        assert eventos[0] == "subiu:s-demo-1" or eventos[0].startswith("subiu:")
        assert all(i.estado is EstadoItem.PUBLICADO for i in lote.itens)

    @pytest.mark.asyncio
    async def test_o_item_diz_sua_vez_enquanto_espera_o_clique(self, ambiente, robo):
        """A tela não pode fingir que a máquina ainda trabalha por meia hora."""
        _, raias = ambiente
        _, estado = robo
        vistos: list[EstadoItem] = []

        original = lote_svc._mudar

        async def _espiar(item, novo_estado, **kwargs):
            vistos.append(novo_estado)
            await original(item, novo_estado, **kwargs)

        lote_svc._mudar = _espiar
        try:
            await lote_svc.criar(
                alvos=[(lote_svc.ALVO_SHORT, "s1")],
                plataformas=[Plataforma.TIKTOK],
                opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
            )
            await _rodar(raias)
        finally:
            lote_svc._mudar = original

        assert vistos == [EstadoItem.PREPARANDO, EstadoItem.SUA_VEZ, EstadoItem.PUBLICADO]

    @pytest.mark.asyncio
    async def test_vigilia_inconclusiva_deixa_o_botao_publiquei_a_mao(self, ambiente, robo):
        """`False` da vigília é "não sei", não "não publicou" — e marcar no
        escuro liberaria a limpeza do MP4."""
        _, raias = ambiente
        _, estado = robo
        estado["publica"] = False

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        await _rodar(raias)

        assert lote.itens[0].estado is EstadoItem.SUA_VEZ
        assert "marque aqui" in lote.itens[0].detalhe

    @pytest.mark.asyncio
    async def test_os_avisos_do_robo_chegam_junto_do_sua_vez(self, ambiente, robo):
        """D-588: é DURANTE a espera que o operador pode pôr a capa que o robô
        não pôs. Mostrar o aviso só no fim seria avisar com o post já no ar."""
        _, raias = ambiente
        _, estado = robo
        estado["publica"] = False
        estado["avisos"] = ["a capa nao entrou"]
        detalhes: list[str] = []

        original = lote_svc._mudar

        async def _espiar(item, novo_estado, **kwargs):
            if novo_estado is EstadoItem.SUA_VEZ:
                detalhes.append(kwargs.get("detalhe", ""))
            await original(item, novo_estado, **kwargs)

        lote_svc._mudar = _espiar
        try:
            await lote_svc.criar(
                alvos=[(lote_svc.ALVO_SHORT, "s1")],
                plataformas=[Plataforma.TIKTOK],
                opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
            )
            await _rodar(raias)
        finally:
            lote_svc._mudar = original

        espera, fim = detalhes
        assert "confira e clique em Publicar" in espera
        assert "a capa nao entrou" in espera
        assert "marque aqui" in fim
        assert "a capa nao entrou" in fim

    @pytest.mark.asyncio
    async def test_publiquei_solta_a_vigilia_e_a_raia_segue(self, ambiente, robo):
        """D-591, o relato: "subiu o primeiro, mas os demais ficaram parados".

        O banco de PROD mostrou o item 1 marcado pelo "publiquei" e os outros
        em `aguardando`: a marcação mudava o estado, mas a raia seguia presa na
        vigília por até meia hora.
        """
        _, raias = ambiente
        eventos, estado = robo
        estado["segura"] = True

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        tarefa = asyncio.create_task(_rodar(raias))
        primeiro, segundo = lote.itens

        await _esperar_ate(lambda: primeiro.estado is EstadoItem.SUA_VEZ)
        assert await lote_svc.confirmar("s1", Plataforma.TIKTOK)
        await _esperar_ate(lambda: segundo.estado is EstadoItem.SUA_VEZ)

        # A raia não rebaixou a confirmação do operador para SUA_VEZ.
        assert primeiro.estado is EstadoItem.PUBLICADO
        assert primeiro.detalhe == lote_svc.CONFIRMADO_A_MAO

        assert await lote_svc.confirmar("s2", Plataforma.TIKTOK)
        await asyncio.wait_for(tarefa, timeout=2)
        assert [e.split(":")[0] for e in eventos] == ["subiu", "esperou", "subiu", "esperou"]
        assert all(i.estado is EstadoItem.PUBLICADO for i in lote.itens)

    @pytest.mark.asyncio
    async def test_cancelar_solta_a_vigilia_em_curso(self, ambiente, robo):
        """D-591: o botão "Cancelar o lote" que não fazia nada.

        O item em curso termina em SUA_VEZ, com o "publiquei" à mão — o operador
        pode ter publicado antes de cancelar. O que esperava vira CANCELADO.
        """
        _, raias = ambiente
        eventos, estado = robo
        estado["segura"] = True

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        tarefa = asyncio.create_task(_rodar(raias))
        primeiro, segundo = lote.itens

        await _esperar_ate(lambda: primeiro.estado is EstadoItem.SUA_VEZ)
        assert await lote_svc.cancelar() is lote
        assert segundo.estado is EstadoItem.CANCELADO

        await asyncio.wait_for(tarefa, timeout=2)
        assert primeiro.estado is EstadoItem.SUA_VEZ
        assert "marque aqui" in primeiro.detalhe
        assert lote.terminou
        assert [e.split(":")[0] for e in eventos] == ["subiu", "esperou"]

    @pytest.mark.asyncio
    async def test_publicar_sozinho_dispensa_a_vigilia(self, ambiente, robo):
        _, raias = ambiente
        eventos, estado = robo

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True, publicar_sozinho=True),
        )
        await _rodar(raias)

        assert estado["sozinho"] is True
        assert not any(e.startswith("esperou") for e in eventos)
        assert lote.itens[0].estado is EstadoItem.PUBLICADO

    @pytest.mark.asyncio
    async def test_robo_que_tropeca_para_a_raia_inteira(self, ambiente, robo):
        """Sessão caída ou layout novo é causa COMPARTILHADA: insistir só abriria
        mais cinco janelas para falhar igual."""
        _, raias = ambiente
        _, estado = robo
        estado["explode"] = True

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        await _rodar(raias)

        assert lote.itens[0].estado is EstadoItem.ERRO
        assert lote.itens[1].estado is EstadoItem.AGUARDANDO
        assert "ficaram esperando" in lote.avisos[Plataforma.TIKTOK.value]

    @pytest.mark.asyncio
    async def test_sem_o_interruptor_o_tiktok_continua_so_montando_a_pasta(self, ambiente, robo):
        """O assistido é escolha do LOTE. Desligado, nada de Chrome."""
        _, raias = ambiente
        eventos, _ = robo
        destinos.registrar(_DestinoDePacote(Plataforma.TIKTOK))

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1")], plataformas=[Plataforma.TIKTOK]
        )
        await _rodar(raias)

        assert eventos == []
        assert lote.itens[0].estado is EstadoItem.SUA_VEZ

    @pytest.mark.asyncio
    async def test_o_registro_global_nao_e_trocado_pelo_lote(self, ambiente, robo):
        """Senão o botão avulso de cada short passaria a abrir o Chrome sozinho."""
        _, raias = ambiente
        pacote = _DestinoDePacote(Plataforma.TIKTOK)
        destinos.registrar(pacote)

        await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1")],
            plataformas=[Plataforma.TIKTOK],
            opcoes=lote_svc.OpcoesDoLote(tiktok_assistido=True),
        )
        await _rodar(raias)

        assert destinos.obter_destino(Plataforma.TIKTOK) is pacote


class TestRaiaAssistidaDoInstagram:
    """D-564 onda 3: o mesmo robô, no compositor do instagram.com."""

    @pytest.fixture
    def robo(self, monkeypatch):
        from app.services import instagram_reels

        eventos: list[str] = []
        estado = {"publica": True}

        async def _subir(*, video, legenda, capa=None, marca="", publicar_sozinho=False):
            eventos.append("subiu")
            return {"passos": [], "resumo": "ok", "avisos": [], "publicado": publicar_sozinho}

        async def _aguardar(*, marca="", segundos=None, parar=None):
            eventos.append("esperou")
            return estado["publica"]

        monkeypatch.setattr(instagram_reels, "subir_assistido", _subir)
        monkeypatch.setattr(instagram_reels, "aguardar_publicacao", _aguardar)
        return eventos, estado

    @pytest.mark.asyncio
    async def test_a_raia_do_instagram_encadeia_igual_a_do_tiktok(self, ambiente, robo):
        _, raias = ambiente
        eventos, _ = robo

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1"), (lote_svc.ALVO_SHORT, "s2")],
            plataformas=[Plataforma.INSTAGRAM_REELS],
            opcoes=lote_svc.OpcoesDoLote(instagram_assistido=True),
        )
        await _rodar(raias)

        assert eventos == ["subiu", "esperou", "subiu", "esperou"]
        assert all(i.estado is EstadoItem.PUBLICADO for i in lote.itens)

    @pytest.mark.asyncio
    async def test_os_dois_interruptores_sao_independentes(self, ambiente, robo):
        """As duas páginas quebram em dias diferentes: desligar uma não pode
        desligar a outra."""
        _, raias = ambiente
        eventos, _ = robo
        destinos.registrar(_DestinoDePacote(Plataforma.TIKTOK))

        lote = await lote_svc.criar(
            alvos=[(lote_svc.ALVO_SHORT, "s1")],
            plataformas=[Plataforma.TIKTOK, Plataforma.INSTAGRAM_REELS],
            # Instagram com robô, TikTok sem.
            opcoes=lote_svc.OpcoesDoLote(instagram_assistido=True),
        )
        await _rodar(raias)

        por_plataforma = {i.plataforma: i for i in lote.itens}
        assert eventos == ["subiu", "esperou"]
        assert por_plataforma[Plataforma.INSTAGRAM_REELS].estado is EstadoItem.PUBLICADO
        assert por_plataforma[Plataforma.TIKTOK].estado is EstadoItem.SUA_VEZ
