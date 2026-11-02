"""D-1006: a lista de motivos de excluir é do canal — acrescentar e esconder."""

import pytest
from app.domain.corte.motivo_apagado import (
    MOTIVOS_APAGADO,
    SEM_MOTIVO,
    contar_apagados_por_motivo,
    normalizar_motivo_apagado,
)
from app.domain.corte.motivos_do_canal import (
    MotivoDeExclusaoInexistente,
    MotivoDeExclusaoInvalido,
    acrescentar_motivo,
    ler_motivos,
    mostrar_motivo,
    motivos_padrao,
    slugs_de_todos,
    slugs_visiveis,
)


def test_canal_que_nunca_editou_tem_os_seis_de_hoje_visiveis():
    padrao = ler_motivos(None)

    assert [(m["slug"], m["rotulo"]) for m in padrao] == [
        (m["slug"], m["rotulo"]) for m in MOTIVOS_APAGADO
    ]
    assert all(m["ativo"] for m in padrao)


def test_motivo_novo_ganha_slug_do_nome_e_entra_visivel_no_fim():
    lista = acrescentar_motivo(motivos_padrao(), "  Opinião   polêmica! ")

    assert lista[-1] == {"slug": "opiniao_polemica", "rotulo": "Opinião polêmica!", "ativo": True}
    assert lista[:-1] == motivos_padrao()


def test_slug_ocupado_ganha_sufixo_mesmo_por_motivo_escondido():
    lista = mostrar_motivo(motivos_padrao(), "repetido", ativo=False)

    assert acrescentar_motivo(lista, "Repetido")[-1]["slug"] == "repetido_2"
    assert acrescentar_motivo(lista, "Sem motivo")[-1]["slug"] == "sem_motivo_2"


@pytest.mark.parametrize("nome", ["", "   ", "!!!", "x" * 41])
def test_nome_vazio_sem_letra_ou_longo_e_recusado(nome):
    with pytest.raises(MotivoDeExclusaoInvalido):
        acrescentar_motivo(motivos_padrao(), nome)


def test_nome_repetido_e_recusado_mesmo_escondido_e_com_outra_caixa():
    lista = mostrar_motivo(motivos_padrao(), "curto_demais", ativo=False)

    with pytest.raises(MotivoDeExclusaoInvalido, match="Já existe"):
        acrescentar_motivo(lista, "curto DEMAIS")


def test_esconder_tira_dos_chips_e_mantem_na_lista_com_o_nome():
    lista = mostrar_motivo(motivos_padrao(), "tema_fraco", ativo=False)

    assert "tema_fraco" not in slugs_visiveis(lista)
    assert "tema_fraco" in slugs_de_todos(lista)
    assert lista[0] == {"slug": "tema_fraco", "rotulo": "Tema não rende", "ativo": False}
    assert slugs_visiveis(mostrar_motivo(lista, "tema_fraco", ativo=True))[0] == "tema_fraco"


def test_esconder_slug_que_nao_e_do_canal_e_recusado():
    with pytest.raises(MotivoDeExclusaoInexistente):
        mostrar_motivo(motivos_padrao(), "nao_existe", ativo=False)


def test_apagar_aceita_so_os_motivos_visiveis_do_canal():
    lista = acrescentar_motivo(
        mostrar_motivo(motivos_padrao(), "repetido", ativo=False), "Polêmico"
    )

    gravado = normalizar_motivo_apagado("repetido|polemico|tema_fraco", slugs_visiveis(lista))

    assert gravado == "tema_fraco|polemico"


def test_contagem_segue_com_o_motivo_escondido_e_o_novo():
    lista = acrescentar_motivo(
        mostrar_motivo(motivos_padrao(), "repetido", ativo=False), "Polêmico"
    )

    contagem = contar_apagados_por_motivo(
        ["repetido", "polemico|tema_fraco"], slugs_de_todos(lista)
    )

    assert contagem["total"] == 2
    assert contagem["por_motivo"]["repetido"] == 1
    assert contagem["por_motivo"]["polemico"] == 1
    assert list(contagem["por_motivo"])[-2:] == ["polemico", SEM_MOTIVO]


def test_lista_gravada_estragada_nao_derruba_a_leitura():
    assert ler_motivos([{"slug": "a", "rotulo": "A"}, {"slug": ""}, "lixo"]) == [
        {"slug": "a", "rotulo": "A", "ativo": True}
    ]
