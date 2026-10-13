"""D-908: o escalonamento do lote — espaçar e preencher os dias, sem plataforma.

O que estes testes guardam é a FORMA da agenda que o operador vê antes do
clique: blocos que enchem, dia que vira, intervalo que separa, grade que o
TikTok exige, horizonte que recusa cedo, e a continuidade entre lotes (o
próximo começa depois do último já marcado). Cada um é um comportamento que o
pedido nomeou; sumir com um deles faz o lote voltar a ser "tudo às 14:05".
"""

from __future__ import annotations

import doctest
from datetime import datetime, timedelta, timezone

import pytest
from app.domain.publicacao import escalonamento as modulo
from app.domain.publicacao.escalonamento import (
    PADRAO_DO_PUBLICO,
    PADRAO_POR_DESTINO,
    EscalonamentoInvalido,
    FaixaDoPublico,
    Intensidade,
    ParametrosDoDestino,
    destino_de,
    escalonar,
    intensidade_em,
    sugerir_blocos,
    validar_parametros,
    validar_referencia,
)

FUSO = timezone(timedelta(hours=-3))
# Segunda-feira, 7 de janeiro de 2030, 10h da manhã.
SEGUNDA_10H = datetime(2030, 1, 7, 10, 0, tzinfo=FUSO)


def _legiveis(vagas) -> list[str]:
    return [v.agendamento.legivel() if v.agendamento else f"sem data: {v.motivo}" for v in vagas]


def test_os_exemplos_do_modulo_valem():
    """Os doctests são a documentação executável; a suíte não os roda sozinha."""
    resultado = doctest.testmod(modulo)
    assert resultado.failed == 0


class TestPreencheOBlocoEPassaParaOProximo:
    def test_enche_o_bloco_antes_de_ir_para_o_seguinte(self):
        p = ParametrosDoDestino(("12:00", "18:00"), 4, 8, 15)

        assert _legiveis(escalonar(5, p, agora=SEGUNDA_10H)) == [
            "07/01/2030 as 12:00",
            "07/01/2030 as 12:15",
            "07/01/2030 as 12:30",
            "07/01/2030 as 12:45",
            "07/01/2030 as 18:00",
        ]

    def test_estoura_para_o_dia_seguinte_quando_o_dia_enche(self):
        p = ParametrosDoDestino(("16:00", "19:00", "22:00"), 1, 3, 180)

        assert _legiveis(escalonar(4, p, agora=SEGUNDA_10H)) == [
            "07/01/2030 as 16:00",
            "07/01/2030 as 19:00",
            "07/01/2030 as 22:00",
            "08/01/2030 as 16:00",
        ]

    def test_o_teto_por_dia_vale_sobre_todos_os_blocos(self):
        """Dois blocos de quatro, mas só seis por dia: o segundo bloco fica pela metade."""
        p = ParametrosDoDestino(("12:00", "18:00"), 4, 6, 15)

        vagas = escalonar(7, p, agora=SEGUNDA_10H)

        assert _legiveis(vagas)[5:] == ["07/01/2030 as 18:15", "08/01/2030 as 12:00"]

    def test_n_shorts_em_x_horas_e_um_bloco_so(self):
        """Três em seis horas e depois amanhã: um bloco de 3 com intervalo de 2h."""
        p = ParametrosDoDestino(("16:00",), 3, 3, 120)

        assert _legiveis(escalonar(4, p, agora=SEGUNDA_10H)) == [
            "07/01/2030 as 16:00",
            "07/01/2030 as 18:00",
            "07/01/2030 as 20:00",
            "08/01/2030 as 16:00",
        ]


