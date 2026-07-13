"""Testes do alinhamento puro de falantes (D-286)."""

from app.domain.diarizacao_align import (
    alinhar_falantes,
    heuristica_falante_canal,
    montar_mapa_falantes,
    prefixo_falante,
    rotular_janela,
)


def test_alinhar_atribui_falante_dominante():
    segmentos = [
        {"inicio": "00:00:00", "fim": "00:00:05", "texto": "abertura"},
        {"inicio": "00:00:06", "fim": "00:00:09", "texto": "resposta"},
    ]
    turns = [
        {"start": 0.0, "end": 5.5, "speaker": "SPEAKER_00"},
        {"start": 5.5, "end": 12.0, "speaker": "SPEAKER_01"},
    ]

    resultado = alinhar_falantes(segmentos, turns)

    assert resultado[0]["speaker"] == "SPEAKER_00"
    assert resultado[1]["speaker"] == "SPEAKER_01"
    # Não muta a entrada original.
    assert "speaker" not in segmentos[0]


def test_alinhar_sem_turnos_mantem_segmentos_sem_rotulo():
    segmentos = [{"inicio": "00:00:00", "fim": "00:00:05", "texto": "oi"}]

    resultado = alinhar_falantes(segmentos, [])

    assert "speaker" not in resultado[0]
    assert resultado[0]["texto"] == "oi"


def test_alinhar_segmento_sem_sobreposicao_fica_sem_falante():
    segmentos = [{"inicio": "00:01:00", "fim": "00:01:05", "texto": "tardio"}]
    turns = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]

    resultado = alinhar_falantes(segmentos, turns)

    assert "speaker" not in resultado[0]


def test_rotular_janela_so_marca_segmentos_dentro_da_janela():
    segmentos = [
        {"inicio": "00:00:01", "fim": "00:00:04", "texto": "dentro"},
        {"inicio": "00:00:20", "fim": "00:00:24", "texto": "fora"},
    ]
    turns = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]

    resultado = rotular_janela(segmentos, turns, 0.0, 10.0)

    assert resultado[0]["speaker"] == "SPEAKER_00"
    assert "speaker" not in resultado[1]
    # Não muta a entrada original.
    assert "speaker" not in segmentos[0]


def test_rotular_janela_preserva_speaker_previo_fora_da_janela():
    segmentos = [{"inicio": "00:02:00", "fim": "00:02:05", "texto": "antigo", "speaker": "X"}]
    turns = [{"start": 0.0, "end": 10.0, "speaker": "SPEAKER_00"}]

    resultado = rotular_janela(segmentos, turns, 0.0, 10.0)

    assert resultado[0]["speaker"] == "X"


def test_heuristica_canal_escolhe_maior_tempo_de_fala():
    turns = [
        {"start": 0, "end": 30, "speaker": "SPEAKER_00"},
        {"start": 30, "end": 34, "speaker": "SPEAKER_01"},
        {"start": 34, "end": 60, "speaker": "SPEAKER_00"},
    ]

    assert heuristica_falante_canal(turns) == "SPEAKER_00"


def test_heuristica_canal_sem_turnos_e_none():
    assert heuristica_falante_canal([]) is None


def test_montar_mapa_marca_canal_e_nome_vazio():
    turns = [
        {"start": 0, "end": 30, "speaker": "SPEAKER_00"},
        {"start": 30, "end": 35, "speaker": "SPEAKER_01"},
    ]

    mapa = montar_mapa_falantes(turns)

    assert mapa["SPEAKER_00"] == {"nome": "", "is_canal": True}
    assert mapa["SPEAKER_01"] == {"nome": "", "is_canal": False}


def test_prefixo_falante_com_e_sem_nome():
    mapa = {
        "SPEAKER_00": {"nome": "Pedro", "is_canal": True},
        "SPEAKER_01": {"nome": "", "is_canal": False},
    }

    assert prefixo_falante("SPEAKER_00", mapa) == "[CANAL: Pedro] "
    assert prefixo_falante("SPEAKER_01", mapa) == "[OUTRO] "


def test_prefixo_falante_sem_mapa_ou_falante_e_vazio():
    assert prefixo_falante(None, {"SPEAKER_00": {"is_canal": True}}) == ""
    assert prefixo_falante("SPEAKER_00", None) == ""
    assert prefixo_falante("SPEAKER_99", {"SPEAKER_00": {"is_canal": True}}) == ""
