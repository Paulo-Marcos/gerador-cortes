"""D-466: a orquestração do render do short.

O que este arquivo guarda é a ORDEM e o que cada passo recebe. Errar aqui não
produz exceção: produz um MP4 com a legenda gradada junto com o vídeo, ou com o
recorte no lugar errado — coisas que só se veem assistindo.

O worker é dublê. Rodar ffmpeg e Remotion de verdade aqui levaria minutos e
exigiria bruto, bundle e headless shell; o que precisa de teste é a decisão,
não a execução.
"""

import json

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto, Short, StatusShort
from app.services import render_short
from app.services.transcricao_fiel import TranscricaoFiel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def ambiente(monkeypatch, tmp_path):
    from app import channel_paths
    from app.services import legendas_short, transcricao_fiel

    monkeypatch.setattr(channel_paths, "projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(render_short, "projetos_dir", lambda: tmp_path)

    corte_dir = tmp_path / "p1" / "cortes" / "c1"
    corte_dir.mkdir(parents=True)
    (corte_dir / "clip_raw_1.mkv").write_bytes(b"x" * 2048)

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(render_short, "AsyncSessionLocal", factory)

    async def _transcricao(corte_id):
        return TranscricaoFiel(palavras=[], fonte="auto_legenda")

    monkeypatch.setattr(transcricao_fiel, "obter_do_corte", _transcricao)
    monkeypatch.setattr(legendas_short.transcricao_fiel, "obter_do_corte", _transcricao)

    # D-481: o bruto destes testes e um arquivo de mentira, entao o ffprobe nao
    # o mede. O render agora EXIGE a medida — presumir 1920x1080 foi o que
    # estourou o crop em PROD — entao aqui a medida vem mockada.
    async def _resolucao(_path):
        return (1920, 1080)

    monkeypatch.setattr(render_short, "probe_resolucao", _resolucao)

    # E-036/D-488: o render passou a consultar `palco_shorts`, que tem a PROPRIA
    # sessao. Sem trocar tambem a dele, o teste lia o banco de desenvolvimento
    # de verdade — e passava por coincidencia, porque la existe um short com o
    # mesmo id "s1" deste fixture.
    from app.services import palco_shorts

    monkeypatch.setattr(palco_shorts, "AsyncSessionLocal", factory)

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
                arquivo_clip_path="cortes/c1/clip_raw_1.mkv",
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=10.0,
                fim_seg=45.0,
                cenas_remotion=json.dumps([{"tipo": "hook", "inicio": 0, "fim": 2, "texto": "oi"}]),
            )
        )
        await db.commit()

    yield factory, tmp_path
    await engine.dispose()


@pytest.fixture
def jobs(monkeypatch):
    """Captura os despachos em vez de rodar ffmpeg/Remotion de verdade."""
    capturados: list[dict] = []

    async def _fake(job_id, cmd, *, cwd, category, timeout):
        capturados.append({"id": job_id, "cmd": cmd, "cwd": cwd, "category": category})

    monkeypatch.setattr(render_short, "_despachar", _fake)
    return capturados


@pytest.mark.asyncio
async def test_os_tres_passos_saem_na_ordem(ambiente, jobs):
    await render_short.renderizar_short("s1")

    # D-483: o estagio entrou no id. Previa e final compartilham os tres passos,
    # entao sem isso um job sobrescreveria o outro na fila.
    assert [j["id"] for j in jobs] == [
        "s1_final_recorte",
        "s1_final_camada",
        "s1_final_composicao",
    ]


@pytest.mark.asyncio
async def test_recorte_usa_o_intervalo_do_short(ambiente, jobs):
    await render_short.renderizar_short("s1")

    cmd = jobs[0]["cmd"]
    assert cmd[cmd.index("-ss") + 1] == "10.0"
    assert cmd[cmd.index("-t") + 1] == "35.0"


@pytest.mark.asyncio
async def test_recorte_sai_em_9x16(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 0))["cmd"]

    assert "scale=1080:1920" in cmd[cmd.index("-vf") + 1]


@pytest.mark.asyncio
async def test_camada_renderiza_a_composicao_vertical_com_alpha(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 1))["cmd"]

    assert render_short.COMPOSICAO_CAMADA in cmd
    # ProRes 4444 e o unico codec com alpha confiavel neste projeto.
    assert "--codec=prores" in cmd


