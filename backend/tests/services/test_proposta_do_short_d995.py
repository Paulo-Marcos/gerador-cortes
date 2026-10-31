"""D-995: o short que a IA propõe nasce com a proposta congelada, e ela não muda.

O ciclo inteiro pelos serviços de verdade: `sugerir_shorts` (só o cliente do
Claude é dublê), a edição do operador, uma nova rodada de sugestões, o apagar do
corte e a telemetria do projeto. Banco em memória: toda sessão do app é
desviada para ele.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from app import database
from app.infrastructure import claude_cli_client
from app.models import Base, Corte, Projeto, Short, ShortSnapshot
from app.services import shorts as shorts_store
from app.services.canal import editorial_scaffolds, editorial_skills
from app.services.corte import CorteService
from app.services.telemetria_cortes import TelemetriaCortesService
from sqlalchemy import select
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

_PROPOSTA_DA_IA = {
    "shorts": [
        {
            "titulo": "A conta que nao fecha",
            "gancho": "ninguem te conta isso",
            "inicio": "00:10",
            "fim": "00:40",
            "score": 9,
            "justificativa": "abre no gancho e remata",
        }
    ]
}


@pytest_asyncio.fixture
async def fabrica(monkeypatch, tmp_path):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    f = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    original = database.AsyncSessionLocal
    for modulo in list(sys.modules.values()):
        if getattr(modulo, "AsyncSessionLocal", None) is original:
            monkeypatch.setattr(modulo, "AsyncSessionLocal", f)
    monkeypatch.setattr("app.services.corte.projetos_dir", lambda: tmp_path)
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **kw: editorial_skills.SkillResolvida(
            key=key, corpo="expertise", modelo="sonnet", thinking_tokens=0, timeout=300.0, lentes=[]
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **kw: _TEMPLATE_REAL.read_text(encoding="utf-8"),
    )

    async def _fake_generate_json(prompt, **kwargs):
        return _PROPOSTA_DA_IA

    monkeypatch.setattr(claude_cli_client, "generate_json", _fake_generate_json)

    async with f() as db:
        db.add(Projeto(id="p1", youtube_url="u", transcricao_raw="[]"))
        db.add(
            Corte(
                id="c1",
                projeto_id="p1",
                numero=1,
                titulo_proposto="O erro dos juros",
                inicio_seg=600.0,
                fim_seg=900.0,
                duracao_clip_seg=180.0,
                transcricao_final=json.dumps([{"start": 0.0, "texto": "ninguem te conta isso"}]),
            )
        )
        await db.commit()
    yield f
    await engine.dispose()


async def _snapshots(fabrica) -> list[ShortSnapshot]:
    async with fabrica() as db:
        return list((await db.execute(select(ShortSnapshot))).scalars().all())


async def _nascer(fabrica) -> tuple[str, ShortSnapshot]:
    resultado = await shorts_store.sugerir_shorts("c1")
    short_id = resultado["shorts"][0]["id"]
    [snapshot] = await _snapshots(fabrica)
    return short_id, snapshot


@pytest.mark.asyncio
async def test_short_proposto_pela_ia_nasce_com_a_proposta_congelada(fabrica):
    short_id, snapshot = await _nascer(fabrica)

    assert snapshot.short_id == short_id
    assert (snapshot.corte_id, snapshot.projeto_id) == ("c1", "p1")
    assert (snapshot.inicio_seg, snapshot.fim_seg) == (10.0, 40.0)
    assert snapshot.score == 9.0
    assert snapshot.gancho == "ninguem te conta isso"
    assert snapshot.titulo_sugerido == "A conta que nao fecha"
    assert (snapshot.provedor, snapshot.modelo) == ("claude", "sonnet")
    assert snapshot.apagado_em is None


@pytest.mark.asyncio
async def test_editar_o_short_e_regerar_nao_mexem_na_proposta(fabrica):
    short_id, antes = await _nascer(fabrica)

    await shorts_store.atualizar_short(
        short_id, shorts_store.AtualizarShortDTO(inicio_seg=8.0, fim_seg=53.0, status="aprovado")
    )
    # Uma rodada nova, sobre outro trecho do bruto.
    outro_trecho = {"shorts": [{**_PROPOSTA_DA_IA["shorts"][0], "inicio": "01:00", "fim": "01:50"}]}
    await shorts_store.registrar_sugestoes(
        await shorts_store.montar_contexto("c1"), _resultado(outro_trecho)
    )

    async with fabrica() as db:
        congelado = await db.get(ShortSnapshot, antes.id)
        editado = await db.get(Short, short_id)
    assert (editado.inicio_seg, editado.fim_seg) == (8.0, 53.0)
    assert (congelado.inicio_seg, congelado.fim_seg, congelado.score) == (10.0, 40.0, 9.0)
    assert congelado.gancho == antes.gancho
    assert len(await _snapshots(fabrica)) == 2


@pytest.mark.asyncio
async def test_apagar_o_corte_leva_o_short_e_a_proposta_fica_datada(fabrica):
    short_id, _ = await _nascer(fabrica)

    await CorteService.remover("c1")

    async with fabrica() as db:
        assert await db.get(Short, short_id) is None
    [snapshot] = await _snapshots(fabrica)
    assert snapshot.short_id == short_id
    assert (snapshot.corte_id, snapshot.projeto_id) == ("c1", "p1")
    assert snapshot.apagado_em is not None


@pytest.mark.asyncio
async def test_telemetria_do_projeto_compara_a_proposta_do_short_com_o_final(fabrica):
    short_id, _ = await _nascer(fabrica)
    await shorts_store.atualizar_short(
        short_id, shorts_store.AtualizarShortDTO(inicio_seg=8.0, fim_seg=53.0, status="aprovado")
    )

    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    [linha] = telemetria["shorts"]["shorts"]
    assert linha["short_id"] == short_id
    assert (linha["duracao_proposta_seg"], linha["duracao_final_seg"]) == (30.0, 45.0)
    assert linha["delta_duracao_seg"] == 15.0
    assert linha["modelo"] == "sonnet"
    assert telemetria["shorts"]["resumo"]["aceitos"] == 1
    assert telemetria["shorts"]["resumo"]["esticados"] == 1


@pytest.mark.asyncio
async def test_telemetria_mantem_a_proposta_do_short_apagado(fabrica):
    await _nascer(fabrica)
    await CorteService.remover("c1")

    async with fabrica() as db:
        telemetria = await TelemetriaCortesService.telemetria_do_projeto("p1", db)

    [linha] = telemetria["shorts"]["shorts"]
    assert linha["situacao"] == "apagado"
    assert linha["inicio_proposto_seg"] == 10.0
    assert telemetria["shorts"]["resumo"]["apagados"] == 1


def _resultado(resposta: dict):
    from app.domain.short.shorts import normalizar_sugestoes
    from app.services.canal.faixa_do_short import faixa_do_canal

    faixa = faixa_do_canal(quantidade_min=1, quantidade_max=8)
    return normalizar_sugestoes(resposta, duracao_bruto_seg=180.0, faixa=faixa)