class TestRespeitaOIntervalo:
    def test_pula_o_candidato_perto_demais_do_anterior_em_vez_de_empurrar(self):
        """Blocos de 18:00 e 18:10 com intervalo de 15: o segundo não cabe, e o
        item vai para o próximo candidato válido — a grade não se deforma."""
        p = ParametrosDoDestino(("18:00", "18:10", "19:00"), 1, 3, 15)

        assert _legiveis(escalonar(2, p, agora=SEGUNDA_10H)) == [
            "07/01/2030 as 18:00",
            "07/01/2030 as 19:00",
        ]

    def test_nunca_antes_de_agora_mais_a_margem(self):
        quase_meio_dia = datetime(2030, 1, 7, 11, 57, tzinfo=FUSO)
        p = ParametrosDoDestino(("12:00", "18:00"), 1, 2, 15)

        # 12:00 está a 3 minutos: dentro da margem de 5, logo fora.
        assert _legiveis(escalonar(1, p, agora=quase_meio_dia)) == ["07/01/2030 as 18:00"]


class TestPartidaPeloUltimoAgendado:
    def test_continua_depois_do_ultimo_item_do_lote_anterior(self):
        p = ParametrosDoDestino(("12:00", "18:00"), 2, 4, 15)
        ultimo = datetime(2030, 1, 8, 18, 15, tzinfo=FUSO)  # terça, último bloco cheio

        assert _legiveis(escalonar(2, p, agora=SEGUNDA_10H, ultimo=ultimo)) == [
            "09/01/2030 as 12:00",
            "09/01/2030 as 12:15",
        ]

    def test_o_intervalo_vale_a_partir_do_ultimo(self):
        p = ParametrosDoDestino(("12:00", "18:00"), 4, 8, 15)
        ultimo = datetime(2030, 1, 7, 12, 10, tzinfo=FUSO)

        # 12:15 está a 5 minutos do último: pulado; 12:30 é o primeiro que serve.
        assert _legiveis(escalonar(1, p, agora=SEGUNDA_10H, ultimo=ultimo)) == [
            "07/01/2030 as 12:30"
        ]

    def test_ultimo_no_passado_nao_puxa_a_partida_para_tras(self):
        p = ParametrosDoDestino(("12:00",), 1, 1, 15)
        ultimo = datetime(2029, 12, 1, 12, 0, tzinfo=FUSO)

        assert _legiveis(escalonar(1, p, agora=SEGUNDA_10H, ultimo=ultimo)) == [
            "07/01/2030 as 12:00"
        ]


class TestDiasInativos:
    def test_pula_os_dias_desligados(self):
        so_fim_de_semana = ParametrosDoDestino(("12:00",), 1, 1, 15, frozenset({5, 6}))

        assert _legiveis(escalonar(3, so_fim_de_semana, agora=SEGUNDA_10H)) == [
            "12/01/2030 as 12:00",
            "13/01/2030 as 12:00",
            "19/01/2030 as 12:00",
        ]


class TestHorizonte:
    def test_o_que_estoura_fica_sem_data_e_diz_por_que(self):
        p = ParametrosDoDestino(("12:00",), 1, 1, 15)

        vagas = escalonar(4, p, agora=SEGUNDA_10H, horizonte_dias=2)

        assert [v.agendamento is not None for v in vagas] == [True, True, False, False]
        assert vagas[2].motivo == "não cabe nos 2 dias que a plataforma deixa agendar"
        assert vagas[3].posicao == 3

    def test_sem_horizonte_nao_recusa(self):
        p = ParametrosDoDestino(("12:00",), 1, 1, 15)

        vagas = escalonar(30, p, agora=SEGUNDA_10H)

        assert all(v.agendamento for v in vagas)


class TestGradeDoTikTok:
    def test_bloco_fora_da_grade_e_recusado(self):
        with pytest.raises(EscalonamentoInvalido, match="5 em 5 minutos"):
            validar_parametros(ParametrosDoDestino(("18:03",), 1, 3, 60), "tiktok")

    def test_intervalo_fora_da_grade_e_recusado(self):
        with pytest.raises(EscalonamentoInvalido, match="múltiplo de 5"):
            validar_parametros(ParametrosDoDestino(("18:00",), 2, 3, 7), "tiktok")

    def test_a_mesma_grade_nao_vale_para_o_youtube(self):
        validar_parametros(ParametrosDoDestino(("18:03",), 2, 3, 7), "youtube_shorts")

    def test_os_padroes_passam_na_propria_validacao(self):
        for destino, parametros in PADRAO_POR_DESTINO.items():
            validar_parametros(parametros, destino)

    def test_a_agenda_do_padrao_do_tiktok_cai_na_grade(self):
        vagas = escalonar(6, PADRAO_POR_DESTINO["tiktok"], agora=SEGUNDA_10H, horizonte_dias=10)

        assert all(v.agendamento.quando.minute % 5 == 0 for v in vagas)


