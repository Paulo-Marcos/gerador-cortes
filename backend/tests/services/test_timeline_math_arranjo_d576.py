"""D-576: a transcrição tem que seguir a ordem do vídeo, não a da live.

Quando um bloco vai para o começo, as falas dele vão junto. O risco aqui não é
um erro barulhento — é o silencioso: o atalho antigo do `mapear_tempo_linear`
descartava tudo que "andava para trás", e a legenda sumiria sem nenhum aviso.
"""

from app.services.timeline_math import TimelineMath

# [A 0-180][B 180-480], já trocados: B toca primeiro.
ORDEM_TROCADA = [{"start": 180.0, "end": 480.0}, {"start": 0.0, "end": 180.0}]

FALAS = [
    {"start": 10.0, "end": 20.0, "texto": "primeira fala da live"},
    {"start": 200.0, "end": 210.0, "texto": "fala que foi para o comeco"},
]


def _por_texto(transcricao: list[dict]) -> dict[str, float]:
    return {item["texto"]: item["start"] for item in transcricao}


def test_fala_do_bloco_movido_nao_e_descartada():
    nova = TimelineMath.recalcular_transcricao(FALAS, ORDEM_TROCADA)
    assert len(nova) == 2, "o atalho monotônico teria comido a fala do bloco 1"


def test_falas_ganham_a_posicao_do_bloco_no_video():
    tempos = _por_texto(TimelineMath.recalcular_transcricao(FALAS, ORDEM_TROCADA))

    # B começa em 0 no bruto: a fala de 200s cai em 200-180 = 20s.
    assert tempos["fala que foi para o comeco"] == 20.0
    # A começa depois dos 300s de B: a fala de 10s cai em 300+10 = 310s.
    assert tempos["primeira fala da live"] == 310.0


def test_transcricao_sai_ordenada_pelo_tempo_novo():
    nova = TimelineMath.recalcular_transcricao(FALAS, ORDEM_TROCADA)
    assert [item["texto"] for item in nova] == [
        "fala que foi para o comeco",
        "primeira fala da live",
    ]


def test_ordem_cronologica_continua_como_antes():
    """Não-regressão: sem arranjo, o resultado é o de sempre."""
    cronologico = [{"start": 0.0, "end": 100.0}, {"start": 150.0, "end": 300.0}]
    falas = [
        {"start": 10.0, "end": 20.0, "texto": "antes do buraco"},
        {"start": 120.0, "end": 130.0, "texto": "dentro do buraco"},
        {"start": 200.0, "end": 210.0, "texto": "depois do buraco"},
    ]
    tempos = _por_texto(TimelineMath.recalcular_transcricao(falas, cronologico))

    assert tempos["antes do buraco"] == 10.0
    assert tempos["depois do buraco"] == 150.0
    assert "dentro do buraco" not in tempos


def test_palavras_seguem_o_bloco_movido():
    falas = [
        {
            "start": 200.0,
            "end": 210.0,
            "texto": "fala com palavras",
            "palavras": [
                {"inicio_seg": 200.0, "texto": "fala"},
                {"inicio_seg": 205.0, "texto": "com"},
            ],
        }
    ]
    nova = TimelineMath.recalcular_transcricao(falas, ORDEM_TROCADA)

    assert [p["inicio_seg"] for p in nova[0]["palavras"]] == [20.0, 25.0]
