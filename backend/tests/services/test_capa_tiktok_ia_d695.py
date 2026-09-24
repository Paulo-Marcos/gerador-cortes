"""A etiqueta e o prompt da arte da capa do TikTok, com a IA (D-695).

Teste de caracterização: fixa o que os dois caminhos fazem hoje — o que pedem à
IA, a quem pedem, o que devolvem ou gravam — antes de a escrita sair do
claude_ia para a capa_tiktok. A arte entra pelo `capa_tiktok.gerar_prompt_da_arte`,
que não muda de lugar; a etiqueta é chamada por `sugerir_etiqueta`, o único nome
que o movimento troca. O resto são bordas: banco em memória, clientes de IA e a
identidade do canal.
"""

import json
from datetime import datetime
from types import SimpleNamespace

import pytest
import pytest_asyncio
from app import editorial_scaffolds, editorial_skills
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.models import Base, Corte, MetadadoCorte, Projeto
from app.services import capa_tiktok
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

sugerir_etiqueta = capa_tiktok.sugerir_etiqueta

_PROMPT_DA_ARTE = (
    "Editorial illustration of the frog mascot holding a falling coin, hard light, "
    "deep green palette, centered subject. No text, no letters."
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
    monkeypatch.setattr(capa_tiktok, "AsyncSessionLocal", factory)

    async with factory() as db:
        db.add(Projeto(id="proj-1", youtube_url="http://x", transcricao_raw="[]"))
        for corte_id, titulo in (("c1", "O erro dos juros"), ("c0", "Selic de novo")):
            db.add(
                Corte(
                    id=corte_id,
                    projeto_id="proj-1",
                    numero=1 if corte_id == "c1" else 2,
                    titulo_proposto=titulo,
                    tema_central="Economia",
                    resumo="O juro composto corre contra quem deve.",
                    inicio_seg=0.0,
                    fim_seg=60.0,
                    transcricao_final=json.dumps([]),
                )
            )
        db.add(
            MetadadoCorte(
                id="m1",
                corte_id="c1",
                texto_capa="selic",
                prompt_thumbnail="sapo de terno, luz dura",
            )
        )
        db.add(
            MetadadoCorte(
                id="m0",
                corte_id="c0",
                etiqueta_tiktok="SELIC",
                atualizado_em=datetime(2026, 9, 1),
            )
        )
        await db.commit()
    yield factory
    await engine.dispose()


@pytest.fixture(autouse=True)
def canal_skill_e_scaffold(monkeypatch):
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
    monkeypatch.setattr(
        capa_tiktok,
        "identidade_do_canal_ativo",
        lambda: SimpleNamespace(handle="canal", nome="Canal"),
    )


@pytest.fixture
def ia(monkeypatch):
    """Registra cada chamada aos dois clientes e devolve a resposta combinada."""
    chamadas: list[dict] = []
    resposta = {"texto": _PROMPT_DA_ARTE}

    def _cliente(nome):
        async def _gerar_texto(prompt, **argumentos):
            chamadas.append({"cliente": nome, "prompt": prompt, **argumentos})
            return resposta["texto"]

        return _gerar_texto

    monkeypatch.setattr(claude_cli_client, "generate_text", _cliente("claude"))
    monkeypatch.setattr(antigravity_cli_client, "generate_text", _cliente("gemini"))
    return chamadas, resposta


async def _prompt_da_arte_gravado(banco) -> str:
    async with banco() as db:
        meta = await db.scalar(select(MetadadoCorte).where(MetadadoCorte.corte_id == "c1"))
        return meta.prompt_capa_tiktok


# ─── A arte ───


@pytest.mark.asyncio
async def test_a_arte_grava_o_prompt_que_a_ia_escreveu(banco, ia):
    chamadas, _ = ia

    devolvido = await capa_tiktok.gerar_prompt_da_arte("c1")

    assert devolvido == _PROMPT_DA_ARTE
    assert await _prompt_da_arte_gravado(banco) == _PROMPT_DA_ARTE
    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["model"], chamada["skill"]) == (
        "claude",
        "sonnet",
        "capa-tiktok-imagem-expert",
    )
    contexto = chamada["contexto"]
    assert (contexto.etapa, contexto.projeto_id, contexto.corte_id) == (
        "capa-tiktok-imagem-expert",
        "proj-1",
        "c1",
    )


@pytest.mark.asyncio
async def test_o_pedido_da_arte_leva_o_corte_a_etiqueta_e_o_estilo_do_canal(banco, ia):
    chamadas, _ = ia

    await capa_tiktok.gerar_prompt_da_arte("c1")

    prompt = chamadas[0]["prompt"]
    assert "O erro dos juros" in prompt
    assert "SELIC" in prompt
    assert "O juro composto corre contra quem deve." in prompt
    assert "sapo de terno, luz dura" in prompt


@pytest.mark.asyncio
async def test_a_arte_pelo_gemini_usa_o_modelo_gemini_da_skill(banco, ia):
    chamadas, _ = ia

    await capa_tiktok.gerar_prompt_da_arte("c1", "gemini")

    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["model"]) == ("gemini", "gemini-rapido")


@pytest.mark.asyncio
async def test_sem_prompt_da_thumbnail_a_arte_recusa_sem_chamar_a_ia(banco, ia):
    chamadas, _ = ia
    async with banco() as db:
        meta = await db.scalar(select(MetadadoCorte).where(MetadadoCorte.corte_id == "c1"))
        meta.prompt_thumbnail = ""
        await db.commit()

    with pytest.raises(capa_tiktok.CapaTikTokError):
        await capa_tiktok.gerar_prompt_da_arte("c1")

    assert chamadas == []


@pytest.mark.asyncio
async def test_resposta_que_nao_e_prompt_de_arte_vira_erro_e_nao_grava(banco, ia):
    _, resposta = ia
    resposta["texto"] = "Qual e o mascote do canal?"

    with pytest.raises(capa_tiktok.CapaTikTokError):
        await capa_tiktok.gerar_prompt_da_arte("c1")

    assert await _prompt_da_arte_gravado(banco) == ""


# ─── A etiqueta ───


@pytest.mark.asyncio
async def test_a_etiqueta_sai_normalizada_da_resposta(banco, ia):
    chamadas, resposta = ia
    resposta["texto"] = '"selic"\nEscolhi porque o canal ja usa.'

    etiqueta = await sugerir_etiqueta("c1")

    assert etiqueta == "SELIC"
    (chamada,) = chamadas
    assert (chamada["cliente"], chamada["skill"]) == ("claude", "capa-tiktok-expert")
    assert chamada["contexto"].corte_id == "c1"


@pytest.mark.asyncio
async def test_o_pedido_da_etiqueta_leva_as_etiquetas_recentes_de_outros_cortes(banco, ia):
    chamadas, resposta = ia
    resposta["texto"] = "SELIC"

    await sugerir_etiqueta("c1")

    prompt = chamadas[0]["prompt"]
    assert "O erro dos juros" in prompt
    assert "- SELIC" in prompt


@pytest.mark.asyncio
async def test_etiqueta_de_corte_inexistente_levanta_lookup(banco, ia):
    chamadas, _ = ia

    with pytest.raises(LookupError):
        await sugerir_etiqueta("nao-existe")

    assert chamadas == []
