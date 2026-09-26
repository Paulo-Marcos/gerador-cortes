"""D-605: onde a legenda do short senta no quadro.

O relato que originou a demanda: "a depender do Palco, ela fica em cima da
pessoa". A legenda saia num ponto cravado no codigo (base a 18% da altura,
centralizada, 80% de largura), e esse ponto acerta num arranjo de palco e erra
no seguinte — dentro do MESMO corte.

O que precisa de guarda aqui nao e a estetica do rodape. Sao tres fronteiras que
quebram em silencio:

1. **Nao regressao.** Short gravado antes desta demanda tem zero nas tres
   colunas, e zero significa "nao decidi". Se o default escorregar, todo short
   antigo muda de lugar sem ninguem pedir.
2. **A heranca ser PARCIAL.** Preset de palco salvo antes desta demanda volta
   com zero, e zero no preset e "este preset nao decide onde" — nunca "no lugar
   de sempre". Materializar defaults na gravacao congelaria o sistema do dia.
3. **Sair do quadro.** Uma legenda com metade das letras fora do 9:16 nao e uma
   escolha editorial, e um render perdido.
"""

import pytest
from app.domain.short.legenda_short import (
    LARGURA_MAX,
    LARGURA_MIN,
    LARGURA_PADRAO,
    POSICAO_X_MAX,
    POSICAO_X_MIN,
    POSICAO_X_PADRAO,
    POSICAO_Y_MAX,
    POSICAO_Y_MIN,
    POSICAO_Y_PADRAO,
    SAFE_ZONE,
    lugar_do_preset,
    normalizar_largura,
    normalizar_x,
    normalizar_y,
    para_payload,
)


class TestNaoRegressao:
    """O lugar de sempre continua sendo o lugar de sempre."""

    def test_sem_nada_decidido_a_base_e_o_alto_da_safe_zone(self):
        # 82 e exatamente o `bottom: height * 0.18` que o renderer tinha cravado.
        assert POSICAO_Y_PADRAO == 100 - SAFE_ZONE * 100
        assert para_payload() == {"x": 50.0, "y": 82.0, "largura": 80.0}

    def test_zero_em_qualquer_campo_e_o_padrao_dele(self):
        assert normalizar_x(0) == POSICAO_X_PADRAO
        assert normalizar_y(0) == POSICAO_Y_PADRAO
        assert normalizar_largura(0) == LARGURA_PADRAO

    @pytest.mark.parametrize("torto", [None, "", "meio", float("nan"), [], {}])
    def test_valor_ilegivel_cai_no_padrao_em_vez_de_levantar(self, torto):
        # Degradar, e nao quebrar: um numero torto vindo do banco nao pode custar
        # o render inteiro do short — e a regra desta cascata toda.
        assert normalizar_y(torto) == POSICAO_Y_PADRAO


class TestFaixaUtil:
    """O gesto manda, mas nao pode jogar o texto para fora do quadro."""

    @pytest.mark.parametrize(
        ("valor", "esperado"),
        [(300, POSICAO_Y_MAX), (1, POSICAO_Y_MIN), (45, 45.0)],
    )
    def test_y_e_grudado_na_faixa(self, valor, esperado):
        assert normalizar_y(valor) == esperado

    @pytest.mark.parametrize(
        ("valor", "esperado"),
        [(-5, POSICAO_X_PADRAO), (120, POSICAO_X_MAX), (3, POSICAO_X_MIN)],
    )
    def test_x_e_grudado_na_faixa(self, valor, esperado):
        assert normalizar_x(valor) == esperado

    def test_largura_nao_encolhe_ate_virar_coluna_de_uma_palavra(self):
        assert normalizar_largura(5) == LARGURA_MIN
        assert normalizar_largura(999) == LARGURA_MAX

    def test_o_minimo_de_cada_eixo_e_maior_que_zero(self):
        # O que sustenta o vocabulario inteiro: se algum minimo fosse zero, um
        # valor legitimo seria lido como "nao decidi" na `com_palco_do_corte`.
        assert POSICAO_X_MIN > 0
        assert POSICAO_Y_MIN > 0
        assert LARGURA_MIN > 0


class TestLugarDoPreset:
    """O preset de palco decide por campo, ou nao decide."""

    def test_preset_vazio_nao_decide_nada(self):
        assert lugar_do_preset({}) == {
            "legenda_x": 0.0,
            "legenda_y": 0.0,
            "legenda_largura": 0.0,
        }

    def test_preset_antigo_sem_os_campos_continua_sem_decidir(self):
        # O payload real de um palco salvo antes da demanda: arranjo, fundo e a
        # aparencia da legenda, sem lugar nenhum.
        antigo = {"arranjo": "dividida_empilhada", "fundo": "topographic", "legenda_cor": "#fff"}
        assert lugar_do_preset(antigo)["legenda_y"] == 0.0

    def test_campo_a_campo_e_normalizado_quando_decide(self):
        lugar = lugar_do_preset({"legenda_y": 300, "legenda_largura": 55})
        assert lugar == {
            "legenda_x": 0.0,
            "legenda_y": POSICAO_Y_MAX,
            "legenda_largura": 55.0,
        }


class TestParaPayload:
    """O renderer recebe onde desenhar — nunca a regra de heranca."""

    def test_sai_sempre_preenchido(self):
        # O componente do renderer tem default proprio, mas depender dele faria a
        # previa e o arquivo resolverem a cascata em dois lugares. Um so resolve.
        payload = para_payload(y=45)
        assert set(payload) == {"x", "y", "largura"}
        assert payload["y"] == 45.0
        assert payload["x"] == POSICAO_X_PADRAO
