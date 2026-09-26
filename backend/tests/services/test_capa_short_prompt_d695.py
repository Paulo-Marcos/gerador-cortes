"""O prompt da arte da capa do short, pela porta de entrada (D-695).

Teste de caracterização: fixa o que `capa_short.gerar_prompt` faz hoje — o que
pede à IA, a quem pede e o que grava — antes de a escrita do prompt sair do
claude_ia para a capa_short. Entra pelo `gerar_prompt`, que não muda de lugar,
e troca só as bordas: o banco (em memória) e os clientes de IA.
"""

import json

import pytest
import pytest_asyncio
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.models import Base, Corte, MetadadoCorte, MetadadoShort, Projeto, Short
from app.services import capa_short
from app.services.canal import editorial_scaffolds, editorial_skills
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

_PROMPT_VALIDO = (
    "Bold editorial illustration, vertical 9:16 1080x1920, subject centered inside "
    'the middle square, headline "JUROS" in bright yellow with a thick black '
    "outline, high contrast, no watermark."
)


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
    monkeypatch.setattr(capa_short, "AsyncSessionLocal", factory)

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
        db.add(MetadadoCorte(id="mc1", corte_id="c1", prompt_thumbnail="sapo de terno, luz dura"))
        db.add(
            Short(
                id="s1",
                corte_id="c1",
                numero=1,
                inicio_seg=0.0,
                fim_seg=30.0,
                gancho_tela="o juro trabalha contra voce",
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
            corpo="expertise da capa",
            modelo="sonnet",
            thinking_tokens=2000,
            timeout=180.0,
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
    """Registra cada chamada aos dois clientes e devolve a resposta combinada."""
    chamadas: list[dict] = []
    resposta = {"texto": _PROMPT_VALIDO}

    def _cliente(nome):
        async def _gerar_texto(prompt, **argumentos):
            chamadas.append({"cliente": nome, "prompt": prompt, **argumentos})
            return resposta["texto"]

        return _gerar_texto

    monkeypatch.setattr(claude_cli_client, "generate_text", _cliente("claude"))
    monkeypatch.setattr(antigravity_cli_client, "generate_text", _cliente("gemini"))
    return chamadas, resposta


async def _prompt_gravado(banco) -> str | None:
    async with banco() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == "s1"))
        return meta.prompt_capa if meta else None


@pytest.mark.asyncio
async def test_grava_no_short_o_prompt_que_a_ia_escreveu(banco, ia):
    chamadas, _ = ia

    devolvido = await capa_short.gerar_prompt("s1")

    assert devolvido == _PROMPT_VALIDO
    assert await _prompt_gravado(banco) == _PROMPT_VALIDO
    (chamada,) = chamadas
    assert chamada["cliente"] == "claude"
    assert chamada["model"] == "sonnet"
    assert chamada["skill"] == "capa-short-imagem-expert"
    assert chamada["expertise"] == "expertise da capa"
    contexto = chamada["contexto"]
    assert (contexto.etapa, contexto.projeto_id, contexto.corte_id, contexto.short_id) == (
        "capa-short-imagem-expert",
        "proj-1",
        "c1",
        "s1",
    )


@pytest.mark.asyncio
async def test_o_pedido_leva_o_trecho_o_gancho_e_o_estilo_do_canal(banco, ia):
    chamadas, _ = ia

    await capa_short.gerar_prompt("s1")

    prompt = chamadas[0]["prompt"]
    assert "O erro dos juros" in prompt
    assert "o juro trabalha contra voce" in prompt
    assert "o juro composto trabalha contra" in prompt
    assert "sapo de terno, luz dura" in prompt


@pytest.mark.asyncio
async def test_o_gemini_atende_com_o_modelo_gemini_da_skill(banco, ia):
    chamadas, _ = ia

    await capa_short.gerar_prompt("s1", "gemini")

    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["model"]) == ("gemini", "gemini-qualidade")


@pytest.mark.asyncio
async def test_resposta_que_nao_e_prompt_vira_erro_e_nao_grava(banco, ia):
    _, resposta = ia
    resposta["texto"] = "Qual e o mascote do canal?"

    with pytest.raises(capa_short.CapaShortError):
        await capa_short.gerar_prompt("s1")

    assert await _prompt_gravado(banco) is None


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup_sem_chamar_a_ia(banco, ia):
    chamadas, _ = ia

    with pytest.raises(LookupError):
        await capa_short.gerar_prompt("nao-existe")

    assert chamadas == []
