"""D-604: o short como colagem de pedacos do bruto.

O pedido foi "um short pega de 0 a 30s e depois de 45 a 60s". O que precisa de
guarda aqui nao e a aritmetica — sao as quatro fronteiras que quebram em
silencio, sem erro nenhum na tela:

1. **A duracao que mente.** `fim - inicio` da 60s num short que tem 45s de
   video. Essa subtracao alimentava a composicao do Remotion, o clamp do gancho,
   a validacao de cenas e o gate de duracao da publicacao. A D-362 congelou
   renders por exatamente esta troca, no corte.
2. **A ordem livre.** O operador pode abrir com o pedaco que vem DEPOIS na live.
   Qualquer `sorted()` escondido desfaz a decisao dele sem avisar.
3. **A nao-regressao.** Short gravado antes desta demanda tem `[]`, e `[]` tem
   de significar exatamente a janela unica de sempre.
4. **O envelope.** Com ordem livre, o primeiro da lista NAO e o mais cedo — um
   `[0]` no lugar de um `min` poria a regua desenhando o short no lugar errado.
"""

import pytest
from app.domain.short.segmentos_short import (
    DURACAO_MINIMA_SEG,
    MAX_SEGMENTOS,
    Segmento,
    SegmentosInvalidos,
    com_offsets,
    de_json,
    duracao_liquida,
    efetivos,
    envelope,
    no_bruto,
    normalizar,
    para_ffmpeg,
    para_json,
    validar,
)

# O caso do relato, e o que o operador pediu invertido: o gancho dos 45s abrindo.
PEDIDO = [Segmento(0.0, 30.0), Segmento(45.0, 60.0)]
GANCHO_PRIMEIRO = [Segmento(45.0, 60.0), Segmento(0.0, 30.0)]


class TestNaoRegressao:
    """Lista vazia e a janela unica de sempre — nada muda para short antigo."""

    def test_vazio_vira_a_janela_unica(self):
        assert efetivos([], inicio_seg=10.0, fim_seg=40.0) == [Segmento(10.0, 40.0)]

    def test_vazio_tem_a_duracao_do_span(self):
        assert duracao_liquida([], inicio_seg=10.0, fim_seg=40.0) == 30.0

    def test_vazio_recorta_uma_janela_so(self):
        assert para_ffmpeg([], inicio_seg=10.0, fim_seg=40.0) == [(10.0, 40.0)]

    def test_vazio_nao_desloca_nada_no_tempo(self):
        # Sem colagem, o instante do bruto e o do short mais o inicio — e
        # exatamente a conta que o enquadramento pelo rosto sempre fez.
        assert no_bruto(15.0, [], inicio_seg=10.0, fim_seg=40.0) == 25.0

    def test_coluna_torta_degrada_para_a_janela_unica(self):
        # A coluna e um JSON no banco, nao um tipo. Um registro ilegivel nao pode
        # custar a tela dos shorts — o pior caso aceitavel e voltar a janela.
        for torto in ["", "nao e json", "{}", "null", None, 42]:
            assert de_json(torto) == []


