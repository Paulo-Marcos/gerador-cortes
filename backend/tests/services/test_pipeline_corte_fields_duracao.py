"""Duração de referência do corte para a grade/compose (D-362).

Trava o contrato de `_duracao_layout_corte`: a âncora de duração da grade deve
ser a duração LÍQUIDA (span menos os trechos removidos), nunca o span bruto
`fim - inicio` (o "DUR" do editor). Ancorar no span bruto fazia o graded/final
rodarem além do conteúdo real e congelarem o último frame (D-362).
"""

import json

from app.services.pipeline_corte_fields import _duracao_layout_corte


def test_usa_duracao_clip_seg_quando_presente():
    """`duracao_clip_seg` (ffprobe real do clip_raw) tem prioridade."""
    corte = {"duracao_clip_seg": 300.0, "inicio_seg": 0.0, "fim_seg": 480.0, "desvios": "[]"}
    assert _duracao_layout_corte(corte) == 300.0


def test_fallback_usa_duracao_liquida_nao_span_bruto():
    """Sem `duracao_clip_seg`, desconta os trechos removidos (não retorna o span bruto)."""
    corte = {
        "duracao_clip_seg": 0.0,
        "inicio_seg": 0.0,
        "fim_seg": 480.0,  # span bruto = 8 min (DUR)
        # 3 min de trecho removido -> líquida esperada = 5 min
        "desvios": json.dumps([{"inicio_hms": "00:01:00", "fim_hms": "00:04:00"}]),
    }
    assert _duracao_layout_corte(corte) == 300.0


def test_fallback_sem_desvios_retorna_span_inteiro():
    """Sem trechos removidos, a líquida coincide com o span bruto."""
    corte = {"duracao_clip_seg": 0.0, "inicio_seg": 10.0, "fim_seg": 130.0, "desvios": "[]"}
    assert _duracao_layout_corte(corte) == 120.0


def test_fallback_desvios_como_lista_desserializada():
    """Aceita `desvios` já como lista (não só JSON string)."""
    corte = {
        "duracao_clip_seg": 0.0,
        "inicio_seg": 0.0,
        "fim_seg": 100.0,
        "desvios": [{"inicio_seg": 30.0, "fim_seg": 40.0}],
    }
    assert _duracao_layout_corte(corte) == 90.0


def test_fim_menor_ou_igual_inicio_retorna_zero():
    corte = {"duracao_clip_seg": 0.0, "inicio_seg": 50.0, "fim_seg": 50.0, "desvios": "[]"}
    assert _duracao_layout_corte(corte) == 0.0
