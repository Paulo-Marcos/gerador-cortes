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
