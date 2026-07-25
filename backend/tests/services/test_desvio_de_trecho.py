"""D-422: mapeamento trecho da IA → desvio persistível (fluxo manual/Gemini)."""

from app.services.desvios import desvio_de_trecho


def test_trecho_sem_borda_e_descartado():
    assert desvio_de_trecho({"motivo": "sem tempos"}, "manual") is None
    assert desvio_de_trecho({"inicio_hms": "00:01:00", "motivo": "sem fim"}, "manual") is None


def test_converte_bordas_para_segundos_e_marca_a_origem():
    d = desvio_de_trecho(
        {"inicio_hms": "00:01:00", "fim_hms": "00:01:10", "tipo": "REPETICAO", "motivo": "reitera"},
        "gemini",
    )

    assert d["inicio_seg"] == 60.0
    assert d["fim_seg"] == 70.0
    assert d["categoria"] == "repeticao"
    assert d["origem"] == "gemini"


def test_categoria_reconhecida_dispensa_o_prefixo_de_tipo_no_texto():
    d = desvio_de_trecho(
        {"inicio_hms": "00:01:00", "fim_hms": "00:01:05", "tipo": "REPETICAO", "motivo": "reitera"},
        "manual",
    )

    assert d["motivo"] == "reitera"


def test_tipo_irreconhecivel_preserva_a_pista_no_texto():
    d = desvio_de_trecho(
        {"inicio_hms": "00:01:00", "fim_hms": "00:01:05", "tipo": "ZZZ", "motivo": "algo"},
        "manual",
    )

    assert d["categoria"] == "outro"
    assert d["motivo"] == "[ZZZ] algo"


def test_trecho_impreciso_ganha_o_aviso_no_motivo():
    d = desvio_de_trecho(
        {
            "inicio_hms": "00:01:00",
            "fim_hms": "00:01:05",
            "tipo": "IMPRECISAO",
            "motivo": "cita 40% sem fonte",
        },
        "manual",
    )

    assert d["categoria"] == "imprecisao"
    assert d["motivo"] == "Possível imprecisão — cita 40% sem fonte"
