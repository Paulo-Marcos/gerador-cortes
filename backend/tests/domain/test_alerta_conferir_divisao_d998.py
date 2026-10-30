"""D-998, auditoria do PR #279: dividir e juntar o corte não perdem o alerta."""

from app.domain.corte.alerta_conferir import (
    alerta_de_trecho,
    dividir_alertas_no_ponto,
    juntar_alertas,
)

_CONFERIR = {"inicio_hms": "00:01:00", "fim_hms": "00:01:10", "motivo": "cita 40% sem fonte"}


def test_dividir_leva_cada_alerta_para_a_sua_metade():
    antes = alerta_de_trecho(
        {**_CONFERIR, "inicio_hms": "00:00:10", "fim_hms": "00:00:20"}, "claude"
    )
    cruza = alerta_de_trecho(
        {**_CONFERIR, "inicio_hms": "00:00:50", "fim_hms": "00:01:10"}, "claude"
    )
    depois = alerta_de_trecho(_CONFERIR, "claude")

    esquerda, direita = dividir_alertas_no_ponto([antes, cruza, depois], 55.0)

    assert [(a["inicio_seg"], a["fim_seg"]) for a in esquerda] == [(10.0, 20.0), (50.0, 55.0)]
    assert [(a["inicio_seg"], a["fim_seg"]) for a in direita] == [(55.0, 70.0), (60.0, 70.0)]
    assert all(a["motivo"] == "cita 40% sem fonte" for a in esquerda + direita)


def test_juntar_soma_os_alertas_dos_dois_cortes_sem_duplicar():
    um = alerta_de_trecho(_CONFERIR, "claude")
    outro = alerta_de_trecho(
        {**_CONFERIR, "inicio_hms": "00:03:00", "fim_hms": "00:03:05"}, "claude"
    )

    assert [a["id"] for a in juntar_alertas([um], [outro, um])] == [um["id"], outro["id"]]
