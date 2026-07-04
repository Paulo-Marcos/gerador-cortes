"""Testes para `app.domain.variacao_prompt` (meta-prompt dinâmico)."""

from __future__ import annotations

from app.domain.variacao_prompt import _LENTES, bloco_variacao, dica_variacao


class TestDicaVariacao:
    def test_retorna_lente_pertencente_ao_tipo(self):
        for tipo, lentes in _LENTES.items():
            if not lentes:
                # Tipos com repertório propositalmente vazio (tipografia,
                # layout_texto, apoio_layout) não sorteiam — a variação
                # acontece pela memória global das VARIATION_TAGS.
                continue
            for _ in range(20):  # cobre a aleatoriedade
                assert dica_variacao(tipo) in lentes

    def test_tipo_sem_lente_retorna_vazio(self):
        assert dica_variacao("trechos") == ""
        assert dica_variacao("desconhecido") == ""
        # Tipos cujo repertório foi esvaziado (texto/layout/roupa) também retornam ""
        assert dica_variacao("thumbnail_texto") == ""
        assert dica_variacao("thumbnail_layout_texto") == ""
        assert dica_variacao("thumbnail_apoio_layout") == ""
        assert dica_variacao("thumbnail_roupa") == ""


class TestBlocoVariacao:
    def test_inclui_cabecalho_e_dica(self):
        bloco = bloco_variacao("cortes")
        assert "VARIAÇÃO DESTA EXECUÇÃO" in bloco
        assert bloco.strip().endswith(tuple(_LENTES["cortes"]))

    def test_vazio_para_tipo_sem_lente(self):
        assert bloco_variacao("trechos") == ""
