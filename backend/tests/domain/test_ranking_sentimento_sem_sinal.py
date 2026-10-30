"""Live sem sentimento (sem comentários ou o haiku falhou) não vira a pior do lote (D-1000)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from app.domain.live_candidata.ranking_lives import (
    SENTIMENTO_NEUTRO,
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


def _sinal(vid: str, sentimento: float | None) -> SinaisLive:
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


def test_live_sem_sentimento_fica_no_meio_e_nao_estica_a_escala():
    lote = pontuar_lote(
        [_sinal("seis", 6), _sinal("sem", None), _sinal("oito", 8)], SO_SENTIMENTO, HOJE
    )
    notas = {p.video_id: _sentimento(p).valor_normalizado for p in lote}
    assert notas == {
        "seis": pytest.approx(0.0),
        "sem": pytest.approx(0.5),
        "oito": pytest.approx(1.0),
    }


def test_live_sem_sentimento_mostra_a_nota_neutra():
    lote = pontuar_lote([_sinal("sem", None)], SO_SENTIMENTO, HOJE)
    assert _sentimento(lote[0]).valor_bruto == pytest.approx(SENTIMENTO_NEUTRO)
