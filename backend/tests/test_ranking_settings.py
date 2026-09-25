"""Testes dos pesos e critérios do ranking de lives por canal (D-351).

Cobrem o contrato do `ranking_settings` no espírito de `test_prompts_utilitarios`:
banco como fonte da verdade, seed idempotente a partir dos defaults de
`config.settings`, o guardrail de validação e a integração leve com o serviço
(`_pesos_atuais` reflete o customizado). Tudo isolado por `tmp_path` (um
`settings.db` por teste).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.config import settings
from app.services.canal import ranking_settings

_CANAL = "canal-teste"


def _kw(tmp_path: Path) -> dict:
    return {"db_path": tmp_path / "settings.db", "channel_id": _CANAL}


def _valores(**overrides: float) -> dict:
    base = {
        "views": 0.08,
        "likes_por_view": 0.15,
        "comentarios_por_view": 0.25,
        "sentimento": 0.30,
        "recencia": 0.12,
        "vph": 0.10,
        "meia_vida_dias": 90.0,
    }
    base.update(overrides)
    return base


# ─── Seed: sem linha no banco → defaults de config.settings ─────────────────


def test_seed_le_defaults_de_settings(tmp_path: Path):
    from app.infrastructure import settings_store

    kw = _kw(tmp_path)
    pesos = ranking_settings.resolver_pesos(**kw)

    assert pesos.views == pytest.approx(settings.ranking_peso_views)
    assert pesos.likes_por_view == pytest.approx(settings.ranking_peso_likes_por_view)
    assert pesos.comentarios_por_view == pytest.approx(settings.ranking_peso_comentarios_por_view)
    assert pesos.sentimento == pytest.approx(settings.ranking_peso_sentimento)
    assert pesos.recencia == pytest.approx(settings.ranking_peso_recencia)
    assert pesos.vph == pytest.approx(settings.ranking_peso_vph)
    assert pesos.meia_vida_dias == pytest.approx(settings.ranking_meia_vida_dias)
    # Efeito colateral: o seed gravou a linha no banco.
    assert settings_store.ler_ranking_pesos(kw["db_path"], _CANAL) is not None


def test_seed_e_idempotente(tmp_path: Path):
    kw = _kw(tmp_path)
    primeiro = ranking_settings.resolver_pesos(**kw)
    segundo = ranking_settings.resolver_pesos(**kw)
    assert primeiro == segundo


# ─── Banco fonte-da-verdade: após definir, resolver devolve o customizado ────


def test_banco_e_fonte_da_verdade_apos_definir(tmp_path: Path):
    kw = _kw(tmp_path)
    ranking_settings.definir_pesos(_valores(sentimento=0.9, meia_vida_dias=30.0), **kw)

    pesos = ranking_settings.resolver_pesos(**kw)
    assert pesos.sentimento == pytest.approx(0.9)
    assert pesos.meia_vida_dias == pytest.approx(30.0)


def test_definir_sobrescreve_seed(tmp_path: Path):
    kw = _kw(tmp_path)
    ranking_settings.resolver_pesos(**kw)  # semeia com defaults
    ranking_settings.definir_pesos(_valores(views=1.0), **kw)
    assert ranking_settings.resolver_pesos(**kw).views == pytest.approx(1.0)


# ─── Validação ──────────────────────────────────────────────────────────────


def test_valida_peso_negativo(tmp_path: Path):
    with pytest.raises(ValueError, match="negativo"):
        ranking_settings.definir_pesos(_valores(views=-0.1), **_kw(tmp_path))


def test_valida_todos_os_pesos_zero(tmp_path: Path):
    zerados = _valores(
        views=0, likes_por_view=0, comentarios_por_view=0, sentimento=0, recencia=0, vph=0
    )
    with pytest.raises(ValueError, match="peso"):
        ranking_settings.definir_pesos(zerados, **_kw(tmp_path))


def test_valida_meia_vida_nao_positiva(tmp_path: Path):
    with pytest.raises(ValueError, match="meia-vida"):
        ranking_settings.definir_pesos(_valores(meia_vida_dias=0), **_kw(tmp_path))


def test_valida_criterio_faltando(tmp_path: Path):
    incompleto = _valores()
    del incompleto["recencia"]
    with pytest.raises(ValueError, match="recencia"):
        ranking_settings.definir_pesos(incompleto, **_kw(tmp_path))


# ─── Reset e descrição para a UI ────────────────────────────────────────────


def test_resetar_volta_aos_defaults(tmp_path: Path):
    kw = _kw(tmp_path)
    ranking_settings.definir_pesos(_valores(sentimento=0.9), **kw)
    ranking_settings.resetar_pesos(**kw)
    assert ranking_settings.resolver_pesos(**kw).sentimento == pytest.approx(
        settings.ranking_peso_sentimento
    )


def test_descrever_traz_todos_com_rotulo_e_default(tmp_path: Path):
    descritos = ranking_settings.descrever_pesos(**_kw(tmp_path))
    # Ordem = filosofia do dono (D-356): engajamento genuíno primeiro, views por último.
    assert [d.key for d in descritos] == [
        "sentimento",
        "comentarios_por_view",
        "likes_por_view",
        "recencia",
        "vph",
        "views",
        "meia_vida_dias",
    ]
    sentimento = next(d for d in descritos if d.key == "sentimento")
    assert "positividade" in sentimento.rotulo.lower()
    assert sentimento.eh_peso is True
    assert sentimento.valor_default == pytest.approx(settings.ranking_peso_sentimento)
    vph = next(d for d in descritos if d.key == "vph")
    assert vph.eh_peso is True
    assert vph.valor_default == pytest.approx(settings.ranking_peso_vph)
    meia_vida = next(d for d in descritos if d.key == "meia_vida_dias")
    assert meia_vida.eh_peso is False


# ─── Integração leve: o serviço reflete o customizado do canal ──────────────


# ─── Migração idempotente: coluna vph em banco legado (D-356) ────────────────


def test_migracao_adiciona_vph_sem_perder_pesos(tmp_path: Path):
    """Banco de canal que já customizou os pesos (sem a coluna vph) ganha a coluna
    na primeira abertura, preservando os valores ajustados (D-356)."""
    import sqlite3

    from app.infrastructure import settings_store

    db = tmp_path / "settings.db"
    # Simula o schema LEGADO da ranking_pesos: sem a coluna `vph`.
    conn = sqlite3.connect(str(db))
    conn.execute(
        "CREATE TABLE ranking_pesos ("
        "channel_id TEXT PRIMARY KEY, views REAL, likes_por_view REAL, "
        "comentarios_por_view REAL, sentimento REAL, recencia REAL, "
        "meia_vida_dias REAL, updated_at TEXT)"
    )
    conn.execute(
        "INSERT INTO ranking_pesos VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ("c1", 0.9, 0.1, 0.2, 0.7, 0.3, 45.0, ""),
    )
    conn.commit()
    conn.close()

    # A leitura via settings_store abre o banco → roda `_migrar_colunas` (idempotente).
    pesos = settings_store.ler_ranking_pesos(db, "c1")
    assert pesos is not None
    assert pesos["vph"] == pytest.approx(0.0)  # coluna nova, default 0 até o canal adotar
    assert pesos["sentimento"] == pytest.approx(0.7)  # customização preservada
    assert pesos["meia_vida_dias"] == pytest.approx(45.0)

    # Reabrir de novo não quebra nem reseta (idempotência).
    de_novo = settings_store.ler_ranking_pesos(db, "c1")
    assert de_novo["sentimento"] == pytest.approx(0.7)


def test_pesos_atuais_do_servico_reflete_customizado(tmp_path: Path, monkeypatch):
    """_pesos_atuais() (serviço) deve ler do banco via ranking_settings.

    Como o serviço resolve o canal ativo internamente, apontamos os defaults de
    canal/banco de `_resolver_db_e_canal` para o tmp_path do teste via monkeypatch,
    e conferimos que o valor customizado gravado é o que sai.
    """
    db_path = tmp_path / "settings.db"
    monkeypatch.setattr(
        ranking_settings,
        "_resolver_db_e_canal",
        lambda db, cid: (db_path, _CANAL),
    )
    ranking_settings.definir_pesos(_valores(views=0.42, meia_vida_dias=45.0))

    from app.services import ranking_lives

    pesos = ranking_lives._pesos_atuais()
    assert pesos.views == pytest.approx(0.42)
    assert pesos.meia_vida_dias == pytest.approx(45.0)


# ─── Guarda anti-regressão (D-356): schema do router cobre todos os critérios ──


def test_request_do_router_cobre_todos_os_criterios():
    """O `UpdateRankingPesosRequest` (PUT) deve declarar TODAS as chaves do domínio.

    Regressão do D-356: o critério `vph` foi adicionado ao domínio/settings mas
    ficou de fora do schema do request; o Pydantic descartava o campo e o
    `validar_pesos` reclamava 'Faltam critérios: vph' → 422 ao salvar. Este teste
    trava a divergência: qualquer critério novo no domínio precisa entrar no request.
    """
    from app.routers.editorial_skills import UpdateRankingPesosRequest

    campos = set(UpdateRankingPesosRequest.model_fields)
    assert campos == set(ranking_settings._TODAS_CHAVES), (
        "UpdateRankingPesosRequest desalinhado com os critérios do ranking: "
        f"faltando={set(ranking_settings._TODAS_CHAVES) - campos}, "
        f"sobrando={campos - set(ranking_settings._TODAS_CHAVES)}"
    )
