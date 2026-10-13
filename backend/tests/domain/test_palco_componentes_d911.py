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


class TestFundo:
    def test_padrao_e_a_reticula_com_aurora(self):
        assert pc.PADRAO.fundo == "reticula-aurora"

    def test_troca_o_fundo(self):
        assert pc.mesclar(pc.PADRAO, {"fundo": "linho"}).fundo == "linho"

    def test_fundo_desconhecido_e_erro_na_edicao(self):
        with pytest.raises(pc.FundoDePalcoInvalido):
            pc.mesclar(pc.PADRAO, {"fundo": "carbono"})

    def test_fundo_gravado_que_saiu_cai_no_padrao(self):
        assert pc.normalizar({"fundo": "carbono"}).fundo == "reticula-aurora"

    def test_fundo_vai_para_o_renderer(self):
        props = pc.props_para_renderer(
            pc.mesclar(pc.PADRAO, {"estilo": "limpo", "fundo": "aurora"}),
            nome_do_canal="",
            handle_do_canal="",
            imagem_servida="",
        )
        assert props["fundo"] == "aurora"

    def test_fundos_espelham_o_renderer(self):
        from pathlib import Path

        raiz = Path(__file__).resolve().parents[3]
        fonte = (raiz / "video-renderer/src/youtube-bg/palco-limpo.tsx").read_text(encoding="utf-8")
        lista = ", ".join(f'"{f}"' for f in pc.FUNDOS)
        assert f"FUNDOS_DO_LIMPO = [{lista}]" in fonte
        assert f'FUNDO_PADRAO_DO_LIMPO: FundoDoLimpo = "{pc.FUNDO_PADRAO}"' in fonte


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
            "fundo": "reticula-aurora",
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
