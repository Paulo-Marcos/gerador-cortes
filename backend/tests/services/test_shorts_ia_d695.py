"""As cenas e os ganchos do short sugeridos pela IA (D-695).

Teste de caracterização: fixa o que os dois caminhos fazem hoje — o que pedem à
IA, a quem pedem, o que devolvem ou gravam — antes de saírem do claude_ia para
os shorts. As duas referências que o movimento troca ficam no topo; o resto são
bordas: banco em memória e clientes de IA.
"""

import json

import pytest
import pytest_asyncio
from app import editorial_scaffolds, editorial_skills
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.models import Base, Corte, Projeto, Short
from app.services import shorts as shorts_store
from app.services.claude_ia import ClaudeIaService
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

sugerir_cenas = ClaudeIaService.sugerir_cenas_do_short_via_claude
sugerir_ganchos = ClaudeIaService.sugerir_ganchos_via_claude


@pytest_asyncio.fixture
async def banco(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(shorts_store, "AsyncSessionLocal", factory)

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
                transcricao_final=json.dumps(
                    [{"start": 0.0, "end": 20.0, "texto": "o juro composto trabalha contra"}]
                ),
            )
        )
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=30.0,
                gancho="a curadoria gostou da virada",
            )
        )
        db.add(
            Short(
                id="s0",
                corte_id="c1",
                numero=2,
                inicio_seg=30.0,
                fim_seg=60.0,
                gancho_tela="ninguem te conta isso",
            )
        )
        await db.commit()
    yield factory
    await engine.dispose()


@pytest.fixture(autouse=True)
def skill_e_scaffold(monkeypatch):
    """A skill do canal é fixa; o scaffold é o default versionado."""
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key,
            corpo=f"expertise de {key}",
            modelo="sonnet",
            thinking_tokens=0,
            timeout=120.0,
            lentes=[],
            modelo_gemini="gemini-qualidade",
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: editorial_scaffolds._default_scaffold(
            editorial_scaffolds._exigir_catalogo(key)
        ),
    )


@pytest.fixture
def ia(monkeypatch):
    """Registra cada chamada; JSON para as cenas, texto para os ganchos."""
    chamadas: list[dict] = []
    resposta = {
        "json": {"cenas": [{"tipo": "hook", "inicio": 0, "fim": 3, "texto": "olha isso"}]},
        "texto": "o juro trabalha contra voce\nninguem te conta isso\nvoce paga duas vezes",
    }

    def _cliente(nome, chave):
        async def _gerar(prompt, **argumentos):
            chamadas.append({"cliente": nome, "prompt": prompt, **argumentos})
            return resposta[chave]

        return _gerar

    monkeypatch.setattr(claude_cli_client, "generate_json", _cliente("claude", "json"))
    monkeypatch.setattr(claude_cli_client, "generate_text", _cliente("claude", "texto"))
    monkeypatch.setattr(antigravity_cli_client, "generate_json", _cliente("gemini", "json"))
    monkeypatch.setattr(antigravity_cli_client, "generate_text", _cliente("gemini", "texto"))
    return chamadas, resposta


# ─── As cenas ───


@pytest.mark.asyncio
async def test_as_cenas_aceitas_sao_gravadas_no_short(banco, ia):
    chamadas, _ = ia

    resultado = await sugerir_cenas("s1")

    assert [cena["tipo"] for cena in resultado["short"]["cenas"]] == ["hook"]
    assert resultado["descartes"] == []
    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["skill"]) == ("claude", "cenas-short-expert")
    contexto = chamada["contexto"]
    assert (contexto.projeto_id, contexto.corte_id, contexto.short_id) == ("proj-1", "c1", "s1")
    assert "o juro composto trabalha contra" in chamada["prompt"]


@pytest.mark.asyncio
async def test_cena_que_nao_serve_vira_descarte_explicado(banco, ia):
    _, resposta = ia
    resposta["json"] = {"cenas": [{"tipo": "cta", "inicio": 1, "fim": 4, "texto": "assista"}]}

    resultado = await sugerir_cenas("s1")

    assert resultado["short"]["cenas"] == []
    assert len(resultado["descartes"]) == 1


@pytest.mark.asyncio
async def test_as_cenas_pelo_gemini_usam_o_modelo_gemini(banco, ia):
    chamadas, _ = ia

    await sugerir_cenas("s1", "gemini")

    assert (chamadas[0]["cliente"], chamadas[0]["model"]) == ("gemini", "gemini-qualidade")


# ─── Os ganchos ───


@pytest.mark.asyncio
async def test_os_ganchos_ja_usados_no_canal_nao_voltam(banco, ia):
    chamadas, _ = ia

    variacoes = await sugerir_ganchos("s1")

    assert variacoes == ["O juro trabalha contra voce", "Voce paga duas vezes"]
    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["skill"]) == ("claude", "gancho-short-expert")
    assert "a curadoria gostou da virada" in chamada["prompt"]
    assert "ninguem te conta isso" in chamada["prompt"]


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup_sem_chamar_a_ia(banco, ia):
    chamadas, _ = ia

    with pytest.raises(LookupError):
        await sugerir_ganchos("nao-existe")
    with pytest.raises(LookupError):
        await sugerir_cenas("nao-existe")

    assert chamadas == []