@pytest.mark.asyncio
async def test_props_da_camada_levam_captions_e_duracao(ambiente, jobs):
    _, raiz = ambiente
    await render_short.renderizar_short("s1")

    props = json.loads(
        (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
            encoding="utf-8"
        )
    )
    assert props["duracaoSeg"] == 35.0
    assert props["captions"] == []


@pytest.mark.asyncio
async def test_a_cor_da_legenda_chega_na_camada(ambiente, jobs):
    """D-563: quem pinta a palavra corrente e o Remotion, e ele so sabe o que recebe.

    A cor e escolhida na tela e gravada no short; se ela parasse no banco, a
    previa mostraria o realce novo e o arquivo sairia com o acento de sempre —
    a divergencia previa/arquivo que a D-549 custou caro para consertar.
    """
    sessao, raiz = ambiente
    async with sessao() as db:
        short = await db.get(Short, "s1")
        short.legenda_cor = "#2f5f43"
        await db.commit()

    await render_short.renderizar_short("s1")

    props = json.loads(
        (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
            encoding="utf-8"
        )
    )
    assert props["legendaCor"] == "#2f5f43"


@pytest.mark.asyncio
async def test_short_com_cenas_gravadas_nao_renderiza_texto_nenhum(ambiente, jobs):
    """D-560: as cenas estao desligadas, e o dado gravado nao ressuscita.

    Esconder so a UI deixaria um short antigo — o `s1` deste ambiente tem uma
    cena `hook` gravada — renderizando o texto dela para sempre, e sem lugar
    nenhum onde apaga-la. O interruptor tem de estar no caminho que ESCREVE o
    arquivo.
    """
    _, raiz = ambiente
    await render_short.renderizar_short("s1")

    props = json.loads(
        (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
            encoding="utf-8"
        )
    )
    assert props["cenas"] == []


class TestGanchoDaAbertura:
    """D-565: o titulo-gancho chega ao arquivo — e nao pela porta das cenas.

    Este e o ponto de juncao mais fragil da demanda. Se o gancho cair fora do
    payload, ele some do MP4 EM SILENCIO: a tela continua mostrando o texto na
    previa, o render nao falha, e o operador so descobre assistindo ao arquivo
    pronto — depois de gastar a passada boa.
    """

    @pytest.mark.asyncio
    async def test_short_sem_gancho_manda_nulo(self, ambiente, jobs):
        """Nao ter gancho e o caso COMUM, e continua sendo uma resposta valida."""
        _, raiz = ambiente
        await render_short.renderizar_short("s1")

        props = json.loads(
            (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
                encoding="utf-8"
            )
        )
        assert props["gancho"] is None

    @pytest.mark.asyncio
    async def test_gancho_escrito_chega_ao_payload(self, ambiente, jobs):
        factory, raiz = ambiente
        async with factory() as db:
            short = await db.get(Short, "s1")
            short.gancho_tela = "o juro composto trabalha contra voce"
            short.gancho_ate_seg = 2.5
            await db.commit()

        await render_short.renderizar_short("s1")

        props = json.loads(
            (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
                encoding="utf-8"
            )
        )
        assert props["gancho"] == {
            "texto": "o juro composto trabalha contra voce",
            "ateSeg": 2.5,
        }

    @pytest.mark.asyncio
    async def test_o_gancho_nao_entra_pela_porta_das_cenas(self, ambiente, jobs):
        """A separacao e estrutural, nao combinada.

        O `s1` do fixture TEM uma cena `hook` gravada. Se o gancho viajasse no
        array de cenas, religa-lo religaria aquele texto antigo junto — que e
        exatamente o que a D-560 mandou desligar. Os dois canais sao
        independentes, e `CENAS_LIGADAS` continua valendo so para um deles.
        """
        factory, raiz = ambiente
        async with factory() as db:
            short = await db.get(Short, "s1")
            short.gancho_tela = "quatro palavras aqui agora"
            await db.commit()

        await render_short.renderizar_short("s1")

        props = json.loads(
            (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
                encoding="utf-8"
            )
        )
        assert props["cenas"] == []
        assert props["gancho"]["texto"] == "quatro palavras aqui agora"

    @pytest.mark.asyncio
    async def test_gancho_nao_passa_da_duracao_do_trecho(self, ambiente, jobs):
        """O operador encurta as bordas DEPOIS de escrever o gancho.

        Sem o corte, o Remotion receberia uma sequencia maior que a composicao.
        """
        factory, raiz = ambiente
        async with factory() as db:
            short = await db.get(Short, "s1")
            short.gancho_tela = "curto"
            short.gancho_ate_seg = 5.0
            short.fim_seg = short.inicio_seg + 2.0
            await db.commit()

        await render_short.renderizar_short("s1")

        props = json.loads(
            (raiz / "p1" / "cortes" / "c1" / "shorts" / "s1" / "camada_final.props.json").read_text(
                encoding="utf-8"
            )
        )
        assert props["gancho"]["ateSeg"] == 2.0


