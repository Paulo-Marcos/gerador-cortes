"""O post do short (título, descrição e hashtags) escrito pela IA (D-695).

Teste de caracterização: fixa o que a geração do post faz hoje — o que pede à
IA, a quem pede e o que grava no `MetadadoShort` — antes de ela sair do
claude_ia para a metadados_short. Chama a função por `gerar_post`, o único nome
que o movimento troca; o resto são bordas: banco em memória e clientes de IA.
"""

import json

import pytest
import pytest_asyncio
from app import editorial_scaffolds, editorial_skills
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.models import Base, Corte, MetadadoShort, Projeto, Short
from app.services import metadados_short
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

gerar_post = metadados_short.gerar_post

_POST = json.dumps(
    {
        "titulo": "O juro que trabalha contra voce",
        "descricao": "Por que a divida cresce mais rapido que o salario.",
        "hashtags": ["#juros", "#economia"],
    }
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
    monkeypatch.setattr(metadados_short, "AsyncSessionLocal", factory)

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
                gancho_tela="o juro trabalha contra voce",
            )
        )
        db.add(Short(id="s0", corte_id="c1", numero=2, inicio_seg=30.0, fim_seg=60.0))
        db.add(MetadadoShort(id="m0", short_id="s0", titulo_youtube="Selic de novo"))
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
            corpo="expertise do post",
            modelo="haiku",
            thinking_tokens=0,
            timeout=90.0,
            lentes=[],
            modelo_gemini="gemini-rapido",
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
    resposta = {"texto": _POST}

    def _cliente(nome):
        async def _gerar_texto(prompt, **argumentos):
            chamadas.append({"cliente": nome, "prompt": prompt, **argumentos})
            return resposta["texto"]

        return _gerar_texto

    monkeypatch.setattr(claude_cli_client, "generate_text", _cliente("claude"))
    monkeypatch.setattr(antigravity_cli_client, "generate_text", _cliente("gemini"))
    return chamadas, resposta


async def _gravado(banco) -> MetadadoShort | None:
    async with banco() as db:
        return await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == "s1"))


@pytest.mark.asyncio
async def test_grava_o_post_que_a_ia_escreveu_e_devolve_o_que_ficou(banco, ia):
    chamadas, _ = ia

    devolvido = await gerar_post("s1")

    assert devolvido == {
        "titulo": "O juro que trabalha contra voce",
        "descricao": "Por que a divida cresce mais rapido que o salario.",
        # A normalização do domínio grava a hashtag sem o "#".
        "hashtags": ["juros", "economia"],
        "gerado": True,
    }
    meta = await _gravado(banco)
    assert meta.titulo_youtube == "O juro que trabalha contra voce"
    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["model"], chamada["skill"]) == (
        "claude",
        "haiku",
        "metadados-short-expert",
    )
    contexto = chamada["contexto"]
    assert (contexto.etapa, contexto.projeto_id, contexto.corte_id, contexto.short_id) == (
        "metadados-short-expert",
        "proj-1",
        "c1",
        "s1",
    )


@pytest.mark.asyncio
async def test_o_pedido_leva_o_trecho_o_gancho_e_os_titulos_recentes(banco, ia):
    chamadas, _ = ia

    await gerar_post("s1")

    prompt = chamadas[0]["prompt"]
    assert "O erro dos juros" in prompt
    assert "o juro composto trabalha contra" in prompt
    assert "o juro trabalha contra voce" in prompt
    assert "- Selic de novo" in prompt


@pytest.mark.asyncio
async def test_pelo_gemini_usa_o_modelo_gemini_da_skill(banco, ia):
    chamadas, _ = ia

    await gerar_post("s1", "gemini")

    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["model"]) == ("gemini", "gemini-rapido")


@pytest.mark.asyncio
async def test_resposta_sem_titulo_nao_apaga_o_que_ja_existia(banco, ia):
    _, resposta = ia
    async with banco() as db:
        db.add(MetadadoShort(id="m1", short_id="s1", titulo_youtube="escrito a mao"))
        await db.commit()
    resposta["texto"] = "nao e json nenhum"

    devolvido = await gerar_post("s1")

    assert devolvido["titulo"] == "escrito a mao"
    assert (await _gravado(banco)).titulo_youtube == "escrito a mao"


@pytest.mark.asyncio
async def test_short_inexistente_levanta_lookup_sem_chamar_a_ia(banco, ia):
    chamadas, _ = ia

    with pytest.raises(LookupError):
        await gerar_post("nao-existe")

    assert chamadas == []
