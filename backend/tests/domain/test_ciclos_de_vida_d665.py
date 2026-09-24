"""Ciclos de vida de Corte e Projeto no domínio (D-665)."""

import pytest
from app.domain import ciclo_corte
from app.domain.ciclo_corte import TransicaoDeCorteInvalida
from app.domain.projeto import ciclo_projeto
from app.models import StatusCorte, StatusProjeto


class TestEspelhoDosEnums:
    """O domain não importa models; estes testes impedem que as listas divirjam."""

    def test_status_de_corte_iguais_aos_do_enum(self):
        assert ciclo_corte.STATUS_DO_CORTE == {s.value for s in StatusCorte}

    def test_status_de_projeto_iguais_aos_do_enum(self):
        assert ciclo_projeto.STATUS_DO_PROJETO == {s.value for s in StatusProjeto}


class TestCortepedidoDoOperador:
    @pytest.mark.parametrize(
        ("atual", "novo"),
        [
            ("proposto", "aprovado"),
            ("aprovado", "proposto"),
            ("processado", "proposto"),
            ("rejeitado", "proposto"),
            # O botão de aprovar num corte rejeitado antigo (66 na PROD).
            ("rejeitado", "aprovado"),
        ],
    )
    def test_transicoes_que_o_app_faz_hoje(self, atual, novo):
        ciclo_corte.validar_pedido_do_operador(atual, novo)

    def test_repetir_o_status_atual_nao_e_erro(self):
        ciclo_corte.validar_pedido_do_operador("aprovado", "aprovado")

    def test_status_inexistente_e_recusado_com_a_lista_valida(self):
        with pytest.raises(TransicaoDeCorteInvalida, match="não existe.*aprovado"):
            ciclo_corte.validar_pedido_do_operador("proposto", "aprovadoo")

    def test_editado_deixou_de_existir(self):
        with pytest.raises(TransicaoDeCorteInvalida, match="não existe"):
            ciclo_corte.validar_pedido_do_operador("aprovado", "editado")

    @pytest.mark.parametrize(
        ("atual", "novo"),
        [
            ("proposto", "processado"),  # processado é trabalho do render
            ("aprovado", "processado"),
            ("processado", "aprovado"),
            ("proposto", "rejeitado"),  # rejeitar hoje exclui o corte
        ],
    )
    def test_o_operador_nao_pula_etapas(self, atual, novo):
        with pytest.raises(TransicaoDeCorteInvalida, match="não pode passar"):
            ciclo_corte.validar_pedido_do_operador(atual, novo)


class TestCortePeloSistema:
    @pytest.mark.parametrize("atual", ["proposto", "aprovado", "processado"])
    def test_render_e_export_marcam_processado(self, atual):
        assert ciclo_corte.sistema_pode_marcar(atual, "processado")

    def test_corte_rejeitado_nao_vira_processado(self):
        assert not ciclo_corte.sistema_pode_marcar("rejeitado", "processado")


class TestProjeto:
    @pytest.mark.parametrize(
        ("atual", "novo"),
        [
            ("pendente", "baixando"),
            ("baixando", "transcrevendo"),
            ("transcrevendo", "pronto"),
            ("pronto", "analisando"),
            ("analisando", "analisado"),
            ("baixando", "erro"),
            ("erro", "pendente"),  # reiniciar download
            ("analisado", "pronto"),  # reanalisar
            ("erro", "pronto"),  # refazer transcrição (D-444)
            ("analisando", "pronto"),  # análise falhou, volta ao anterior
            ("analisado", "analisando"),
        ],
    )
    def test_transicoes_que_o_app_faz_hoje(self, atual, novo):
        assert ciclo_projeto.transicao_permitida(atual, novo)

    @pytest.mark.parametrize(
        ("atual", "novo"),
        [
            ("pendente", "analisado"),
            ("analisado", "baixando"),
            ("pronto", "transcrevendo"),
            ("pronto", "inventado"),
        ],
    )
    def test_saltos_e_status_inexistente_nao(self, atual, novo):
        assert not ciclo_projeto.transicao_permitida(atual, novo)