@pytest.mark.asyncio
async def test_composicao_poe_a_camada_por_cima_do_video(ambiente, jobs):
    cmd = (await _render_e_pegar(jobs, 2))["cmd"]

    assert "overlay=x=0:y=0:eof_action=pass:format=auto" in " ".join(cmd)
    assert "-shortest" in cmd


@pytest.mark.asyncio
async def test_short_pronto_vira_renderizado_com_caminho_relativo(ambiente, jobs):
    factory, _ = ambiente

    resultado = await render_short.renderizar_short("s1")

    assert resultado["arquivo_short_path"].endswith("short.mp4")
    assert not resultado["arquivo_short_path"].startswith("C:")
    async with factory() as db:
        short = await db.get(Short, "s1")
        assert short.status == StatusShort.RENDERIZADO
        assert short.arquivo_short_path == resultado["arquivo_short_path"]


@pytest.mark.asyncio
async def test_sem_bruto_em_disco_recusa_antes_de_gastar_render(ambiente, jobs):
    factory, raiz = ambiente
    (raiz / "p1" / "cortes" / "c1" / "clip_raw_1.mkv").unlink()

    with pytest.raises(ValueError, match="bruto"):
        await render_short.renderizar_short("s1")

    assert jobs == []


@pytest.mark.asyncio
async def test_intervalo_invertido_recusa_antes_de_gastar_render(ambiente, jobs):
    factory, _ = ambiente
    async with factory() as db:
        short = await db.get(Short, "s1")
        short.fim_seg = short.inicio_seg
        await db.commit()

    with pytest.raises(ValueError, match="intervalo"):
        await render_short.renderizar_short("s1")

    assert jobs == []


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup(ambiente, jobs):
    with pytest.raises(LookupError):
        await render_short.renderizar_short("nao-existe")


async def _render_e_pegar(jobs: list[dict], indice: int) -> dict:
    await render_short.renderizar_short("s1")
    return jobs[indice]


@pytest.mark.asyncio
async def test_recorte_usa_a_resolucao_MEDIDA_do_bruto(ambiente, jobs, monkeypatch):
    """D-481: um bruto 720p tem de gerar um crop que cabe em 720p.

    Antes o comando trazia `origem=HORIZONTAL` como default e o servico nunca
    passava a medida: o crop saia 608x1080 e o ffmpeg abortava com -22. Este
    teste falha se alguem voltar a presumir.
    """

    async def _720p(_path):
        return (1280, 720)

    monkeypatch.setattr(render_short, "probe_resolucao", _720p)

    await render_short.renderizar_short("s1")

    recorte = next(j for j in jobs if j["id"].endswith("_recorte"))
    cmd = recorte["cmd"]
    vf = cmd[cmd.index("-vf") + 1]
    largura, altura = (int(v) for v in vf.split("crop=")[1].split(",")[0].split(":")[:2])

    assert altura <= 720, f"crop de {altura}px de altura num bruto de 720p"
    assert largura <= 1280


@pytest.mark.asyncio
async def test_bruto_que_nao_da_para_medir_falha_antes_de_gastar_render(
    ambiente, jobs, monkeypatch
):
    """Falhar alto e mais barato que falhar no meio do ffmpeg, com -22."""

    async def _sem_medida(_path):
        return None

    monkeypatch.setattr(render_short, "probe_resolucao", _sem_medida)

    with pytest.raises(ValueError, match="medir a resolucao"):
        await render_short.renderizar_short("s1")

    assert jobs == [], "despachou trabalho mesmo sem saber o tamanho do quadro"


# ─── D-483: os dois estagios ────────────────────────────────────────────────


def _vf_do_recorte(jobs: list[dict]) -> str:
    recorte = next(j for j in jobs if j["id"].endswith("_recorte"))
    return recorte["cmd"][recorte["cmd"].index("-vf") + 1]


