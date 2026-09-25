"""D-454: a orquestração da sugestão de shorts via Claude.

O que este arquivo protege é a JUNTA: o scaffold versionado e o builder do
`claude_ia` precisam concordar sobre os placeholders. Se alguém acrescentar um
`{campo}` no template pela UI ou renomear um argumento aqui, o erro só apareceria
em produção, no meio de uma geração de bruto — `str.format` levanta `KeyError` e
a esteira perderia a etapa em silêncio.

Por isso o teste usa o TEMPLATE REAL de `examples/`, e só o cliente do Claude é
dublê.
"""

import json
from pathlib import Path

import pytest
import pytest_asyncio
from app.models import Base, Corte, Projeto
from app.services import claude_ia
from app.services import shorts as shorts_store
from app.services.canal import editorial_scaffolds, editorial_skills
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_TEMPLATE_REAL = (
    Path(__file__).resolve().parents[2].parent
    / "examples"
    / "instance.example"
    / "editorial"
    / "scaffolds"
    / "shorts.txt"
)


@pytest_asyncio.fixture
async def ambiente(monkeypatch):
    """Banco em memória + skill/scaffold resolvidos sem tocar o settings.db real."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(shorts_store, "AsyncSessionLocal", factory)

    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key,
            corpo="expertise de shorts",
            modelo="sonnet",
            thinking_tokens=6000,
            timeout=300.0,
            lentes=[],
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: _TEMPLATE_REAL.read_text(encoding="utf-8"),
    )

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
                duracao_clip_seg=180.0,
                transcricao_final=json.dumps(
                    [
                        {"start": 0.0, "texto": "ninguem te conta isso sobre juros"},
                        {"start": 60.0, "texto": "e por isso que a conta nao fecha"},
                    ]
                ),
            )
        )
        await db.commit()

    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_prompt_leva_a_transcricao_do_bruto_e_a_faixa(ambiente, monkeypatch):
    capturado = {}

    async def _fake_generate_json(prompt, **kwargs):
        capturado["prompt"] = prompt
        capturado["kwargs"] = kwargs
        return {"shorts": []}

    monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", _fake_generate_json)

    await shorts_store.sugerir_shorts("c1")

    prompt = capturado["prompt"]
    assert "[00:00] ninguem te conta isso sobre juros" in prompt
    assert "[01:00] e por isso que a conta nao fecha" in prompt
    assert "15 a 90 segundos" in prompt
    assert "5 a 8" in prompt
    assert "O erro dos juros" in prompt
    # A telemetria de chamadas de IA (D-353) precisa saber de quem foi a chamada.
    assert capturado["kwargs"]["contexto"].corte_id == "c1"


@pytest.mark.asyncio
async def test_candidatos_validos_sao_persistidos_e_os_invalidos_reportados(ambiente, monkeypatch):
    async def _fake_generate_json(prompt, **kwargs):
        return {
            "shorts": [
                {
                    "titulo": "A conta que nao fecha",
                    "gancho": "ninguem te conta isso",
                    "inicio": "00:10",
                    "fim": "01:00",
                    "score": 9,
                    "justificativa": "abre no gancho e remata",
                },
                {
                    "titulo": "fora do bruto",
                    "inicio": "10:00",
                    "fim": "10:40",
                    "score": 8,
                },
            ]
        }

    monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", _fake_generate_json)

    resultado = await shorts_store.sugerir_shorts("c1")

    assert [s["titulo"] for s in resultado["shorts"]] == ["A conta que nao fecha"]
    assert resultado["shorts"][0]["duracao_seg"] == 50.0
    assert any("depois do fim do bruto" in d for d in resultado["descartes"])

    assert [s["titulo"] for s in await shorts_store.listar_shorts("c1")] == [
        "A conta que nao fecha"
    ]
