"""D-455: endpoints da fábrica de shorts.

O POST existe para o caso que o automático não cobre: o corte virou Fire depois
de o bruto já estar pronto, ou a skill mudou em `/canais` e você quer o palpite
novo sem regerar o vídeo.

Molde de `test_avaliacao_cortes_router`: SQLite em memória, só este router numa
app FastAPI nova.
"""

import json

import pytest
import pytest_asyncio
from app import editorial_scaffolds, editorial_skills
from app.models import Base, Corte, Projeto
from app.routers import shorts as router_mod
from app.services import claude_ia
from app.services import shorts as service_mod
from fastapi import FastAPI
from fastapi.testclient import TestClient
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
    monkeypatch.setattr(service_mod, "AsyncSessionLocal", factory)

    # Sem isto o teste resolveria skill e scaffold no settings.db REAL do canal
    # ativo — lento e com efeito colateral fora do tmp.
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key, corpo="expertise", modelo="sonnet", thinking_tokens=0, timeout=60.0, lentes=[]
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: (
            "{titulo} {tema_central} {duracao_humana} "
            "{quantidade_alvo} {faixa_duracao} {texto_transcricao}"
        ),
    )

    async with factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="proj-1",
                numero=1,
                titulo_proposto="Titulo",
                inicio_seg=0.0,
                fim_seg=120.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:02:00.000",
                duracao_clip_seg=120.0,
                transcricao_final=json.dumps([{"start": 0.0, "texto": "fala"}]),
            )
        )
        db.add(
            Corte(
                id="c-sem-bruto",
                projeto_id="proj-1",
                numero=2,
                titulo_proposto="Sem bruto",
                inicio_seg=0.0,
                fim_seg=60.0,
                inicio_hms="00:00:00.000",
                fim_hms="00:01:00.000",
                transcricao_final="[]",
            )
        )
        await db.commit()

    yield factory
    await engine.dispose()


@pytest.fixture()
def client(session_factory) -> TestClient:
    app = FastAPI()
    app.include_router(router_mod.router, prefix="/api/shorts")
    return TestClient(app)


def test_lista_vazia_quando_nunca_sugeriu(client):
    resposta = client.get("/api/shorts/corte/c1")

    assert resposta.status_code == 200
    assert resposta.json() == {"shorts": []}


def test_sugerir_agora_persiste_e_devolve_os_candidatos(client, monkeypatch):
    async def _fake_generate_json(prompt, **kwargs):
        return {
            "shorts": [
                {
                    "titulo": "O trecho bom",
                    "gancho": "olha isso",
                    "inicio": "00:05",
                    "fim": "00:50",
                    "score": 9,
                }
            ]
        }

    monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", _fake_generate_json)

    resposta = client.post("/api/shorts/corte/c1/sugerir")

    assert resposta.status_code == 200
    assert [s["titulo"] for s in resposta.json()["shorts"]] == ["O trecho bom"]
    assert [s["titulo"] for s in client.get("/api/shorts/corte/c1").json()["shorts"]] == [
        "O trecho bom"
    ]


def test_corte_inexistente_vira_404(client):
    assert client.post("/api/shorts/corte/nao-existe/sugerir").status_code == 404


def test_corte_sem_bruto_vira_422(client):
    assert client.post("/api/shorts/corte/c-sem-bruto/sugerir").status_code == 422


