"""D-908: a referência do público e os blocos por canal, no banco.

No espírito de `test_ranking_settings`: banco como fonte da verdade, mas SEM
seed — ausência é "segue o padrão" (RN-10), e o reset apaga. Tudo isolado por
`tmp_path`.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app.domain.publicacao.escalonamento import (
    PADRAO_DO_PUBLICO,
    PADRAO_POR_DESTINO,
    EscalonamentoInvalido,
)
from app.services.canal import escalonamento_settings as svc

_CANAL = "canal-teste"


def _kw(tmp_path: Path) -> dict:
    return {"db_path": tmp_path / "settings.db", "channel_id": _CANAL}


def _parametros(**overrides) -> dict:
    base = {
        "blocos": ["16:00", "19:00", "22:00"],
        "itens_por_bloco": 1,
        "teto_por_dia": 3,
        "intervalo_minimo_min": 180,
        "dias_ativos": [0, 1, 2, 3, 4, 5, 6],
    }
    base.update(overrides)
    return base


# ─── Sem linha: o padrão vale, e a tela sabe que é o padrão ─────────────────


def test_sem_linha_vale_o_padrao(tmp_path: Path):
    kw = _kw(tmp_path)

    assert svc.resolver_referencia(**kw) == PADRAO_DO_PUBLICO
    assert svc.resolver_parametros("tiktok", **kw) == PADRAO_POR_DESTINO["tiktok"]

    descrito = svc.descrever(**kw)
    assert descrito.publico_personalizado is False
    assert [d.destino for d in descrito.destinos] == ["youtube", "youtube_shorts", "tiktok"]
    assert all(d.personalizado is False for d in descrito.destinos)
    assert all(d.parametros == d.padrao for d in descrito.destinos)


# ─── Definir: o banco passa a mandar; o padrão continua visível ─────────────


def test_definir_parametros_grava_e_resolver_devolve(tmp_path: Path):
    kw = _kw(tmp_path)

    descrito = svc.definir_parametros("youtube_shorts", _parametros(blocos=["18:00"]), **kw)

    shorts = next(d for d in descrito.destinos if d.destino == "youtube_shorts")
    assert shorts.personalizado is True
    assert shorts.parametros["blocos"] == ["18:00"]
    assert shorts.padrao["blocos"] == ["16:00", "19:00", "22:00"]
    assert svc.resolver_parametros("youtube_shorts", **kw).blocos == ("18:00",)
    # Os outros destinos não foram tocados.
    assert svc.resolver_parametros("tiktok", **kw) == PADRAO_POR_DESTINO["tiktok"]


def test_definir_referencia_grava_faixas(tmp_path: Path):
    kw = _kw(tmp_path)
    faixas = [{"dia": 0, "inicio": 20, "fim": 23, "intensidade": "forte"}]

    descrito = svc.definir_referencia(faixas, **kw)

    assert descrito.publico_personalizado is True
    assert descrito.faixas == faixas
    assert descrito.faixas_padrao == [svc.faixa_para_dict(f) for f in PADRAO_DO_PUBLICO]
    assert [f.inicio for f in svc.resolver_referencia(**kw)] == [20]


# ─── Validação: o domínio recusa antes de gravar ────────────────────────────


def test_parametros_invalidos_nao_gravam(tmp_path: Path):
    kw = _kw(tmp_path)

    with pytest.raises(EscalonamentoInvalido, match="5 em 5"):
        svc.definir_parametros("tiktok", _parametros(blocos=["18:03"]), **kw)

    assert svc.descrever(**kw).destinos[2].personalizado is False


def test_referencia_invalida_nao_grava(tmp_path: Path):
    kw = _kw(tmp_path)
    sobrepostas = [
        {"dia": 1, "inicio": 10, "fim": 20, "intensidade": "forte"},
        {"dia": 1, "inicio": 19, "fim": 22, "intensidade": "fraco"},
    ]

    with pytest.raises(EscalonamentoInvalido, match="sobrepõe"):
        svc.definir_referencia(sobrepostas, **kw)

    assert svc.descrever(**kw).publico_personalizado is False


def test_faixa_ilegivel_e_recusada_com_mensagem(tmp_path: Path):
    with pytest.raises(EscalonamentoInvalido, match="ilegível"):
        svc.definir_referencia([{"dia": "segunda"}], **_kw(tmp_path))


def test_destino_desconhecido_e_recusado(tmp_path: Path):
    with pytest.raises(EscalonamentoInvalido, match="desconhecido"):
        svc.resolver_parametros("instagram_reels", **_kw(tmp_path))


# ─── Reset: apaga a linha; o padrão volta a valer ───────────────────────────


def test_resetar_apaga_a_linha_e_volta_ao_padrao(tmp_path: Path):
    kw = _kw(tmp_path)
    svc.definir_parametros("tiktok", _parametros(blocos=["20:00"]), **kw)
    svc.definir_referencia([{"dia": 0, "inicio": 1, "fim": 2, "intensidade": "fraco"}], **kw)

    svc.resetar("tiktok", **kw)
    assert svc.resolver_parametros("tiktok", **kw) == PADRAO_POR_DESTINO["tiktok"]
    # A referência segue personalizada: o reset é por chave.
    assert svc.descrever(**kw).publico_personalizado is True

    svc.resetar("publico", **kw)
    assert svc.resolver_referencia(**kw) == PADRAO_DO_PUBLICO


def test_resetar_chave_desconhecida(tmp_path: Path):
    with pytest.raises(EscalonamentoInvalido, match="resetar"):
        svc.resetar("instagram_reels", **_kw(tmp_path))


# ─── Sugestão: os mesmos N blocos, alinhados à janela forte do canal ────────


def test_sugere_a_mesma_quantidade_de_blocos_do_destino(tmp_path: Path):
    kw = _kw(tmp_path)

    assert svc.sugerir_blocos_do_canal("youtube", **kw) == ["15:00", "19:00"]
    assert len(svc.sugerir_blocos_do_canal("tiktok", **kw)) == 3


def test_sugestao_segue_a_referencia_gravada(tmp_path: Path):
    kw = _kw(tmp_path)
    svc.definir_referencia(
        [{"dia": d, "inicio": 8, "fim": 12, "intensidade": "forte"} for d in range(7)], **kw
    )

    assert svc.sugerir_blocos_do_canal("youtube", **kw) == ["08:00", "10:00"]
