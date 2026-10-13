"""D-909: as fotos do apresentador se casam pelo NOME do arquivo.

O Capista pede expressões numa linha do prompt; a função pura casa com os
rótulos (sem acento, sem caixa, sem sufixo numérico) e completa o que faltar
por sorteio determinístico — o mesmo prompt, as mesmas fotos.
"""

import pytest
from app.domain.canal.fotos_do_apresentador import (
    escolher_fotos,
    expressoes_do_prompt,
    nome_de_foto_valido,
    rotulo_da_foto,
    rotulos_disponiveis,
    semente_do_prompt,
)
from app.domain.compartilhado.erros import PedidoInvalido

BANCO = [
    "pensativo.jpg",
    "pensativo-2.jpg",
    "indignado.png",
    "rindo.webp",
    "serio.jpg",
    "assustado.jpg",
    "sorrindo-de-canto.jpg",
]


class TestRotulo:
    @pytest.mark.parametrize(
        ("arquivo", "rotulo"),
        [
            ("pensativo.jpg", "pensativo"),
            ("Indignado-2.PNG", "indignado"),
            ("indignação_3.jpg", "indignacao"),
            ("Sorrindo de Canto.webp", "sorrindo-de-canto"),
            ("SÉRIO 10.jpeg", "serio"),
        ],
    )
    def test_o_nome_do_arquivo_e_o_rotulo(self, arquivo, rotulo):
        assert rotulo_da_foto(arquivo) == rotulo

    def test_rotulos_do_banco_sem_repeticao(self):
        assert rotulos_disponiveis(["pensativo.jpg", "pensativo-2.jpg", "rindo.png"]) == [
            "pensativo",
            "rindo",
        ]


class TestNomeEmDisco:
    def test_acento_sai_sem_virar_hifen(self):
        assert nome_de_foto_valido("Indignação 2.JPG") == "indignacao-2.jpg"

    def test_nao_vira_caminho_fora_da_pasta(self):
        assert nome_de_foto_valido("../../fotos/rindo.png") == "rindo.png"

    @pytest.mark.parametrize("nome", ["pensativo.gif", "semextensao", ".jpg", "!!!.jpg"])
    def test_recusa_o_que_nao_e_foto_com_rotulo(self, nome):
        with pytest.raises(PedidoInvalido):
            nome_de_foto_valido(nome)


class TestExpressoesDoPrompt:
    def test_le_a_linha_do_capista(self):
        prompt = (
            '[VARIATION_TAGS] cenario="estúdio"\n'
            '[APRESENTADOR="Pensativo, INDIGNADO; rindo"]\n\nA host at a desk.'
        )
        assert expressoes_do_prompt(prompt) == ["pensativo", "indignado", "rindo"]

    def test_sem_a_linha_nao_ha_pedido(self):
        assert expressoes_do_prompt('[VARIATION_TAGS] cenario="x"\n\nA frog.') == []

    def test_linha_quebrada_nao_derruba(self):
        assert expressoes_do_prompt('[APRESENTADOR="pensativo') == []

    def test_repeticao_conta_uma_vez(self):
        assert expressoes_do_prompt('[APRESENTADOR="sério, Serio"]') == ["serio"]


class TestEscolha:
    def test_atende_as_expressoes_pedidas_na_ordem(self):
        escolhidas = escolher_fotos(["indignado", "rindo"], BANCO, semente=1)

        assert escolhidas[:2] == ["indignado.png", "rindo.webp"]
        assert len(escolhidas) == 3

    def test_casa_sem_acento_nem_caixa(self):
        assert escolher_fotos(["Indignação"], ["indignacao.jpg"], semente=0) == ["indignacao.jpg"]

    def test_expressao_generica_atende_o_rotulo_detalhado(self):
        assert escolher_fotos(["sorrindo"], BANCO, semente=0)[0] == "sorrindo-de-canto.jpg"

    def test_nunca_passa_de_tres(self):
        pedidas = ["pensativo", "indignado", "rindo", "serio", "assustado"]
        escolhidas = escolher_fotos(pedidas, BANCO, semente=0)

        assert [rotulo_da_foto(nome) for nome in escolhidas] == ["pensativo", "indignado", "rindo"]

    def test_entre_duas_fotos_da_mesma_expressao_a_semente_decide(self):
        vistas = {escolher_fotos(["pensativo"], BANCO, semente=s)[0] for s in range(40)}

        assert vistas == {"pensativo.jpg", "pensativo-2.jpg"}

    def test_o_que_falta_completa_com_expressoes_diferentes(self):
        escolhidas = escolher_fotos(["pensativo"], BANCO, semente=7)

        assert len({rotulo_da_foto(nome) for nome in escolhidas}) == 3

    def test_mesmo_prompt_mesmas_fotos(self):
        semente = semente_do_prompt("um prompt qualquer")

        assert escolher_fotos([], BANCO, semente=semente) == escolher_fotos(
            [], BANCO, semente=semente_do_prompt("um prompt qualquer")
        )

    def test_cortes_diferentes_nao_anexam_sempre_as_mesmas_tres(self):
        trincas = {
            tuple(escolher_fotos([], BANCO, semente=semente_do_prompt(f"corte {n}")))
            for n in range(20)
        }

        assert len(trincas) > 5

    def test_expressao_que_o_banco_nao_tem_cai_no_sorteio(self):
        escolhidas = escolher_fotos(["furioso"], ["rindo.jpg", "serio.jpg"], semente=3)

        assert sorted(escolhidas) == ["rindo.jpg", "serio.jpg"]

    def test_banco_vazio_nao_anexa_nada(self):
        assert escolher_fotos(["pensativo"], [], semente=0) == []