class TestSimularPalco:
    """D-500: o palco que ESTES ajustes dariam, sem gravar nada.

    É a rota que o arraste chama ~12 vezes por segundo. Duas coisas dela são
    contrato e não detalhe: o corpo chega inteiro ao serviço (senão a prévia
    desenha outro enquadramento) e nada aqui escreve no banco.
    """

    @pytest.fixture()
    def espiao(self, monkeypatch):
        from app.services import palco_shorts

        recebidos: list[tuple[str, dict]] = []

        async def _fake(short_id, ajustes_hipoteticos=None):
            if short_id == "sumido":
                raise LookupError("short nao encontrado")
            recebidos.append((short_id, ajustes_hipoteticos))
            return {"modelo": "pessoa_cheia", "recortes": [], "slots": {}}

        monkeypatch.setattr(palco_shorts, "plano_desenhavel", _fake)
        return recebidos

    def test_os_ajustes_chegam_ao_servico(self, client, espiao):
        ajustes = {"pessoa": {"x": 40, "y": 900, "w": 500, "h": 500}}

        resposta = client.post("/api/shorts/s1/palco/simular", json={"ajustes_palco": ajustes})

        assert resposta.status_code == 200
        assert espiao == [("s1", ajustes)]

    def test_corpo_vazio_e_o_plano_gravado(self, client, espiao):
        resposta = client.post("/api/shorts/s1/palco/simular", json={})

        assert resposta.status_code == 200
        assert espiao[0][1] == {}

    def test_short_inexistente_e_404(self, client, espiao):
        resposta = client.post("/api/shorts/sumido/palco/simular", json={"ajustes_palco": {}})

        assert resposta.status_code == 404


class TestSugerirCenas:
    """D-497: a IA propoe os cartoes de UM trecho.

    O que o teste guarda nao e a qualidade do palpite — e o CONTRATO: o prompt
    recebe a transcricao do trecho no relogio do short, e o que volta ja esta
    gravado. O modelo e trocado por um dublê; a chamada real custa dinheiro e
    devolve coisa diferente a cada vez.
    """

    @pytest_asyncio.fixture
    async def short(self, session_factory):
        from app.models import Short

        async with session_factory() as db:
            corte = await db.get(Corte, "c1")
            corte.transcricao_final = json.dumps(
                [
                    {"start": 0.0, "fim": 8.0, "texto": "abertura que fica de fora"},
                    {"start": 10.0, "fim": 18.0, "texto": "o dado importante e trinta por cento"},
                    {"start": 20.0, "fim": 28.0, "texto": "o fecho do raciocinio"},
                ]
            )
            db.add(
                Short(
                    id="s-cenas",
                    corte_id="c1",
                    numero=1,
                    inicio_seg=10.0,
                    fim_seg=30.0,
                    titulo_sugerido="O trecho",
                    gancho="olha o dado",
                )
            )
            # Um trecho cuja janela cai depois do fim da fala: o caso "sem
            # transcricao" acontece de verdade quando o operador marca um
            # trecho no silencio do fim do bruto.
            db.add(Short(id="s-mudo", corte_id="c1", numero=2, inicio_seg=200.0, fim_seg=220.0))
            await db.commit()
        return session_factory

    @pytest.fixture()
    def modelo(self, monkeypatch):
        """Captura o prompt e devolve o que mandarmos.

        O scaffold da fixture geral e o de PROPOR SHORTS (outros placeholders);
        aqui ele e trocado pelo desta etapa, senao o `.format` estoura antes de
        a chamada acontecer.
        """
        monkeypatch.setattr(
            editorial_scaffolds,
            "resolver_scaffold",
            lambda key, **kw: (
                "{titulo} {gancho} {duracao_humana} {tipos_disponiveis} {texto_transcricao}"
            ),
        )
        capturado: dict = {}

        def responder(resposta):
            async def _fake(prompt, **kwargs):
                capturado["prompt"] = prompt
                return resposta

            monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", _fake)
            return capturado

        return responder

    def test_o_prompt_leva_so_a_fala_do_trecho(self, client, short, modelo):
        capturado = modelo({"cenas": []})

        client.post("/api/shorts/s-cenas/cenas/sugerir")

        assert "o dado importante" in capturado["prompt"]
        assert "abertura que fica de fora" not in capturado["prompt"]

    def test_o_prompt_conta_o_tempo_no_relogio_do_short(self, client, short, modelo):
        """A fala do segundo 10 do bruto e o segundo ZERO do short.

        Levar o relogio do bruto faria toda cena voltar deslocada pelo inicio do
        trecho, e o sintoma apareceria so no render.
        """
        capturado = modelo({"cenas": []})

        client.post("/api/shorts/s-cenas/cenas/sugerir")

        assert "[00:00] o dado importante" in capturado["prompt"]

    def test_as_cenas_propostas_ja_ficam_gravadas(self, client, short, modelo):
        modelo(
            {
                "cenas": [
                    {"tipo": "hook", "inicio": 0, "fim": 3, "texto": "30%"},
                    {"tipo": "numero", "inicio": 5, "fim": 9, "texto": "30%", "apoio": "do total"},
                ]
            }
        )

        resposta = client.post("/api/shorts/s-cenas/cenas/sugerir")

        assert resposta.status_code == 200
        assert [c["tipo"] for c in resposta.json()["short"]["cenas"]] == ["hook", "numero"]
        gravadas = client.get("/api/shorts/corte/c1").json()["shorts"][0]["cenas"]
        assert len(gravadas) == 2

    def test_o_descarte_volta_com_o_motivo(self, client, short, modelo):
        """Sem isso a IA "propoe duas" e a tela mostra uma, sem explicacao."""
        modelo(
            {
                "cenas": [
                    {"tipo": "citacao", "inicio": 5, "fim": 9, "texto": "vale"},
                    {"tipo": "cta", "inicio": 1, "fim": 4, "texto": "cedo demais"},
                ]
            }
        )

        corpo = client.post("/api/shorts/s-cenas/cenas/sugerir").json()

        assert len(corpo["short"]["cenas"]) == 1
        assert len(corpo["descartes"]) == 1

    def test_trecho_sem_fala_e_422_com_o_porque(self, client, short, modelo):
        """Cena inventada sobre um titulo e o cartao que repete o que o video diz."""
        modelo({"cenas": []})

        resposta = client.post("/api/shorts/s-mudo/cenas/sugerir")

        assert resposta.status_code == 422
        assert "fala" in resposta.json()["detail"]

    def test_short_inexistente_e_404(self, client, short, modelo):
        modelo({"cenas": []})

        assert client.post("/api/shorts/sumido/cenas/sugerir").status_code == 404