@pytest.mark.asyncio
async def test_previa_sai_sem_filtro(ambiente, jobs):
    """A previa mostra o enquadramento, a legenda e as cenas — nao a cor final.

    Ela existe para julgar antes de gastar a passada boa; o filtro e justamente
    a parte cara, e a que so faz sentido no arquivo que vai publicar.
    """
    await render_short.renderizar_previa("s1")

    vf = _vf_do_recorte(jobs)

    assert vf.startswith("crop=")
    assert "," not in vf.split("setsar=1")[-1], f"sobrou grade na previa: {vf}"


@pytest.mark.asyncio
async def test_final_sai_com_filtro(ambiente, jobs, monkeypatch):
    from app.services import app_settings

    monkeypatch.setattr(
        app_settings.AppSettingsService,
        "get",
        staticmethod(lambda: type("S", (), {"filtro_global_padrao": "cinematic_iii"})()),
    )

    await render_short.renderizar_short("s1")

    assert _vf_do_recorte(jobs).count(",") > 2, "o final saiu sem grade"


@pytest.mark.asyncio
async def test_previa_nao_carimba_renderizado(ambiente, jobs):
    """Previa e rascunho, nao decisao de curadoria.

    Se ela mexesse no status, o painel de publicacao apareceria sobre um arquivo
    sem filtro — e o operador publicaria o rascunho.
    """
    await render_short.renderizar_previa("s1")

    factory, _ = ambiente
    async with factory() as db:
        short = await db.get(Short, "s1")

        assert short.status != StatusShort.RENDERIZADO.value
        assert short.arquivo_previa_path.endswith("previa.mp4")
        assert short.arquivo_short_path == ""


@pytest.mark.asyncio
async def test_final_depois_da_previa_nao_sobrescreve_o_rascunho(ambiente, jobs):
    """Os dois arquivos coexistem: comparar antes e depois e o ponto da previa."""
    await render_short.renderizar_previa("s1")
    await render_short.renderizar_short("s1")

    factory, _ = ambiente
    async with factory() as db:
        short = await db.get(Short, "s1")

        assert short.arquivo_previa_path.endswith("previa.mp4")
        assert short.arquivo_short_path.endswith("short.mp4")
        assert short.status == StatusShort.RENDERIZADO.value


@pytest.mark.asyncio
async def test_os_dois_estagios_nao_disputam_o_mesmo_intermediario(ambiente, jobs):
    """Base e camada levam o estagio no nome, senao um render pisa no outro."""
    await render_short.renderizar_previa("s1")
    await render_short.renderizar_short("s1")

    ids = [j["id"] for j in jobs]

    assert len(set(ids)) == len(ids), f"ids repetidos na fila: {ids}"