class TestValidacaoDosParametros:
    @pytest.mark.parametrize(
        ("parametros", "trecho"),
        [
            (ParametrosDoDestino((), 1, 3, 60), "ao menos um bloco"),
            (ParametrosDoDestino(("18:00", "12:00"), 1, 3, 60), "ordem crescente"),
            (ParametrosDoDestino(("18:00", "18:00"), 1, 3, 60), "ordem crescente"),
            (ParametrosDoDestino(("de tarde",), 1, 3, 60), "não entendi a hora"),
            (ParametrosDoDestino(("18:00",), 0, 3, 60), "ao menos um item"),
            (ParametrosDoDestino(("18:00",), 1, 0, 60), "teto por dia"),
            (ParametrosDoDestino(("18:00",), 1, 3, 0), "intervalo mínimo"),
            (ParametrosDoDestino(("18:00",), 1, 3, 60, frozenset()), "um dia ativo"),
            (ParametrosDoDestino(("18:00",), 1, 3, 60, frozenset({9})), "fora de 0..6"),
        ],
    )
    def test_recusa_com_a_frase_certa(self, parametros, trecho):
        with pytest.raises(EscalonamentoInvalido, match=trecho):
            validar_parametros(parametros, "youtube_shorts")

    def test_destino_desconhecido(self):
        with pytest.raises(EscalonamentoInvalido, match="desconhecido"):
            validar_parametros(PADRAO_POR_DESTINO["tiktok"], "instagram_reels")


class TestReferenciaDoPublico:
    def test_o_padrao_e_valido_e_cobre_os_sete_dias(self):
        validar_referencia(PADRAO_DO_PUBLICO)
        assert {f.dia for f in PADRAO_DO_PUBLICO} == set(range(7))

    def test_fim_de_semana_fica_forte_desde_o_meio_dia(self):
        sabado_13h = datetime(2030, 1, 12, 13, 0, tzinfo=FUSO)
        segunda_13h = datetime(2030, 1, 7, 13, 0, tzinfo=FUSO)

        assert intensidade_em(PADRAO_DO_PUBLICO, sabado_13h) is Intensidade.FORTE
        assert intensidade_em(PADRAO_DO_PUBLICO, segunda_13h) is Intensidade.MEDIO

    def test_faixas_sobrepostas_no_mesmo_dia_sao_recusadas(self):
        with pytest.raises(EscalonamentoInvalido, match="sobrepõe"):
            validar_referencia(
                [
                    FaixaDoPublico(2, 10, 20, Intensidade.FORTE),
                    FaixaDoPublico(2, 19, 22, Intensidade.MEDIO),
                ]
            )

    def test_faixa_fora_do_dia_e_recusada(self):
        with pytest.raises(EscalonamentoInvalido, match="inválida"):
            validar_referencia([FaixaDoPublico(2, 20, 25, Intensidade.FORTE)])

    def test_sugere_blocos_dentro_da_janela_forte(self):
        assert sugerir_blocos(PADRAO_DO_PUBLICO, 2) == ("15:00", "19:00")
        # Só fim de semana: a janela forte começa ao meio-dia.
        assert sugerir_blocos(PADRAO_DO_PUBLICO, 2, frozenset({5, 6})) == ("12:00", "17:30")


class TestDestinoDaPlataforma:
    def test_o_tiktok_horizontal_segue_os_parametros_do_tiktok(self):
        assert destino_de("tiktok_horizontal") == "tiktok"
        assert destino_de("tiktok") == "tiktok"

    def test_o_instagram_nao_escalona(self):
        assert destino_de("instagram_reels") is None
