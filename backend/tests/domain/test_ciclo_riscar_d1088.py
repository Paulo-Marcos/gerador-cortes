"""D-1088: quem o operador pode riscar (RN-04)."""

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte import ciclo_corte
from app.domain.corte.ciclo_corte import CorteNoYouTube, TransicaoDeCorteInvalida


@pytest.mark.parametrize("atual", ["proposto", "aprovado", "processado"])
def test_o_operador_risca_de_qualquer_etapa(atual):
    ciclo_corte.validar_riscar(atual, no_youtube=False)


def test_riscar_de_novo_nao_e_erro():
    """O motivo chega depois do R: é o mesmo pedido, repetido com o motivo."""
    ciclo_corte.validar_riscar("rejeitado", no_youtube=False)


@pytest.mark.parametrize("atual", ["proposto", "aprovado", "processado"])
def test_corte_no_youtube_nao_se_risca(atual):
    with pytest.raises(CorteNoYouTube, match="Já está no YouTube"):
        ciclo_corte.validar_riscar(atual, no_youtube=True)


def test_a_recusa_do_youtube_e_um_pedido_invalido():
    """É o significado que o tratador global responde com 400."""
    assert issubclass(CorteNoYouTube, PedidoInvalido)


def test_status_desconhecido_nao_se_risca():
    with pytest.raises(TransicaoDeCorteInvalida, match="não pode ser riscado"):
        ciclo_corte.validar_riscar("editado", no_youtube=False)


def test_riscado_fica_fora_da_publicacao():
    assert ciclo_corte.REJEITADO not in ciclo_corte.CONTAM_NA_PUBLICACAO


def test_o_patch_continua_sem_gravar_rejeitado():
    """Riscar solta a mídia; um PATCH de status deixaria a mídia no disco."""
    with pytest.raises(TransicaoDeCorteInvalida):
        ciclo_corte.validar_pedido_do_operador("aprovado", "rejeitado")


@pytest.mark.parametrize(
    ("anterior", "volta"),
    [
        ("aprovado", "aprovado"),
        # Riscar soltou o vídeo final: sem ele, o processado renderiza de novo.
        ("processado", "aprovado"),
        ("proposto", "proposto"),
        # Riscado antes de o app guardar a etapa: volta à curadoria.
        ("", "proposto"),
    ],
)
def test_trazer_de_volta_devolve_a_etapa(anterior, volta):
    assert ciclo_corte.status_ao_trazer_de_volta("rejeitado", anterior) == volta


def test_so_se_traz_de_volta_um_corte_riscado():
    with pytest.raises(TransicaoDeCorteInvalida, match="não está riscado"):
        ciclo_corte.status_ao_trazer_de_volta("proposto", "aprovado")