class TestMolduraChegaAoRender:
    """D-504/D-508: a assinatura do canal precisa sair NO ARQUIVO.

    O bug original (D-504): `_ContextoRender.moldura` era preenchido e nunca
    usado — o operador ligava a moldura, a previa desenhava, e o MP4 saia sem
    nada. Tinha passado porque a D-501 foi verificada com uma chamada DIRETA ao
    ffmpeg, caminho que nao passa por `render_short`.

    A D-508 trocou o MECANISMO (duas faixas chapadas viraram o palco em PNG, com
    textura e chrome) e a garantia continua a mesma: o que a tela promete tem de
    chegar ao comando. Por isso estes testes olham o comando DESPACHADO, nunca a
    funcao que desenha.
    """

    @pytest_asyncio.fixture
    async def com_palco(self, ambiente):
        """Da regiao ao corte — sem regiao nao ha palco, e sem palco nao ha moldura."""
        factory, tmp = ambiente
        async with factory() as db:
            corte = await db.get(Corte, "c1")
            corte.layout_youtube = json.dumps(
                {
                    "crop_facecam": {"x": 24, "y": 410, "w": 340, "h": 260},
                    "crop_tela": {"x": 365, "y": 180, "w": 1325, "h": 720},
                }
            )
            await db.commit()
        return factory, tmp

    @pytest.fixture
    def palco_png(self, monkeypatch, tmp_path):
        """Troca o gerador do PNG por um dublê.

        Rodar `remotion still` aqui levaria dezenas de segundos e exigiria Node
        com o bundle pronto. O que precisa de teste e se o PNG CHEGA ao comando,
        nao se o Remotion sabe desenhar.
        """
        from app.services import palco_short_png

        def instalar(caminho):
            async def _fake(fundo, janelas):
                instalar.recebido = {"fundo": fundo, "janelas": janelas}
                return caminho

            monkeypatch.setattr(palco_short_png, "obter", _fake)

        instalar.recebido = None
        pronto = tmp_path / "palco.png"
        pronto.write_bytes(b"fake-png")
        instalar.pronto = pronto
        return instalar

    def _filtro(self, job: dict) -> str:
        cmd = job["cmd"]
        return cmd[cmd.index("-filter_complex") + 1]

    def _faixas_da_moldura(self, job: dict) -> int:
        """Quantos `drawbox` sao DA MOLDURA.

        Contar `drawbox=` cru nao serve: o filtro de cinema ja desenha dois, de
        letterbox preto. Foi essa confusao que quase fez a D-501 adotar uma
        faixa de 7% dentro da tarja de 8% do filtro.
        """
        from app.services.render_short import faixas_do_canal

        cor = faixas_do_canal("palco")[0].cor
        return self._filtro(job).count(f"color={cor}")

    @pytest.mark.asyncio
    async def test_o_palco_em_png_e_empilhado_sobre_o_video(self, com_palco, jobs, palco_png):
        palco_png(palco_png.pronto)

        await render_short.renderizar_short("s1")

        assert "[1:v]overlay" in self._filtro(jobs[0]), "o palco nao chegou ao ffmpeg"
        assert str(palco_png.pronto) in jobs[0]["cmd"], "o PNG nao entrou como entrada"

    @pytest.mark.asyncio
    async def test_o_palco_recebe_as_JANELAS_e_nao_os_slots(self, com_palco, jobs, palco_png):
        """Em CABER o video sai menor que o slot e fica centralizado.

        Recortar o buraco no tamanho do SLOT deixaria uma borda de fundo em
        volta do video — um quadro vazio em torno da tela compartilhada.
        """
        palco_png(palco_png.pronto)

        await render_short.renderizar_short("s1")

        janelas = palco_png.recebido["janelas"]
        assert len(janelas) == 2
        for janela in janelas:
            assert set(janela) == {"x", "y", "w", "h"}

    @pytest.mark.asyncio
    async def test_sem_o_png_as_faixas_seguram_a_identidade(self, com_palco, jobs, palco_png):
        """Plano B: Node fora do ar nao pode significar short sem canal nenhum."""
        palco_png(None)

        await render_short.renderizar_short("s1")

        assert self._faixas_da_moldura(jobs[0]) == 2
        assert "[1:v]overlay" not in self._filtro(jobs[0])

    @pytest.mark.asyncio
    async def test_a_cor_do_plano_B_vem_do_tema(self, com_palco, jobs, palco_png, monkeypatch):
        """Cravar a cor faria o canal trocar a paleta e o short sair com a velha."""
        palco_png(None)
        monkeypatch.setattr(render_short, "cor_do_tema", lambda chave, padrao: "#ff00ff")

        await render_short.renderizar_short("s1")

        assert "color=#ff00ff" in self._filtro(jobs[0])

    @pytest.mark.asyncio
    async def test_moldura_desligada_nao_desenha_nada(self, com_palco, jobs, palco_png):
        """Nem PNG nem faixa. O letterbox do filtro continua — ele e do filtro."""
        palco_png(palco_png.pronto)
        factory, _ = com_palco
        async with factory() as db:
            short = await db.get(Short, "s1")
            short.moldura = "nenhuma"
            await db.commit()

        await render_short.renderizar_short("s1")

        assert self._faixas_da_moldura(jobs[0]) == 0
        assert "[1:v]overlay" not in self._filtro(jobs[0])


def test_textura_invalida_no_palco_cai_na_padrao_do_canal():
    """D-554: mesma regra da previa, no caminho que escreve o arquivo.

    Se so a previa normalizasse, um preset antigo daria tela certa e MP4 com um
    fundo inexistente — a divergencia silenciosa que a D-549 ja custou uma vez.
    """
    from app.domain.youtube_layout import FUNDO_PADRAO
    from app.services.render_short import _textura

    assert _textura({"fundo_editorial": "verdeProfundo"}) == FUNDO_PADRAO
    assert _textura({"fundo_editorial": ""}) == FUNDO_PADRAO
    assert _textura({}) == FUNDO_PADRAO
    assert _textura({"fundo_editorial": "cosmograph"}) == "cosmograph"