class TestEnquadrarPeloRosto:
    """D-477: achar o rosto e centrar o 9:16 nele.

    O detector e trocado por um dublê: rodar cv2 sobre um bruto de mentira aqui
    testaria o cv2, nao a rota. O que se guarda e o contrato — o foco fica
    GRAVADO quando acha, NADA muda quando nao acha, e cada falha tem o seu
    proprio codigo.
    """

    @pytest_asyncio.fixture
    async def short(self, session_factory, tmp_path, monkeypatch):
        from app.models import Short
        from app.services import enquadramento_shorts

        bruto = tmp_path / "bruto.mkv"
        bruto.write_bytes(b"x" * 512)
        monkeypatch.setattr(enquadramento_shorts, "AsyncSessionLocal", session_factory)
        monkeypatch.setattr("app.services.render_short._bruto_em_disco", lambda corte: bruto)

        async with session_factory() as db:
            db.add(Short(id="s-foco", corte_id="c1", numero=1, inicio_seg=5.0, fim_seg=35.0))
            await db.commit()
        return session_factory

    @pytest.fixture()
    def detector(self, monkeypatch):
        from app.domain.enquadramento_rosto import RostoDetectado
        from app.services import enquadramento_shorts

        def responder(quadros):
            async def _fake(video, instantes):
                return [
                    [RostoDetectado(centro_x=x, largura=0.3)] if x is not None else []
                    for x in quadros
                ]

            monkeypatch.setattr(enquadramento_shorts, "detectar_nos_instantes", _fake)

        return responder

    async def _foco_no_banco(self, factory):
        from app.models import Short

        async with factory() as db:
            return (await db.get(Short, "s-foco")).foco_x

    def test_o_foco_achado_fica_gravado(self, client, short, detector):
        """Sem gravar, o operador nao teria como julgar: foco e um numero, e o
        que se julga e a janela 9:16 andando sobre o quadro."""
        detector([0.8, 0.81, 0.79])

        corpo = client.post("/api/shorts/s-foco/enquadrar").json()

        assert corpo["achou"] is True
        assert corpo["short"]["foco_x"] == pytest.approx(0.8, abs=0.01)

    def test_sem_rosto_nada_e_gravado(self, client, short, detector):
        """0.5 gravado seria indistinguivel de o detector ter escolhido o centro."""
        detector([None, None, None])

        corpo = client.post("/api/shorts/s-foco/enquadrar").json()

        assert corpo["achou"] is False
        assert corpo["foco_x"] is None
        assert corpo["short"]["foco_x"] is None

    def test_a_resposta_diz_em_quantos_quadros_achou(self, client, short, detector):
        detector([0.8, None, 0.82, None])

        corpo = client.post("/api/shorts/s-foco/enquadrar").json()

        assert corpo["quadros_com_rosto"] == 2
        assert corpo["quadros_analisados"] == 4

    def test_pessoa_que_anda_ganha_aviso_mas_e_enquadrada(self, client, short, detector):
        detector([0.2, 0.5, 0.8])

        corpo = client.post("/api/shorts/s-foco/enquadrar").json()

        assert corpo["achou"] is True
        assert corpo["aviso"]

    def test_rosto_parado_nao_gera_aviso(self, client, short, detector):
        detector([0.6, 0.61, 0.6])

        assert client.post("/api/shorts/s-foco/enquadrar").json()["aviso"] == ""

    def test_sem_bruto_em_disco_e_422(self, client, short, detector, monkeypatch):
        detector([0.8])
        monkeypatch.setattr("app.services.render_short._bruto_em_disco", lambda corte: None)

        resposta = client.post("/api/shorts/s-foco/enquadrar")

        assert resposta.status_code == 422

    def test_detector_indisponivel_e_503_e_nao_422(self, client, short, monkeypatch):
        """O trecho esta bom; quem faltou foi o detector.

        A tela precisa dizer "tente de novo", nao "arrume o corte".
        """
        from app.services import enquadramento_shorts

        async def _explode(video, instantes):
            raise enquadramento_shorts.DeteccaoIndisponivel("sem OpenCV")

        monkeypatch.setattr(enquadramento_shorts, "detectar_nos_instantes", _explode)

        assert client.post("/api/shorts/s-foco/enquadrar").status_code == 503

    def test_short_inexistente_e_404(self, client, short, detector):
        detector([0.8])

        assert client.post("/api/shorts/sumido/enquadrar").status_code == 404