class TestDuracaoLiquida:
    """A armadilha central da demanda."""

    def test_soma_o_que_toca_e_ignora_o_buraco(self):
        assert duracao_liquida(PEDIDO, inicio_seg=0.0, fim_seg=60.0) == 45.0

    def test_o_span_nao_serve_como_duracao(self):
        # A prova explicita de que os dois numeros divergem: se algum dia alguem
        # voltar a usar `fim - inicio`, este teste diz por que nao pode.
        span = 60.0 - 0.0
        assert duracao_liquida(PEDIDO, inicio_seg=0.0, fim_seg=60.0) != span

    def test_a_ordem_nao_muda_a_duracao(self):
        assert duracao_liquida(GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == 45.0

    def test_sobreposicao_conta_duas_vezes(self):
        # Repetir um instante e escolha editorial (eco), e o video realmente dura
        # mais por causa dela.
        repetido = [Segmento(0.0, 10.0), Segmento(5.0, 10.0)]
        assert duracao_liquida(repetido, inicio_seg=0.0, fim_seg=10.0) == 15.0


class TestOrdemLivre:
    """A ordem da lista e a ordem de toque, e nada aqui a reordena."""

    def test_normalizar_preserva_a_ordem_do_operador(self):
        bruto = [{"inicio_seg": 45, "fim_seg": 60}, {"inicio_seg": 0, "fim_seg": 30}]
        assert normalizar(bruto) == GANCHO_PRIMEIRO

    def test_ida_e_volta_pelo_json_preserva_a_ordem(self):
        assert de_json(para_json(GANCHO_PRIMEIRO)) == GANCHO_PRIMEIRO

    def test_o_ffmpeg_recebe_na_ordem_de_toque(self):
        assert para_ffmpeg(GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == [
            (45.0, 60.0),
            (0.0, 30.0),
        ]

    def test_o_offset_cresce_na_ordem_da_lista(self):
        # O que faz a ordem livre funcionar sem caso especial: o segundo pedaco
        # comeca onde o primeiro acabou, seja ele antes ou depois no bruto.
        assert [
            (s.inicio_seg, off)
            for s, off in com_offsets(GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0)
        ] == [(45.0, 0.0), (0.0, 15.0)]


class TestEnvelope:
    """Onde no bruto o short fica — o que a regua desenha."""

    def test_e_o_min_e_o_max_e_nao_o_primeiro_e_o_ultimo(self):
        assert envelope(GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == (0.0, 60.0)

    def test_um_segmento_so_e_ele_mesmo(self):
        assert envelope([Segmento(12.0, 20.0)], inicio_seg=0.0, fim_seg=60.0) == (12.0, 20.0)


class TestRemapeamento:
    """A ponte entre o tempo do bruto e o tempo do short."""

    def test_do_short_para_o_bruto_respeita_a_ordem(self):
        # 5s de short = 5s dentro do primeiro pedaco, que comeca em 45.
        assert no_bruto(5.0, GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == 50.0
        # 20s de short = 5s dentro do segundo pedaco, que comeca em 0.
        assert no_bruto(20.0, GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == 5.0

    def test_depois_do_fim_gruda_no_ultimo_frame(self):
        # Quem pede um frame prefere o ultimo a um erro.
        assert no_bruto(999.0, GANCHO_PRIMEIRO, inicio_seg=0.0, fim_seg=60.0) == 30.0

    def test_nenhum_instante_do_short_cai_no_buraco(self):
        # O que o enquadramento pelo rosto depende: amostrar o short inteiro e
        # traduzir para o bruto nunca pode devolver um quadro do vao de 30 a 45 —
        # material que o operador tirou fora.
        for decimo in range(0, 450):
            no_arquivo = no_bruto(decimo / 10, PEDIDO, inicio_seg=0.0, fim_seg=60.0)
            assert not (30.0 < no_arquivo < 45.0), f"{decimo / 10}s caiu no buraco"


class TestNormalizar:
    """O que entra na coluna: sem lixo, cortado no fim do bruto."""

    def test_micro_fatia_e_arredondamento_e_nao_trecho(self):
        assert normalizar([{"inicio_seg": 5, "fim_seg": 5.05}]) == []

    def test_segmento_que_passa_do_bruto_encolhe_em_vez_de_ser_recusado(self):
        # Nao e erro do operador: e o bruto que foi regerado mais curto.
        assert normalizar([{"inicio_seg": 10, "fim_seg": 99}], limite_seg=50) == [
            Segmento(10.0, 50.0)
        ]

    def test_segmento_inteiro_fora_do_bruto_desaparece(self):
        assert normalizar([{"inicio_seg": 80, "fim_seg": 99}], limite_seg=50) == []

    def test_o_teto_de_segmentos_e_respeitado_na_leitura(self):
        demais = [{"inicio_seg": i, "fim_seg": i + 1} for i in range(MAX_SEGMENTOS + 5)]
        assert len(de_json(demais)) == MAX_SEGMENTOS

    @pytest.mark.parametrize("torto", [float("nan"), float("inf"), "x", None])
    def test_numero_inutilizavel_derruba_o_segmento_e_nao_o_resto(self, torto):
        # NaN merece teste proprio: passa pelo `float()`, sobrevive a qualquer
        # `min`/`max` e chegaria ao `-ss` do ffmpeg como um render que nao fecha.
        bruto = [{"inicio_seg": torto, "fim_seg": 30}, {"inicio_seg": 45, "fim_seg": 60}]
        assert de_json(bruto) == [Segmento(45.0, 60.0)]


class TestValidar:
    """O que e recusado, e — mais importante — o que NAO e."""

    def test_buraco_e_o_ponto_da_demanda_e_passa(self):
        validar(PEDIDO, limite_seg=60.0)

    def test_ordem_fora_do_relogio_passa(self):
        validar(GANCHO_PRIMEIRO, limite_seg=60.0)

    def test_sobreposicao_passa_porque_repetir_e_escolha(self):
        validar([Segmento(0.0, 10.0), Segmento(5.0, 12.0)], limite_seg=60.0)

    def test_short_sem_segmento_nenhum_e_recusado(self):
        with pytest.raises(SegmentosInvalidos, match="pelo menos um segmento"):
            validar([], limite_seg=60.0)

    def test_segmento_depois_do_fim_do_bruto_e_recusado_com_o_numero(self):
        with pytest.raises(SegmentosInvalidos, match="passa do fim do bruto"):
            validar([Segmento(50.0, 80.0)], limite_seg=60.0)

    def test_segmento_negativo_e_recusado(self):
        with pytest.raises(SegmentosInvalidos, match="antes do início"):
            validar([Segmento(-5.0, 10.0)], limite_seg=60.0)

    def test_micro_fatia_e_recusada_dizendo_que_e_arredondamento(self):
        with pytest.raises(SegmentosInvalidos, match="arredondamento"):
            validar([Segmento(0.0, DURACAO_MINIMA_SEG / 2)], limite_seg=60.0)

    def test_acima_do_teto_e_recusado(self):
        demais = [Segmento(float(i), i + 1.0) for i in range(MAX_SEGMENTOS + 1)]
        with pytest.raises(SegmentosInvalidos, match="limite"):
            validar(demais, limite_seg=999.0)

    def test_a_folga_do_fim_absorve_arredondamento_do_player(self):
        # O player devolve o tempo com casas decimais, e um piscar alem do fim e
        # arredondamento, nao erro do operador. A folga aqui e a duracao minima
        # (0,1s) e nao o segundo inteiro de `_validar_bordas`: a borda vem do
        # dedo do operador no player, e o segmento vem da regua, que ja trabalha
        # com o numero que o backend mandou.
        validar([Segmento(0.0, 60.05)], limite_seg=60.0)

        with pytest.raises(SegmentosInvalidos):
            validar([Segmento(0.0, 61.0)], limite_seg=60.0)
