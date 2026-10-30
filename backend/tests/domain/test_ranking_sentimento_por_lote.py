"""O sentimento é comparado dentro do lote, como as views (D-1000).

O haiku só dá 5, 6, 7 ou 8. Com a nota absoluta (score/10), 6 e 8 viravam 0,6 e 0,8: um
piso igual para todos e só 0,2 do peso para ordenar. Normalizado por lote, a melhor nota
do lote vale o peso inteiro e a pior vale zero.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.domain.live_candidata.ranking_lives import (
    ComponenteDetalhado,
    LivePontuada,
    PesosRanking,
    SinaisLive,
    pontuar_lote,
)

HOJE = datetime(2026, 10, 29, tzinfo=UTC)
SO_SENTIMENTO = PesosRanking(
    views=0, likes_por_view=0, comentarios_por_view=0, sentimento=1, recencia=0, vph=0
)


def _sinal(vid: str, sentimento: float) -> SinaisLive:
    return SinaisLive(
        video_id=vid,
        views=1_000,
        likes=50,
        comentarios=10,
        sentimento_0a10=sentimento,
        data_publicacao=HOJE - timedelta(days=10),
    )


def _sentimento(pontuada: LivePontuada) -> ComponenteDetalhado:
    return next(d for d in pontuada.detalhes if d.criterio == "sentimento")


def test_notas_do_haiku_ocupam_a_escala_inteira_do_lote():
    lote = pontuar_lote(
        [_sinal("seis", 6), _sinal("sete", 7), _sinal("oito", 8)], SO_SENTIMENTO, HOJE
    )
    notas = {p.video_id: p.pontuacao_total for p in lote}
    assert notas == {
        "seis": pytest.approx(0.0),
        "sete": pytest.approx(50.0),
        "oito": pytest.approx(100.0),
    }


def test_bruto_continua_sendo_a_nota_do_haiku():
    lote = pontuar_lote([_sinal("seis", 6), _sinal("oito", 8)], SO_SENTIMENTO, HOJE)
    assert [_sentimento(p).valor_bruto for p in lote] == [pytest.approx(6.0), pytest.approx(8.0)]
    assert [_sentimento(p).valor_normalizado for p in lote] == [
        pytest.approx(0.0),
        pytest.approx(1.0),
    ]


def test_lote_com_a_mesma_nota_nao_premia_nem_pune():
    lote = pontuar_lote([_sinal("a", 7), _sinal("b", 7)], SO_SENTIMENTO, HOJE)
    assert [_sentimento(p).valor_normalizado for p in lote] == [pytest.approx(0.5)] * 2