class TestPresetDePalcoDoShort:
    """D-509: os presets de palco do SHORT, com catalogo proprio.

    O short so sabia SELECIONAR presets do canal — e os nomes deles sao cenas do
    OBS ("Comp. 2 OBS", "FULL OBS"), vocabulario do horizontal. Agora ele guarda
    os proprios, com o que o palco vertical precisa: arranjo, janela cheia,
    recortes e fundo.
    """

    @pytest.fixture()
    def app_presets(self, session_factory):
        """O router de presets com a sessao do TESTE.

        Ele resolve o banco por `Depends(get_db)`, e nao pelo
        `AsyncSessionLocal` que o resto deste arquivo troca. Sem o override, os
        presets iam parar no banco de DESENVOLVIMENTO — e o teste passava por
        coincidencia enquanto o banco estivesse limpo. Mesma armadilha que a
        D-488 pagou no render.
        """
        from app.database import get_db
        from app.routers import presets as presets_mod

        async def _sessao_do_teste():
            # Espelha o `get_db` de verdade, inclusive o COMMIT na saida: o
            # router so faz `flush`, e sem o commit aqui o preset nasceria e
            # sumiria dentro da mesma requisicao.
            async with session_factory() as db:
                try:
                    yield db
                    await db.commit()
                except Exception:
                    await db.rollback()
                    raise

        app = FastAPI()
        app.include_router(presets_mod.router, prefix="/api/presets")
        app.dependency_overrides[get_db] = _sessao_do_teste
        return TestClient(app)

    def _payload(self, **over):
        base = {
            "arranjo": "dividida_empilhada",
            "janela_cheia": "",
            "recortes": {"pessoa": {"x": 10, "y": 20, "w": 300, "h": 200}},
            "fundo": "marromQuente",
        }
        return {**base, **over}

    def test_grava_e_devolve_o_palco_inteiro(self, app_presets):
        resposta = app_presets.post(
            "/api/presets/layout",
            json={"nome": "Rosto cheio", "tipo": "palco_short", "payload": self._payload()},
        )

        assert resposta.status_code in (200, 201)
        payload = resposta.json()["payload"]
        assert payload["arranjo"] == "dividida_empilhada"
        assert payload["fundo"] == "marromQuente"
        assert payload["recortes"]["pessoa"]["w"] == 300

    def test_recorte_sem_area_e_descartado_e_nao_corrigido(self, app_presets):
        """Um preset que "conserta" um recorte quebrado aplicaria uma janela que
        ninguem marcou — e o operador veria o enquadramento errado sem saber de
        onde veio."""
        resposta = app_presets.post(
            "/api/presets/layout",
            json={
                "nome": "Torto",
                "tipo": "palco_short",
                "payload": self._payload(
                    recortes={
                        "pessoa": {"x": 0, "y": 0, "w": 0, "h": 100},
                        "tela": {"x": 5, "y": 5, "w": 50, "h": 50},
                    }
                ),
            },
        )

        recortes = resposta.json()["payload"]["recortes"]
        assert "pessoa" not in recortes
        assert "tela" in recortes

    def test_chave_ausente_vira_vazio_e_nao_default_inventado(self, app_presets):
        """Vazio e HERANCA: o resolvedor deduz. Materializar um default aqui
        congelaria o palco do dia em que o preset foi salvo."""
        resposta = app_presets.post(
            "/api/presets/layout",
            json={"nome": "So o fundo", "tipo": "palco_short", "payload": {"fundo": "branco"}},
        )

        payload = resposta.json()["payload"]
        assert payload["arranjo"] == ""
        assert payload["janela_cheia"] == ""
        assert payload["recortes"] == {}

    def test_o_tipo_separa_os_catalogos(self, app_presets):
        """Os presets do horizontal continuam servindo de atalho para os
        recortes; o que nao pode e o short listar cenas do OBS como se fossem
        palcos dele."""
        app_presets.post(
            "/api/presets/layout",
            json={"nome": "Do short", "tipo": "palco_short", "payload": self._payload()},
        )

        so_do_short = app_presets.get("/api/presets/layout?tipo=palco_short").json()

        assert [p["nome"] for p in so_do_short] == ["Do short"]


class TestSugestoesDeGancho:
    """D-573: as propostas da IA sobrevivem ao fechar o modal."""

    def test_json_textos_descarta_o_que_nao_e_string(self):
        """A tela chama `.trim()` em cada item.

        Um objeto entre eles derruba a ROTA inteira com
        "texto.trim is not a function" — nao so o modal. Garantir o tipo na
        leitura e a mesma regra do `fundo_editorial` na D-554: degrada, nunca
        quebra.
        """
        from app.services.shorts import _json_textos

        assert _json_textos('["um", {"texto": "dois"}, 3, "  ", "tres"]') == ["um", "tres"]

    def test_json_textos_aguenta_lixo_no_lugar_da_lista(self):
        from app.services.shorts import _json_textos

        assert _json_textos("nao e json") == []
        assert _json_textos('{"variacoes": []}') == []
        assert _json_textos(None) == []
