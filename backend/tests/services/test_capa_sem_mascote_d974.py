"""D-974: no modo apresentador, a capa vertical não sai com o mascote.

A 42b18dde (PROD, 18/10/2026) escreveu o Sapo como "SECOND FIGURE" com o bloco
do modo apresentador na mão: o envelope traz o prompt do YouTube com o Sapo, a
skill gasta sete seções nele, e o modelo seguiu a maioria. A trava é do código,
não do modelo: o prompt que descreve o mascote volta UMA vez com um aviso; se
voltar com ele de novo, a geração falha com uma mensagem clara e nada se grava.
"""

import pytest
import pytest_asyncio
from app.domain.canal.mascote import Mascote
from app.infrastructure import antigravity_cli_client, claude_cli_client
from app.models import Base, Corte, MetadadoCorte, MetadadoShort, Projeto, Short
from app.services import capa_short, capa_tiktok
from app.services.canal import capa_do_canal, editorial_scaffolds, editorial_skills
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool


@pytest_asyncio.fixture
async def banco(monkeypatch):
    """Um short s1 com o prompt do YouTube do Sapo, num banco em memória."""
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
                titulo_proposto="Desabafar não resolve",
                inicio_seg=0.0,
                fim_seg=60.0,
                transcricao_final="[]",
            )
        )
        db.add(MetadadoCorte(id="mc1", corte_id="c1", prompt_thumbnail="o Sapo de jaqueta"))
        db.add(Short(id="s1", corte_id="c1", numero=1, inicio_seg=0.0, fim_seg=30.0))
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


async def _prompt_gravado(banco) -> str | None:
    async with banco() as db:
        meta = await db.scalar(select(MetadadoShort).where(MetadadoShort.short_id == "s1"))
        return meta.prompt_capa if meta else None


_COM_O_SAPO = (
    "Vertical 9:16, 1080x1920. PROTAGONIST: Nayib Bukele, dark suit. SECOND FIGURE, the "
    "channel mascot: the Sapo Analítico, anthropomorphic frog in a bomber jacket. "
    '"DESABAFAR NÃO RESOLVE" in sulfur-yellow with a black outline. No watermark.'
)
_SEM_O_SAPO = (
    '[APRESENTADOR="pensativo"]\nVertical 9:16, 1080x1920. Host chest-up in the central '
    'square. "DESABAFAR NÃO RESOLVE" in sulfur-yellow with a black outline. '
    "AVOID: no frog, no mascot, no cartoon animal, no watermark."
)


def _modo(monkeypatch, protagonista):
    monkeypatch.setattr(capa_do_canal, "protagonista", lambda: protagonista)
    monkeypatch.setattr(capa_do_canal, "identidade_do_mascote", lambda: Mascote("Sapo"))


@pytest.fixture
def ia(monkeypatch):
    """Devolve as respostas na ordem; a última se repete."""
    chamadas: list[str] = []
    respostas: list[str] = []

    async def _gerar_texto(prompt, **_argumentos):
        chamadas.append(prompt)
        return respostas[min(len(chamadas), len(respostas)) - 1]

    monkeypatch.setattr(claude_cli_client, "generate_text", _gerar_texto)
    monkeypatch.setattr(antigravity_cli_client, "generate_text", _gerar_texto)
    return chamadas, respostas


@pytest.mark.asyncio
async def test_prompt_com_o_mascote_volta_com_aviso_e_o_corrigido_e_gravado(banco, ia, monkeypatch):
    _modo(monkeypatch, "apresentador")
    chamadas, respostas = ia
    respostas += [_COM_O_SAPO, _SEM_O_SAPO]

    devolvido = await capa_short.gerar_prompt("s1")

    assert devolvido == _SEM_O_SAPO
    assert await _prompt_gravado(banco) == _SEM_O_SAPO
    primeira, segunda = chamadas
    assert "RESPOSTA ANTERIOR RECUSADA" not in primeira
    assert segunda.startswith("=== RESPOSTA ANTERIOR RECUSADA ===")
    assert segunda.endswith(primeira)


@pytest.mark.asyncio
async def test_mascote_nas_duas_tentativas_falha_e_nao_grava(banco, ia, monkeypatch):
    _modo(monkeypatch, "apresentador")
    chamadas, respostas = ia
    respostas.append(_COM_O_SAPO)

    with pytest.raises(capa_short.CapaShortError, match="Sapo") as erro:
        await capa_short.gerar_prompt("s1")

    assert "modo apresentador" in str(erro.value)
    assert len(chamadas) == 2
    assert await _prompt_gravado(banco) is None


@pytest.mark.asyncio
async def test_no_modo_mascote_o_mascote_continua_valendo(banco, ia, monkeypatch):
    _modo(monkeypatch, "mascote")
    chamadas, respostas = ia
    respostas.append(_COM_O_SAPO)

    assert await capa_short.gerar_prompt("s1") == _COM_O_SAPO
    assert len(chamadas) == 1


@pytest.mark.asyncio
async def test_a_arte_do_tiktok_tem_a_mesma_trava(ia, monkeypatch):
    """A arte do TikTok herda o mesmo prompt do YouTube, com o mesmo Sapo."""
    _modo(monkeypatch, "apresentador")
    contexto = type("Contexto", (), {"titulo": "t", "tema_central": "", "resumo": ""})()
    contexto.prompt_thumbnail, contexto.projeto_id = "o Sapo de jaqueta", "proj-1"

    async def _contexto_da_etiqueta(_corte_id):
        return contexto

    monkeypatch.setattr(capa_tiktok, "montar_contexto_da_etiqueta", _contexto_da_etiqueta)
    chamadas, respostas = ia
    respostas += [_COM_O_SAPO + " No text.", _SEM_O_SAPO + " No text."]

    devolvido = await capa_tiktok._escrever_prompt_da_arte("c1", "ETIQUETA", "claude")

    assert devolvido == _SEM_O_SAPO + " No text."
    assert chamadas[1].startswith("=== RESPOSTA ANTERIOR RECUSADA ===")
