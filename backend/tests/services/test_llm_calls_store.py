"""Testes do store de telemetria de chamadas de IA (D-353).

Cobrem o round-trip (gravar → listar), os filtros opcionais (projeto/corte/etapa),
a ordenação por recência, o limite e a criação idempotente da tabela (banco novo
nasce com o schema; reabrir não quebra).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app import channel_paths
from app.infrastructure import llm_calls_store
from app.routers import claude_ia as rota_claude_ia


def test_gravar_e_listar_round_trip(tmp_path: Path):
    db = tmp_path / "llm_calls.db"
    call_id = llm_calls_store.gravar_llm_call(
        db_path=db,
        etapa="cortador-expert",
        model="sonnet",
        projeto_id="proj-1",
        corte_id="corte-1",
        prompt="prompt bruto",
        resposta="resposta do modelo",
        tokens_in=1200,
        tokens_out=340,
        custo_usd=0.0123,
        duracao_ms_servidor=4567.0,
        latencia_ms_wall=5000.0,
        sucesso=True,
        erro_tipo=None,
    )

    registros = llm_calls_store.listar_llm_calls(db_path=db)
    assert len(registros) == 1
    r = registros[0]
    assert r["id"] == call_id
    assert r["etapa"] == "cortador-expert"
    assert r["model"] == "sonnet"
    assert r["projeto_id"] == "proj-1"
    assert r["corte_id"] == "corte-1"
    assert r["prompt"] == "prompt bruto"
    assert r["resposta"] == "resposta do modelo"
    assert r["tokens_in"] == 1200
    assert r["tokens_out"] == 340
    assert r["custo_usd"] == 0.0123
    assert r["duracao_ms_servidor"] == 4567.0
    assert r["latencia_ms_wall"] == 5000.0
    assert r["sucesso"] == 1
    assert r["erro_tipo"] is None
    assert r["ts"]  # carimbado pelo store (ISO-8601)


def test_campos_opcionais_aceitam_none(tmp_path: Path):
    # Uma chamada direta (sem contexto editorial) grava só etapa/model — o resto None.
    db = tmp_path / "llm_calls.db"
    llm_calls_store.gravar_llm_call(
        db_path=db, etapa="sentimento-ranking", model="haiku", sucesso=True
    )
    r = llm_calls_store.listar_llm_calls(db_path=db)[0]
    assert r["etapa"] == "sentimento-ranking"
    assert r["projeto_id"] is None
    assert r["corte_id"] is None
    assert r["tokens_in"] is None
    assert r["custo_usd"] is None


def test_filtros_por_projeto_corte_e_etapa(tmp_path: Path):
    db = tmp_path / "llm_calls.db"
    llm_calls_store.gravar_llm_call(db_path=db, etapa="cortador-expert", projeto_id="A")
    llm_calls_store.gravar_llm_call(
        db_path=db, etapa="metadados-expert", projeto_id="A", corte_id="c1"
    )
    llm_calls_store.gravar_llm_call(db_path=db, etapa="cortador-expert", projeto_id="B")

    assert len(llm_calls_store.listar_llm_calls(db_path=db, projeto_id="A")) == 2
    assert len(llm_calls_store.listar_llm_calls(db_path=db, projeto_id="B")) == 1
    assert len(llm_calls_store.listar_llm_calls(db_path=db, corte_id="c1")) == 1
    etapa = llm_calls_store.listar_llm_calls(db_path=db, etapa="cortador-expert")
    assert len(etapa) == 2
    assert {r["etapa"] for r in etapa} == {"cortador-expert"}
    # Combinação AND: projeto A + etapa metadados = só a do meio.
    combo = llm_calls_store.listar_llm_calls(db_path=db, projeto_id="A", etapa="metadados-expert")
    assert len(combo) == 1
    assert combo[0]["corte_id"] == "c1"


def test_ordenado_por_ts_desc_e_respeita_limite(tmp_path: Path):
    db = tmp_path / "llm_calls.db"
    for i in range(5):
        llm_calls_store.gravar_llm_call(db_path=db, etapa=f"etapa-{i}", prompt=f"p{i}")
    registros = llm_calls_store.listar_llm_calls(db_path=db, limite=3)
    # Limite respeitado e ordenação por ts DESC (não-crescente). Não dependemos de
    # tie-break entre ts idênticos (resolução de relógio grosseira no Windows).
    assert len(registros) == 3
    tss = [r["ts"] for r in registros]
    assert tss == sorted(tss, reverse=True)


def test_tabela_criada_de_forma_idempotente(tmp_path: Path):
    db = tmp_path / "llm_calls.db"
    # Inicializar duas vezes e gravar entre elas não deve quebrar (CREATE IF NOT EXISTS).
    llm_calls_store.inicializar(db)
    llm_calls_store.gravar_llm_call(db_path=db, etapa="x")
    llm_calls_store.inicializar(db)
    assert len(llm_calls_store.listar_llm_calls(db_path=db)) == 1


# ─── Leitura pela API (D-694): rota → service → store, no caminho padrão ───


@pytest.fixture
def telemetria_no_tmp(tmp_path: Path, monkeypatch) -> Path:
    """Desvia o banco padrão (`instance/llm_calls.db`) para uma pasta temporária.

    A rota não passa `db_path`: o teste precisa do mesmo caminho que ela usa em
    produção, senão não prova o encadeamento que o D-694 mudou.
    """
    monkeypatch.setattr(channel_paths, "instance_root", lambda: tmp_path)
    return tmp_path / "llm_calls.db"


@pytest.mark.asyncio
async def test_rota_da_ultima_geracao_le_a_telemetria(telemetria_no_tmp: Path):
    llm_calls_store.gravar_llm_call(etapa="cortes", corte_id="c1", model="gemini-2.5-pro")

    resposta = await rota_claude_ia.ultima_geracao(etapa="cortes", corte_id="c1")

    assert telemetria_no_tmp.exists()
    assert resposta.model == "gemini-2.5-pro"
    assert resposta.provider == "gemini"
    assert resposta.ts


@pytest.mark.asyncio
async def test_rota_da_lista_de_chamadas_filtra_pela_telemetria(telemetria_no_tmp: Path):
    llm_calls_store.gravar_llm_call(etapa="cortes", projeto_id="A", model="claude-opus-5")
    llm_calls_store.gravar_llm_call(etapa="metadados", projeto_id="B", model="claude-opus-5")

    resposta = await rota_claude_ia.listar_llm_calls(projeto_id="A")

    assert [chamada.etapa for chamada in resposta.chamadas] == ["cortes"]
