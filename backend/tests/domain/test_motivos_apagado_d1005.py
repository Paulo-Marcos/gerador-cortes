"""D-1005: um corte proposto pode ser apagado por mais de um motivo."""

from app.domain.corte.motivo_apagado import (
    SEM_MOTIVO,
    contar_apagados_por_motivo,
    motivos_apagado,
    normalizar_motivo_apagado,
)


def test_varios_motivos_saem_na_ordem_do_vocabulario_sem_repeticao():
    assert motivos_apagado("repetido|tema_fraco|repetido") == ["tema_fraco", "repetido"]


def test_slug_desconhecido_sai_e_os_conhecidos_ficam():
    assert motivos_apagado("slug_velho| curto_demais ") == ["curto_demais"]


def test_registro_antigo_de_um_motivo_so_e_lido_como_lista():
    assert motivos_apagado("repetido") == ["repetido"]
    assert motivos_apagado("") == []
    assert motivos_apagado(None) == []


def test_gravar_junta_os_motivos_conhecidos():
    assert (
        normalizar_motivo_apagado("problema_tecnico|tema_fraco|x") == "tema_fraco|problema_tecnico"
    )
    assert normalizar_motivo_apagado("slug_velho") == ""


def test_contagem_soma_cada_motivo_marcado_e_o_total_conta_apagados():
    contagem = contar_apagados_por_motivo(["tema_fraco|repetido", "repetido", "", "x"])

    assert contagem["total"] == 4
    assert contagem["por_motivo"]["tema_fraco"] == 1
    assert contagem["por_motivo"]["repetido"] == 2
    assert contagem["por_motivo"][SEM_MOTIVO] == 2
