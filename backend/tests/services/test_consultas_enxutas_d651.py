"""Pedir ao banco só o que a tela usa (D-651).

Duas consultas arrastavam peso morto: a lista de shorts prontos trazia as
ENTIDADES `Corte` e `Projeto` inteiras — e `Projeto` carrega a transcrição da
live — para mostrar quatro campos; e o selo "gerado por" lia 20 linhas com
prompt e resposta (100 KB cada) para exibir um nome de modelo e uma data.

O contrato é o de sempre: a resposta tem que ser IDÊNTICA. Por isso os testes
olham o dicionário devolvido, campo a campo, e não o SQL.
"""

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from app.models import (
    Base,
    Corte,
    MetadadoShort,
    Projeto,
    PublicacaoShort,
    Short,
    StatusShort,
)
from app.services import llm_calls_store, shorts_prontos
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

TRANSCRICAO_GORDA = "x" * 200_000


@pytest_asyncio.fixture
async def banco_com_um_short(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{(tmp_path / 'p.db').as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Sessao = async_sessionmaker(engine, expire_on_commit=False)
    async with Sessao() as db:
        db.add(
            Projeto(
                id="proj-1",
                youtube_url="https://youtu.be/abc12345678",
                titulo_live="Live de teste",
                transcricao_raw=TRANSCRICAO_GORDA,
            )
        )
        db.add(
            Corte(
                id="corte-1",
                projeto_id="proj-1",
                numero=3,
                titulo_proposto="Um corte qualquer",
                inicio_hms="00:01:00",
                fim_hms="00:03:00",
                transcricao_corte=TRANSCRICAO_GORDA,
            )
        )
        db.add(
            Short(
                id="short-1",
                corte_id="corte-1",
                numero=1,
                titulo_sugerido="Short de teste",
                status=StatusShort.RENDERIZADO,
                arquivo_short_path="cortes/corte-1/short.mp4",
                inicio_seg=10.0,
                fim_seg=40.0,
                atualizado_em=datetime(2026, 9, 17, 12, 0, tzinfo=UTC),
            )
        )
        db.add(MetadadoShort(id="meta-1", short_id="short-1", titulo_youtube="Título"))
        db.add(
            PublicacaoShort(
                id="pub-1",
                alvo_id="short-1",
                plataforma="youtube",
                publicado_em=datetime(2026, 9, 17, 13, 0, tzinfo=UTC),
            )
        )
        await db.commit()

    monkeypatch.setattr(shorts_prontos, "AsyncSessionLocal", Sessao)
    projetos = tmp_path / "projetos"
    (projetos / "proj-1" / "cortes" / "corte-1").mkdir(parents=True)
    (projetos / "proj-1" / "cortes" / "corte-1" / "short.mp4").write_bytes(b"video")
    monkeypatch.setattr(
        shorts_prontos, "resolver_do_projeto", lambda rel, pid: projetos / pid / rel
    )

    yield
    await engine.dispose()


@pytest.mark.asyncio
async def test_o_cartao_do_short_continua_igual(banco_com_um_short):
    """Caracterização: os campos que a tela lê, com os valores de sempre."""
    (pronto,) = await shorts_prontos.listar_prontos()

    assert pronto["id"] == "short-1"
    assert pronto["corte_numero"] == 3
    assert pronto["corte_titulo"] == "Um corte qualquer"
    assert pronto["projeto_id"] == "proj-1"
    assert pronto["projeto_titulo"] == "Live de teste"
    assert pronto["publicadas"] == ["youtube"]
    assert "tiktok" in pronto["pendentes"]
    assert pronto["duracao_seg"] == 30.0
    assert pronto["post"]["gerado"] is True


@pytest.mark.asyncio
async def test_a_transcricao_da_live_nao_vem_junto(banco_com_um_short):
    """O peso morto: nenhum campo do cartão pode carregar a live inteira."""
    (pronto,) = await shorts_prontos.listar_prontos()

    for chave, valor in pronto.items():
        assert not (isinstance(valor, str) and len(valor) > 1000), f"{chave} veio gordo"


def _gravar(db, **kwargs):
    llm_calls_store.gravar_llm_call(db_path=db, etapa="cortes", corte_id="c1", **kwargs)


def test_selo_traz_o_modelo_da_ultima_chamada_bem_sucedida(tmp_path):
    db = tmp_path / "llm.db"
    _gravar(db, model="claude-opus-5", sucesso=True)
    _gravar(db, model="gemini-3.1-pro", sucesso=True)

    ultima = llm_calls_store.ultima_geracao_bem_sucedida(db_path=db, etapa="cortes", corte_id="c1")

    assert ultima["model"] == "gemini-3.1-pro"
    assert ultima["ts"]


def test_selo_pula_as_falhas(tmp_path):
    db = tmp_path / "llm.db"
    _gravar(db, model="claude-opus-5", sucesso=True)
    _gravar(db, model="gemini-3.1-pro", sucesso=False)

    ultima = llm_calls_store.ultima_geracao_bem_sucedida(db_path=db, etapa="cortes", corte_id="c1")

    assert ultima["model"] == "claude-opus-5"


def test_selo_mantem_a_janela_de_20_do_comportamento_antigo(tmp_path):
    """Depois de 20 falhas seguidas, o selo some — como antes da D-651.

    Alargar a janela seria mudar comportamento disfarçado de otimização.
    """
    db = tmp_path / "llm.db"
    _gravar(db, model="claude-opus-5", sucesso=True)
    for _ in range(20):
        _gravar(db, model="claude-opus-5", sucesso=False)

    assert (
        llm_calls_store.ultima_geracao_bem_sucedida(db_path=db, etapa="cortes", corte_id="c1")
        is None
    )


def test_selo_sem_registro_nenhum_e_none(tmp_path):
    db = tmp_path / "llm.db"
    llm_calls_store.inicializar(db)

    assert (
        llm_calls_store.ultima_geracao_bem_sucedida(db_path=db, etapa="cortes", corte_id="c1")
        is None
    )
