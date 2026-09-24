"""D-575: matemática pura da junção de dois cortes.

O que está sob teste é a distinção entre os dois relógios do corte — desvios em
tempo da live (absoluto) e cenas/regiões em tempo do bruto (relativo) — porque
confundi-los é o defeito que estica a timeline do editor.
"""

from app.domain.corte.juncao_cortes import (
    CAMPOS_TEMPO_CENA,
    MOTIVO_VAO,
    deslocar_tempos,
    desvio_do_vao,
    duracao_liquida,
    emendar_texto,
    juntar_desvios,
)

# ─── duracao_liquida ────────────────────────────────────────────────────────


def test_duracao_liquida_desconta_os_trechos_removidos():
    assert duracao_liquida(0.0, 100.0, [{"inicio_seg": 30.0, "fim_seg": 40.0}]) == 90.0


def test_duracao_liquida_de_span_sem_desvios_e_o_span_inteiro():
    assert duracao_liquida(10.0, 70.0, []) == 60.0


def test_duracao_liquida_nao_conta_sobreposicao_duas_vezes():
    """Dois desvios sobrepostos removem 20s, não 30s — o cursor resolve."""
    desvios = [
        {"inicio_seg": 10.0, "fim_seg": 30.0},
        {"inicio_seg": 20.0, "fim_seg": 30.0},
    ]
    assert duracao_liquida(0.0, 100.0, desvios) == 80.0


def test_duracao_liquida_de_span_degenerado_e_zero():
    assert duracao_liquida(50.0, 50.0, []) == 0.0


# ─── desvio_do_vao ──────────────────────────────────────────────────────────


def test_vao_entre_cortes_separados_vira_trecho_a_remover():
    vao = desvio_do_vao(720.0, 900.0)

    assert vao is not None
    assert vao["inicio_seg"] == 720.0
    assert vao["fim_seg"] == 900.0
    assert vao["motivo"] == MOTIVO_VAO


def test_cortes_encostados_nao_geram_vao():
    assert desvio_do_vao(720.0, 720.0) is None


def test_cortes_sobrepostos_nao_geram_vao():
    assert desvio_do_vao(720.0, 700.0) is None


# ─── juntar_desvios ─────────────────────────────────────────────────────────


def test_desvios_dos_dois_cortes_se_juntam_em_ordem_com_o_vao_no_meio():
    juntos = juntar_desvios(
        [{"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"}],
        [{"inicio_seg": 130.0, "fim_seg": 140.0, "motivo": "B"}],
        fim_primeiro=100.0,
        inicio_segundo=120.0,
    )

    assert [(d["inicio_seg"], d["fim_seg"]) for d in juntos] == [
        (10.0, 20.0),
        (100.0, 120.0),
        (130.0, 140.0),
    ]
    assert juntos[1]["motivo"] == MOTIVO_VAO


def test_juncao_preserva_a_proveniencia_de_cada_desvio():
    """Não mesclamos sobreposições justamente para não apagar `origem`."""
    juntos = juntar_desvios(
        [{"inicio_seg": 10.0, "fim_seg": 30.0, "origem": "claude"}],
        [{"inicio_seg": 20.0, "fim_seg": 40.0, "origem": "silencio"}],
        fim_primeiro=50.0,
        inicio_segundo=50.0,
    )

    assert [d["origem"] for d in juntos] == ["claude", "silencio"]


# ─── deslocar_tempos ────────────────────────────────────────────────────────


def test_cena_do_segundo_corte_anda_pela_duracao_liquida_do_primeiro():
    deslocadas = deslocar_tempos(
        [{"inicio": 5.0, "fim": 12.0, "inicio_seg": 5.0, "fim_seg": 12.0, "texto": "oi"}],
        90.0,
        CAMPOS_TEMPO_CENA,
    )

    assert deslocadas[0]["inicio"] == 95.0
    assert deslocadas[0]["fim_seg"] == 102.0
    assert deslocadas[0]["texto"] == "oi"


def test_deslocar_ignora_campo_ausente_e_item_invalido():
    deslocadas = deslocar_tempos([{"inicio": 1.0}, "lixo"], 10.0, CAMPOS_TEMPO_CENA)

    assert deslocadas[0] == {"inicio": 11.0}
    assert deslocadas[1] == "lixo"


# ─── emendar_texto ──────────────────────────────────────────────────────────


def test_emenda_separa_os_dois_textos_por_paragrafo():
    assert emendar_texto("Primeiro.", "Segundo.") == "Primeiro.\n\nSegundo."


def test_emenda_nao_duplica_texto_identico():
    assert emendar_texto("Igual", "Igual") == "Igual"


def test_emenda_com_lado_vazio_devolve_o_outro():
    assert emendar_texto("", "Só o segundo") == "Só o segundo"
    assert emendar_texto("Só o primeiro", "") == "Só o primeiro"
