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
