"""D-565 (onda 4): o quadro de capa de um short.

O alvo principal e o ACORDO com a geometria da capa do corte. A faixa segura da
vitrine do perfil e a mesma para qualquer capa 9:16, e aqui ela vive em fracao
(a tela desenha sobre um quadro de tamanho qualquer) enquanto la vive em pixels.
Dois numeros para a mesma medida e uma divergencia esperando acontecer — o teste
de acordo e o que a impede.

O segundo alvo e o instante padrao. Ele parece detalhe e decide a capa de todo
short que o operador nao abrir: com gancho, o quadro precisa cair onde o texto
esta opaco; sem gancho, onde o apresentador ja esta posto.
"""

import pytest
from app.domain.capa_short import (
    FRACAO_SEGURA,
    FRACAO_TOPO_CORTADO,
    GuiaDaVitrine,
    encaixar_instante,
    guia_da_vitrine,
    instante_padrao,
    prompt_da_capa,
)
from app.domain.corte.capa_tiktok import ALTURA, ALTURA_SEGURA, TOPO_SEGURO


class TestAcordoComAGeometriaDaCapaDoCorte:
    """A vitrine recorta igual — os dois modulos nao podem discordar dela."""

    def test_a_fracao_segura_e_a_mesma_medida_em_pixels(self):
        assert FRACAO_SEGURA == ALTURA_SEGURA / ALTURA

    def test_a_faixa_cortada_no_topo_bate_com_o_topo_seguro(self):
        assert round(FRACAO_TOPO_CORTADO * ALTURA) == TOPO_SEGURO


class TestGuiaDaVitrine:
    def test_corta_o_mesmo_tanto_em_cima_e_embaixo(self):
        """O recorte da grade e central; assimetria aqui seria erro de conta."""
        guia = guia_da_vitrine()
        assert guia.topo == guia.base

    def test_sobra_a_faixa_central(self):
        assert guia_da_vitrine().altura_util == pytest.approx(FRACAO_SEGURA)

    def test_as_tres_partes_somam_o_quadro_inteiro(self):
        guia = guia_da_vitrine()
        assert guia.topo + guia.altura_util + guia.base == pytest.approx(1.0)

    def test_altura_util_de_uma_guia_qualquer(self):
        assert GuiaDaVitrine(0.2, 0.3).altura_util == pytest.approx(0.5)


class TestInstantePadrao:
    def test_com_gancho_cai_no_meio_dele(self):
        """No comeco o fade de entrada corre; no fim o de saida ja comecou."""
        assert instante_padrao(30.0, gancho_ate_seg=2.5) == 1.25

    def test_sem_gancho_cai_no_primeiro_terco(self):
        """Mesma escolha da capa do corte, e pelo mesmo motivo."""
        assert instante_padrao(30.0) == 10.0

    def test_gancho_mais_longo_que_o_short_nao_aponta_para_fora(self):
        """Acontece quando o operador encurta as bordas depois de escrever."""
        assert instante_padrao(1.0, gancho_ate_seg=10.0) == 1.0

    @pytest.mark.parametrize("duracao", [0.0, -5.0])
    def test_short_sem_duracao_conhecida_fica_no_primeiro_quadro(self, duracao):
        assert instante_padrao(duracao) == 0.0

    def test_gancho_zerado_e_tratado_como_ausente(self):
        assert instante_padrao(30.0, gancho_ate_seg=0.0) == 10.0


class TestEncaixarInstante:
    def test_valor_dentro_do_video_passa_intacto(self):
        assert encaixar_instante(5.0, 30.0) == 5.0

    def test_depois_do_fim_encosta_no_fim(self):
        assert encaixar_instante(99.0, 30.0) == 30.0

    def test_negativo_encosta_no_comeco(self):
        assert encaixar_instante(-3, 30.0) == 0.0

    @pytest.mark.parametrize("torto", ["abc", None, [], {}])
    def test_valor_ilegivel_vira_primeiro_quadro_em_vez_de_erro(self, torto):
        """Um numero torto no banco nao pode custar a capa inteira."""
        assert encaixar_instante(torto, 30.0) == 0.0

    def test_arredonda_para_centesimo(self):
        assert encaixar_instante(1.23456, 30.0) == 1.23


# D-587: trechos das respostas reais que o PROD recusou em 13/09. O prompt vem em
# ingles, mas a frase da capa nasce DENTRO da arte — em portugues, entre aspas.
_ESTILO = (
    "Vertical 9:16, 1080x1920, editorial 2D illustrated cover, subject and text fully "
    "contained within the central 1080x1080 square, hand-inked contours, cel-shaded "
)


class TestPromptDaCapa:
    @pytest.mark.parametrize(
        "frase",
        [
            'bold uppercase text "a vida do outro não é a sua desculpa" in acid yellow',
            'bold uppercase text "tá dado, e agora você faz o quê" in ultra-black',
            "the text “quem vai parar de fumar por você?” in a single line",
            "the frog's hand points at the text 'você pode fugir' in white outline",
        ],
    )
    def test_frase_da_capa_em_portugues_entre_aspas_nao_recusa(self, frase):
        bruto = _ESTILO + frase + ", high contrast, no watermark."
        assert prompt_da_capa(bruto) == bruto

    def test_resposta_conversando_com_o_operador_continua_recusada(self):
        bruto = (
            "Para escrever o prompt eu preciso saber mais: você poderia me dizer qual e "
            "o mascote do canal e a paleta que ele usa nas capas do YouTube, por favor."
        )
        assert prompt_da_capa(bruto) == ""

    def test_aspas_nao_escondem_conversa_fora_delas(self):
        bruto = (
            _ESTILO + 'text "JUROS". Antes de seguir, você confirma se o mascote e esse mesmo, '
            "ou quer outro personagem na capa?"
        )
        assert prompt_da_capa(bruto) == ""
