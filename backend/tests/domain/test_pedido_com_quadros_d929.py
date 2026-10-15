"""D-929: o pedido ao ChatGPT quando os anexos são quadros da live.

Com as fotos do banco, o pedido mandava usar as fotos SÓ para a identidade e
tirar a expressão do prompt. Com os quadros, é o contrário: a expressão real
vem deles, e o prompt não pode pedir outra.
"""

from __future__ import annotations

from app.domain.canal.protagonista_da_capa import bloco_do_modo
from app.domain.compartilhado.chatgpt_imagem import (
    EXPRESSAO_DOS_QUADROS,
    MARCA_DA_EXPRESSAO_DO_APRESENTADOR,
    montar_pedido,
    prompt_com_quadros,
)

QUADROS = ["quadro-da-live-1.jpg", "quadro-da-live-2.jpg", "quadro-da-live-3.jpg"]

# Trechos como a skill thumbnail-prompt-expert escreve no modo apresentador.
PROMPT = (
    '[VARIATION_TAGS] pose="inclinado"\n'
    '[APRESENTADOR="grade-de-expressoes-masculinas"]\n\n'
    "MAIN CHARACTER (MODO apresentador) (left): The host shown in the attached reference "
    "photos. Use the reference photos only for his identity — face shape, hair, beard, "
    "proportions across angles; ignore the facial expressions shown in them. Jaw set.\n"
    "EXPRESSION (host): Eyebrows knitted low in fierce incredulity, no smirk.\n"
    "EXPRESSION (second subject): Completely serene."
)


class TestPedidoComQuadros:
    def test_diz_que_os_anexos_sao_quadros_da_live_no_momento_da_frase(self):
        pedido = montar_pedido(PROMPT, "16:9", fotos_do_apresentador=QUADROS, quadros_da_live=True)

        fim = pedido.rsplit("\n\n", 1)[-1]
        assert "quadro-da-live-1.jpg, quadro-da-live-2.jpg, quadro-da-live-3.jpg" in fim
        assert "quadros da live no exato momento em que ele diz a frase da capa" in fim
        assert "identidade E a expressão" in fim

    def test_a_linha_de_expressao_do_apresentador_aponta_para_os_quadros(self):
        pedido = montar_pedido(PROMPT, "16:9", fotos_do_apresentador=QUADROS, quadros_da_live=True)

        assert EXPRESSAO_DOS_QUADROS in pedido
        assert "fierce incredulity" not in pedido
        assert "EXPRESSION (second subject): Completely serene." in pedido

    def test_o_prompt_deixa_de_mandar_ignorar_a_expressao_das_referencias(self):
        pedido = montar_pedido(PROMPT, "16:9", fotos_do_apresentador=QUADROS, quadros_da_live=True)

        assert "ignore" not in pedido
        assert "take his facial expression from them too" in pedido

    def test_variante_curta_das_skills_verticais_tambem_e_trocada(self):
        prompt = "the host, use the reference photos only for identity, ignore their facial expressions, leaning in"

        assert prompt_com_quadros(prompt) == (
            "the host, use the reference photos only for identity; "
            "take his facial expression from them too, leaning in"
        )

    def test_sem_quadros_o_pedido_do_banco_de_fotos_nao_muda(self):
        """Fallback: frase não achada, sem vídeo ou sem rosto — o pedido de antes."""
        fotos = ["grade-de-expressoes-masculinas.png"]

        pedido = montar_pedido(PROMPT, "16:9", fotos_do_apresentador=fotos)

        assert "a expressão e a pose são as do prompt" in pedido
        assert "fierce incredulity" in pedido
        assert "quadros da live" not in pedido


class TestBlocoDoModo:
    def test_o_capista_escreve_a_cara_do_apresentador_na_linha_que_o_robo_troca(self):
        """O bloco viaja no deploy: as três skills recebem a direção sem regravar o corpo."""
        bloco = bloco_do_modo("apresentador", mascote="Sapo", expressoes=["grade"])

        assert "quadros da própria live no momento em que ele diz a frase da capa" in bloco
        assert f"começando por {MARCA_DA_EXPRESSAO_DO_APRESENTADOR}" in bloco

    def test_o_modo_mascote_nao_fala_de_quadros(self):
        assert "quadros" not in bloco_do_modo("mascote", mascote="Sapo", expressoes=[])
