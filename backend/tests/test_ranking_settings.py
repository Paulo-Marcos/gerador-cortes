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
from app import ranking_settings
from app.config import settings

_CANAL = "canal-teste"


def _kw(tmp_path: Path) -> dict:
    return {"db_path": tmp_path / "settings.db", "channel_id": _CANAL}


def _valores(**overrides: float) -> dict:
    base = {
        "views": 0.15,
        "likes_por_view": 0.10,
        "comentarios_por_view": 0.15,
        "sentimento": 0.35,
        "recencia": 0.25,
        "meia_vida_dias": 90.0,
    }
    base.update(overrides)
    return base


# ─── Seed: sem linha no banco → defaults de config.settings ─────────────────


def test_seed_le_defaults_de_settings(tmp_path: Path):
    from app.services import settings_store

    kw = _kw(tmp_path)
    pesos = ranking_settings.resolver_pesos(**kw)

    assert pesos.views == pytest.approx(settings.ranking_peso_views)
    assert pesos.likes_por_view == pytest.approx(settings.ranking_peso_likes_por_view)
    assert pesos.comentarios_por_view == pytest.approx(settings.ranking_peso_comentarios_por_view)
    assert pesos.sentimento == pytest.approx(settings.ranking_peso_sentimento)
    assert pesos.recencia == pytest.approx(settings.ranking_peso_recencia)
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
    zerados = _valores(views=0, likes_por_view=0, comentarios_por_view=0, sentimento=0, recencia=0)
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
    assert [d.key for d in descritos] == [
        "views",
        "likes_por_view",
        "comentarios_por_view",
        "sentimento",
        "recencia",
        "meia_vida_dias",
    ]
    sentimento = next(d for d in descritos if d.key == "sentimento")
    assert "sentimento" in sentimento.rotulo.lower()
    assert sentimento.eh_peso is True
    assert sentimento.valor_default == pytest.approx(settings.ranking_peso_sentimento)
    meia_vida = next(d for d in descritos if d.key == "meia_vida_dias")
    assert meia_vida.eh_peso is False


# ─── Integração leve: o serviço reflete o customizado do canal ──────────────


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
