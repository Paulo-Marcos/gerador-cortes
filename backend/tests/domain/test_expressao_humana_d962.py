"""D-962: a cara do apresentador na capa é humana e contida, não de clickbait.

Com os quadros da live, o pedido mandava copiar "exatamente" olhos e
sobrancelhas — e o quadro pega o apresentador no meio da fala, com a
sobrancelha no alto; o gerador ainda exagera. A capa saía com olhar desafiador
ao lado de um Lula sóbrio. A expressão passa a vir dos quadros em intensidade
natural, e as fotos do banco (identidade) vão junto dos quadros, não no lugar.
"""

from __future__ import annotations

from app.domain.canal.protagonista_da_capa import bloco_do_modo
from app.domain.compartilhado.chatgpt_imagem import EXPRESSAO_DOS_QUADROS, montar_pedido

QUADROS = ["quadro-da-live-1.jpg", "quadro-da-live-2.jpg"]
FOTOS = ["grade-de-expressoes-masculinas.png"]
PROMPT = (
    '[APRESENTADOR="grade-de-expressoes-masculinas"]\n'
    "MAIN CHARACTER (left): Wide-eyed ironic campaign fervour, both eyebrows arched high.\n"
    "EXPRESSION (host): exactly the face, both eyebrows arched symmetrically high."
)


class TestExpressaoContida:
    def test_a_linha_dos_quadros_nao_manda_copiar_sobrancelhas_exatas(self):
        assert "exactly the facial expression" not in EXPRESSAO_DOS_QUADROS
        assert "same eyes, brows" not in EXPRESSAO_DOS_QUADROS

    def test_a_linha_dos_quadros_pede_intensidade_natural_e_vale_sobre_o_resto(self):
        assert "natural, human" in EXPRESSAO_DOS_QUADROS
        assert "overrides any other description of the host's face" in EXPRESSAO_DOS_QUADROS
        assert "clickbait" in EXPRESSAO_DOS_QUADROS

    def test_o_capista_e_orientado_a_escrever_cara_humana_e_contida(self):
        bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=["grade"])

        assert "humana e contida" in bloco
        assert "sobrancelhas arqueadas" in bloco


class TestFotosJuntoDosQuadros:
    def test_o_pedido_nomeia_quadros_e_fotos_com_papeis_distintos(self):
        pedido = montar_pedido(
            PROMPT,
            "16:9",
            fotos_do_apresentador=QUADROS,
            quadros_da_live=True,
            fotos_de_referencia=FOTOS,
        )

        fim = pedido.rsplit("\n\n", 1)[-1]
        assert "quadro-da-live-1.jpg, quadro-da-live-2.jpg" in fim
        assert "grade-de-expressoes-masculinas.png" in fim
        assert "intensidade natural" in fim
        assert "both eyebrows arched symmetrically high" not in pedido

    def test_sem_fotos_no_banco_o_pedido_fala_so_dos_quadros(self):
        pedido = montar_pedido(PROMPT, "16:9", fotos_do_apresentador=QUADROS, quadros_da_live=True)

        assert "fotos do banco" not in pedido.rsplit("\n\n", 1)[-1]
