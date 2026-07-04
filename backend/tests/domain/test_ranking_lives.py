"""Testes do domain de ranking de lives candidatas (F-052)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.domain.ranking_lives import (
    PesosRanking,
    SinaisLive,
    calcular_recencia,
    normalizar_minmax,
    pontuar_lote,
)

HOJE = datetime(2026, 6, 7, tzinfo=UTC)


def _sinal(
    vid: str = "v",
    *,
    views: int = 1_000,
    likes: int = 50,
    comentarios: int = 10,
    sentimento: float = 5.0,
    dias_atras: float = 30.0,
) -> SinaisLive:
    return SinaisLive(
        video_id=vid,
        views=views,
        likes=likes,
        comentarios=comentarios,
        sentimento_0a10=sentimento,
        data_publicacao=HOJE - timedelta(days=dias_atras),
    )


class TestCalcularRecencia:
    def test_hoje_pontua_um(self):
        assert calcular_recencia(HOJE, HOJE) == pytest.approx(1.0)

    def test_meia_vida_pontua_meio(self):
        publicacao = HOJE - timedelta(days=90)
        assert calcular_recencia(publicacao, HOJE) == pytest.approx(0.5, rel=1e-6)

    def test_duas_meias_vidas_pontua_um_quarto(self):
        publicacao = HOJE - timedelta(days=180)
        assert calcular_recencia(publicacao, HOJE) == pytest.approx(0.25, rel=1e-6)

    def test_meia_vida_customizada(self):
        publicacao = HOJE - timedelta(days=30)
        assert calcular_recencia(publicacao, HOJE, meia_vida_dias=30) == pytest.approx(
            0.5, rel=1e-6
        )

    def test_data_futura_satura_em_um(self):
        publicacao = HOJE + timedelta(days=10)
        assert calcular_recencia(publicacao, HOJE) == 1.0

    def test_meia_vida_zero_levanta(self):
        with pytest.raises(ValueError, match="meia_vida_dias"):
            calcular_recencia(HOJE, HOJE, meia_vida_dias=0)

    def test_meia_vida_negativa_levanta(self):
        with pytest.raises(ValueError, match="meia_vida_dias"):
            calcular_recencia(HOJE, HOJE, meia_vida_dias=-5)


class TestNormalizarMinmax:
    def test_meio_do_intervalo_volta_meio(self):
        assert normalizar_minmax(50, 0, 100) == pytest.approx(0.5)

    def test_min_max_iguais_volta_meio(self):
        # Sinal uniforme no lote: não diferencia, retorna 0.5 neutro.
        assert normalizar_minmax(10, 10, 10) == 0.5

    def test_min_maior_que_max_volta_meio(self):
        # Defensivo: input invertido também trata como uniforme.
        assert normalizar_minmax(5, 10, 0) == 0.5

    def test_satura_abaixo_em_zero(self):
        assert normalizar_minmax(-5, 0, 100) == 0.0

    def test_satura_acima_em_um(self):
        assert normalizar_minmax(150, 0, 100) == 1.0

    def test_valor_no_minimo_eh_zero(self):
        assert normalizar_minmax(0, 0, 100) == 0.0

    def test_valor_no_maximo_eh_um(self):
        assert normalizar_minmax(100, 0, 100) == 1.0


class TestPontuarLote:
    def test_lote_vazio_volta_vazio(self):
        assert pontuar_lote([], PesosRanking(), HOJE) == []

    def test_preserva_ordem_de_entrada(self):
        sinais = [_sinal("a"), _sinal("b"), _sinal("c")]
        pontuadas = pontuar_lote(sinais, PesosRanking(), HOJE)
        assert [p.video_id for p in pontuadas] == ["a", "b", "c"]

    def test_pontuacao_no_intervalo_zero_cem(self):
        sinais = [
            _sinal(
                "forte", views=100_000, likes=5_000, comentarios=800, sentimento=10, dias_atras=1
            ),
            _sinal("medio", views=5_000, likes=200, comentarios=30, sentimento=6, dias_atras=60),
            _sinal("fraco", views=100, likes=1, comentarios=0, sentimento=2, dias_atras=400),
        ]
        for pontuada in pontuar_lote(sinais, PesosRanking(), HOJE):
            assert 0.0 <= pontuada.pontuacao_total <= 100.0

    def test_live_mais_forte_pontua_mais(self):
        forte = _sinal(
            "forte", views=100_000, likes=5_000, comentarios=800, sentimento=9.5, dias_atras=5
        )
        fraca = _sinal("fraca", views=200, likes=2, comentarios=0, sentimento=2.0, dias_atras=300)
        pontuadas = pontuar_lote([fraca, forte], PesosRanking(), HOJE)
        mapa = {p.video_id: p.pontuacao_total for p in pontuadas}
        assert mapa["forte"] > mapa["fraca"]

    def test_componentes_somam_o_total(self):
        sinais = [
            _sinal("a", views=1_000, likes=10, comentarios=5, sentimento=6, dias_atras=10),
            _sinal("b", views=5_000, likes=200, comentarios=30, sentimento=8, dias_atras=60),
        ]
        for pontuada in pontuar_lote(sinais, PesosRanking(), HOJE):
            soma = sum(pontuada.componentes.values())
            assert soma == pytest.approx(pontuada.pontuacao_total, abs=0.05)

    def test_pesos_zerados_levantam(self):
        pesos_zero = PesosRanking(
            views=0, likes_por_view=0, comentarios_por_view=0, sentimento=0, recencia=0
        )
        with pytest.raises(ValueError, match="pesos"):
            pontuar_lote([_sinal()], pesos_zero, HOJE)

    def test_sentimento_perfeito_max_vale_componente_cheio(self):
        # Lote uniforme em todos os sinais menos sentimento → diferença é só sentimento.
        base = dict(views=1_000, likes=50, comentarios=10, dias_atras=30)
        sinais = [
            _sinal("baixo", sentimento=0, **base),
            _sinal("alto", sentimento=10, **base),
        ]
        pesos = PesosRanking()
        pontuadas = {p.video_id: p for p in pontuar_lote(sinais, pesos, HOJE)}
        diff = pontuadas["alto"].pontuacao_total - pontuadas["baixo"].pontuacao_total
        peso_total = (
            pesos.views
            + pesos.likes_por_view
            + pesos.comentarios_por_view
            + pesos.sentimento
            + pesos.recencia
        )
        esperado = (pesos.sentimento * 1.0) * 100.0 / peso_total
        assert diff == pytest.approx(esperado, abs=0.05)

    def test_views_em_log_compensa_cauda_longa(self):
        # Dois patamares de views muito diferentes mas mesma TAXA de engajamento
        # → score próximo, dominado pela parte de engajamento e sentimento.
        sinais = [
            _sinal("pequeno", views=1_000, likes=100, comentarios=20, sentimento=7, dias_atras=10),
            _sinal(
                "grande",
                views=100_000,
                likes=10_000,
                comentarios=2_000,
                sentimento=7,
                dias_atras=10,
            ),
        ]
        pontuadas = {
            p.video_id: p.pontuacao_total for p in pontuar_lote(sinais, PesosRanking(), HOJE)
        }
        # O "grande" ganha em views, mas a taxa é a mesma → diferença pequena, não brutal.
        assert pontuadas["grande"] - pontuadas["pequeno"] < 25.0
