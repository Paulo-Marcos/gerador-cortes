"""D-565: o titulo-gancho da abertura do short.

O que precisa de guarda aqui nao e a estetica do cartao — e a fronteira entre o
gancho e o resto. Tres coisas quebram em silencio se ninguem vigiar:

1. **Apagar palavra.** A etiqueta da capa ja cometeu esse erro (D-533): cortava
   por palavras para caber num corpo fixo, e "TODO MUNDO ASSINOU EMBAIXO" virava
   "TODO MUNDO ASSINOU...". O gancho nasce com a licao aprendida.
2. **Estourar a composicao.** O operador encurta o trecho DEPOIS de escrever o
   gancho. Sem o corte contra a duracao do short, o Remotion receberia uma
   sequencia maior que a composicao.
3. **Duracao ilegivel.** Numero torto vindo do banco nao pode custar o render.
"""

import pytest
from app.domain.gancho_short import (
    DURACAO_MAX_SEG,
    DURACAO_MIN_SEG,
    DURACAO_PADRAO_SEG,
    MAX_CARACTERES,
    PALAVRAS_MAX,
    PALAVRAS_MIN,
    contar_palavras,
    esta_na_faixa,
    normalizar_duracao,
    normalizar_gancho,
    para_payload,
)


class TestNormalizarGancho:
    def test_colapsa_espaco_sem_mexer_nas_palavras(self):
        assert normalizar_gancho("  ninguem   te   conta   isso ") == "ninguem te conta isso"

    def test_preserva_a_caixa_que_o_operador_escreveu(self):
        """Diferente da etiqueta da capa, que e rotulo: o gancho e frase lida."""
        assert normalizar_gancho("Ninguem te conta ISSO") == "Ninguem te conta ISSO"

    def test_nao_apaga_palavra_de_um_gancho_normal(self):
        texto = "o erro que todo mundo comete"
        assert normalizar_gancho(texto) == texto

    def test_corta_so_no_absurdo(self):
        gigante = " ".join(["palavra"] * 40)
        assert len(normalizar_gancho(gigante)) <= MAX_CARACTERES

    def test_vazio_continua_vazio(self):
        assert normalizar_gancho("") == ""
        assert normalizar_gancho("   ") == ""


class TestFaixaDePalavras:
    @pytest.mark.parametrize("quantidade", [PALAVRAS_MIN, 5, 6, PALAVRAS_MAX])
    def test_dentro_da_faixa(self, quantidade):
        assert esta_na_faixa(" ".join(["x"] * quantidade))

    @pytest.mark.parametrize("quantidade", [0, 1, PALAVRAS_MIN - 1, PALAVRAS_MAX + 1])
    def test_fora_da_faixa(self, quantidade):
        assert not esta_na_faixa(" ".join(["x"] * quantidade))

    def test_conta_ignorando_espaco_extra(self):
        assert contar_palavras("  a   b  ") == 2


class TestNormalizarDuracao:
    def test_valor_util_passa_intacto(self):
        assert normalizar_duracao(3.0) == 3.0

    def test_curto_demais_sobe_para_o_minimo(self):
        """Abaixo de 1,5s a frase e vista, nao lida."""
        assert normalizar_duracao(0.2) == DURACAO_MIN_SEG

    def test_longo_demais_desce_para_o_maximo(self):
        assert normalizar_duracao(30.0) == DURACAO_MAX_SEG

    @pytest.mark.parametrize("torto", [None, "", "abc", 0, -5])
    def test_valor_ilegivel_cai_no_padrao(self, torto):
        assert normalizar_duracao(torto) == DURACAO_PADRAO_SEG


class TestPayload:
    def test_gancho_escrito_vira_payload(self):
        assert para_payload("ninguem te conta isso", 2.5, duracao_short_seg=30.0) == {
            "texto": "ninguem te conta isso",
            "ateSeg": 2.5,
        }

    def test_sem_texto_nao_ha_gancho(self):
        """Short sem gancho e o caso comum, nao um erro."""
        assert para_payload("", 2.5, duracao_short_seg=30.0) is None
        assert para_payload("   ", 2.5, duracao_short_seg=30.0) is None

    def test_nao_ultrapassa_a_duracao_do_short(self):
        """O operador encurta o trecho depois de escrever o gancho."""
        payload = para_payload("oi", 5.0, duracao_short_seg=3.0)
        assert payload is not None
        assert payload["ateSeg"] == 3.0

    def test_short_sem_duracao_conhecida_mantem_a_duracao_pedida(self):
        payload = para_payload("oi", 2.5, duracao_short_seg=0.0)
        assert payload is not None
        assert payload["ateSeg"] == 2.5
