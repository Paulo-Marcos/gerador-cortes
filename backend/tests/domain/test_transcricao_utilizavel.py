"""D-444/D-445: a transcrição que não dá para analisar precisa se declarar.

O bug de origem: uma live baixada antes de o YouTube publicar o ASR ficava com
um placeholder no lugar da fala. Como o placeholder é um JSON não-vazio, a
guarda `if not transcricao_raw` deixava passar e só o modelo — depois de uma
chamada paga — percebia que não havia material.
"""

from app.domain.projeto.transcricao_utils import (
    AVISO_LEGENDA_INDISPONIVEL,
    motivo_transcricao_inutilizavel,
)


def _fala(inicio: float, fim: float, texto: str = "conteúdo real") -> dict:
    return {"start": inicio, "end": fim, "texto": texto}


def test_transcricao_com_fala_e_utilizavel():
    segmentos = [_fala(0, 10), _fala(10, 8000)]

    assert motivo_transcricao_inutilizavel(segmentos, duracao_video_seg=8759) is None


def test_transcricao_vazia_explica_o_caminho():
    motivo = motivo_transcricao_inutilizavel([])

    assert motivo is not None
    assert "Refazer transcrição" in motivo


def test_placeholder_de_legenda_indisponivel_e_recusado():
    # Exatamente o que a ingestão gravava no projeto 1119d807 (video mMXbmUhI68Y).
    segmentos = [
        {"inicio": "00:00:00.000", "fim": "00:00:01.000", "texto": AVISO_LEGENDA_INDISPONIVEL}
    ]

    motivo = motivo_transcricao_inutilizavel(segmentos, duracao_video_seg=8759)

    assert motivo is not None
    assert "não tinha legenda" in motivo
    assert "Refazer transcrição" in motivo


def test_marcador_de_erro_de_parser_e_recusado():
    segmentos = [_fala(0, 1, "[Erro no parser: Expecting value: line 1 column 1]")]

    assert motivo_transcricao_inutilizavel(segmentos) is not None


def test_transcricao_truncada_em_live_longa_e_recusada():
    # 2 min de legenda para uma live de 2h25: veio truncada.
    segmentos = [_fala(0, 60), _fala(60, 120)]

    motivo = motivo_transcricao_inutilizavel(segmentos, duracao_video_seg=8759)

    assert motivo is not None
    assert "truncada" in motivo


def test_cobertura_parcial_de_video_curto_nao_e_recusada():
    # Sem duração conhecida (ou vídeo curto) não há proporção a cobrar: só a
    # ausência de fala reprova, para não bloquear análise de material legítimo.
    segmentos = [_fala(0, 30)]

    assert motivo_transcricao_inutilizavel(segmentos) is None
    assert motivo_transcricao_inutilizavel(segmentos, duracao_video_seg=200) is None


def test_um_aviso_no_meio_de_falas_reais_nao_reprova():
    segmentos = [_fala(0, 4000), {"start": 4000, "end": 4001, "texto": AVISO_LEGENDA_INDISPONIVEL}]

    assert motivo_transcricao_inutilizavel(segmentos, duracao_video_seg=8759) is None
