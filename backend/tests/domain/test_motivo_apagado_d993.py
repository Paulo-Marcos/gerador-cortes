"""D-993: vocabulário fechado do motivo de apagar uma proposta, e a contagem."""

from app.domain.corte.motivo_apagado import (
    SEM_MOTIVO,
    SLUGS_MOTIVOS_APAGADO,
    contar_apagados_por_motivo,
    normalizar_motivo_apagado,
)


def test_slug_do_vocabulario_passa_como_esta():
    assert normalizar_motivo_apagado(" repetido ") == "repetido"


def test_sem_motivo_e_slug_desconhecido_viram_vazio():
    assert normalizar_motivo_apagado(None) == ""
    assert normalizar_motivo_apagado("") == ""
    assert normalizar_motivo_apagado("slug_velho") == ""


def test_contagem_traz_todo_slug_mesmo_com_zero():
    contagem = contar_apagados_por_motivo([])

    assert contagem["total"] == 0
    assert list(contagem["por_motivo"]) == [*SLUGS_MOTIVOS_APAGADO, SEM_MOTIVO]
    assert set(contagem["por_motivo"].values()) == {0}


def test_contagem_separa_motivo_e_ausencia_dele():
    contagem = contar_apagados_por_motivo(["repetido", "repetido", "", None, "slug_velho"])

    assert contagem["total"] == 5
    assert contagem["por_motivo"]["repetido"] == 2
    assert contagem["por_motivo"][SEM_MOTIVO] == 3
