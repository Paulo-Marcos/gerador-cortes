"""D-911: o contrato dos componentes do palco (estilo, cabeçalho, placa)."""

from __future__ import annotations

import pytest
from app.domain.canal import palco_componentes as pc
from app.domain.compartilhado.erros import PedidoInvalido


class TestMesclar:
    def test_edicao_parcial_so_muda_o_que_veio(self):
        novo = pc.mesclar(pc.PADRAO, {"cabecalho": {"nome": " Pedro Ivo "}})
        assert novo.cabecalho.nome == "Pedro Ivo"
        assert novo.cabecalho.ativo is True
        assert novo.cabecalho.handle == ""
        assert novo.estilo == "atual"
        assert novo.placa.ativo is True

    def test_desliga_componentes(self):
        novo = pc.mesclar(pc.PADRAO, {"cabecalho": {"ativo": False}, "placa": {"ativo": False}})
        assert novo.cabecalho.ativo is False
        assert novo.placa.ativo is False

    def test_estilo_limpo(self):
        assert pc.mesclar(pc.PADRAO, {"estilo": "LIMPO"}).estilo == "limpo"

    def test_estilo_desconhecido_e_erro(self):
        with pytest.raises(pc.EstiloDePalcoInvalido):
            pc.mesclar(pc.PADRAO, {"estilo": "neon"})

    def test_texto_longo_e_cortado(self):
        novo = pc.mesclar(pc.PADRAO, {"cabecalho": {"handle": "x" * 200}})
        assert len(novo.cabecalho.handle) == 60

    def test_para_dict_e_normalizar_fecham_o_ciclo(self):
        novo = pc.mesclar(
            pc.PADRAO,
            {"estilo": "limpo", "cabecalho": {"nome": "A", "imagem": "cabecalho.png"}},
        )
        assert pc.normalizar(novo.para_dict()) == novo


class TestNormalizar:
    def test_estilo_desconhecido_gravado_cai_no_padrao(self):
        assert pc.normalizar({"estilo": "sumiu", "placa": {"ativo": False}}).placa.ativo is False
        assert pc.normalizar({"estilo": "sumiu"}).estilo == "atual"

    def test_lixo_vira_padrao(self):
        assert pc.normalizar("nao e dict") == pc.PADRAO
        assert pc.normalizar(None) == pc.PADRAO


class TestPropsParaRenderer:
    def test_cabecalho_vazio_herda_da_identidade(self):
        props = pc.props_para_renderer(
            pc.mesclar(pc.PADRAO, {"estilo": "limpo"}),
            nome_do_canal="Pedro Ivo",
            handle_do_canal="pedroivosa",
            imagem_servida="mascote/apresentador.png",
        )
        assert props == {
            "estilo": "limpo",
            "cabecalho": {
                "ativo": True,
                "nome": "Pedro Ivo",
                "handle": "@pedroivosa",
                "imagem": "mascote/apresentador.png",
            },
            "placa": {"ativo": True},
        }

    def test_cabecalho_preenchido_vence_a_identidade(self):
        props = pc.props_para_renderer(
            pc.mesclar(pc.PADRAO, {"cabecalho": {"nome": "Sapo", "handle": "@sapo"}}),
            nome_do_canal="Pedro Ivo",
            handle_do_canal="@pedroivosa",
            imagem_servida="",
        )
        assert props["cabecalho"]["nome"] == "Sapo"
        assert props["cabecalho"]["handle"] == "@sapo"

    def test_handle_leva_um_arroba_so(self):
        assert pc.com_handle("@@pedro") == "@pedro"
        assert pc.com_handle("   ") == ""


class TestImagem:
    def test_extensao_pelo_content_type(self):
        assert pc.extensao_da_imagem("image/png") == ".png"
        assert pc.extensao_da_imagem("image/jpeg; charset=binary") == ".jpg"

    def test_formato_recusado(self):
        with pytest.raises(PedidoInvalido):
            pc.extensao_da_imagem("image/gif")
