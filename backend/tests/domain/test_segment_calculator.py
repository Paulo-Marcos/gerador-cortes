import pytest
from app.domain.segment_calculator import (
    calcular_segmentos,
    dividir_desvios_no_ponto,
    eh_desvio_tecnico,
    filtrar_desvios_tecnicos,
    mesclar_desvios_sobrepostos,
    normalizar_desvio,
)


class TestEhDesvioTecnico:
    def test_silencio_detectado_e_tecnico(self):
        assert eh_desvio_tecnico({"motivo": "Silêncio Detectado (IA/Técnico)"}) is True

    def test_sem_prefixo_editorial_e_tecnico(self):
        assert eh_desvio_tecnico({"motivo": "Audio muito baixo"}) is True

    def test_motivo_vazio_e_tecnico(self):
        assert eh_desvio_tecnico({"motivo": ""}) is True

    def test_sem_chave_motivo_e_tecnico(self):
        assert eh_desvio_tecnico({}) is True

    def test_prefixo_repeticao_e_editorial(self):
        assert eh_desvio_tecnico({"motivo": "[REPETICAO] O locutor repete a mesma frase"}) is False

    def test_prefixo_desvio_e_editorial(self):
        assert eh_desvio_tecnico({"motivo": "[DESVIO] Fora do tema"}) is False

    def test_prefixo_no_meio_nao_conta(self):
        # O prefixo deve estar no INÍCIO do motivo
        assert eh_desvio_tecnico({"motivo": "Ruído [REPETICAO]"}) is True


class TestFiltrarDesviosTecnicos:
    def test_lista_vazia(self):
        assert filtrar_desvios_tecnicos([]) == []

    def test_filtra_apenas_tecnicos(self):
        desvios = [
            {"motivo": "Silêncio"},
            {"motivo": "[REPETICAO] Repete"},
            {"motivo": "[DESVIO] Fora do tema"},
            {"motivo": "Barulho"},
        ]
        result = filtrar_desvios_tecnicos(desvios)
        assert len(result) == 2
        assert all(d["motivo"] in ("Silêncio", "Barulho") for d in result)

    def test_todos_editoriais_retorna_vazio(self):
        desvios = [
            {"motivo": "[REPETICAO] Um"},
            {"motivo": "[DESVIO] Dois"},
        ]
        assert filtrar_desvios_tecnicos(desvios) == []

    def test_todos_tecnicos_retorna_todos(self):
        desvios = [{"motivo": "Silêncio"}, {"motivo": "Ruído"}]
        assert len(filtrar_desvios_tecnicos(desvios)) == 2


class TestNormalizarDesvio:
    def test_preserva_campos_extras(self):
        d = {"motivo": "Silêncio", "inicio_hms": "00:01:00.000", "fim_hms": "00:02:00.000"}
        result = normalizar_desvio(d)
        assert result["motivo"] == "Silêncio"

    def test_inicio_hms_gera_inicio_seg(self):
        d = {"inicio_hms": "00:01:00.000", "fim_hms": "00:02:00.000"}
        result = normalizar_desvio(d)
        assert result["inicio_seg"] == pytest.approx(60.0)

    def test_fim_hms_gera_fim_seg(self):
        d = {"inicio_hms": "00:01:00.000", "fim_hms": "00:02:00.000"}
        result = normalizar_desvio(d)
        assert result["fim_seg"] == pytest.approx(120.0)

    def test_campo_inicio_como_fallback(self):
        d = {"inicio": "00:00:30.000", "fim": "00:01:00.000"}
        result = normalizar_desvio(d)
        assert result["inicio_seg"] == pytest.approx(30.0)
        assert result["fim_seg"] == pytest.approx(60.0)

    def test_campo_inicio_seg_como_ultimo_fallback(self):
        d = {"inicio_seg": 45.0, "fim_seg": 90.0}
        result = normalizar_desvio(d)
        assert result["inicio_seg"] == pytest.approx(45.0)
        assert result["fim_seg"] == pytest.approx(90.0)

    def test_inicio_hms_tem_prioridade_sobre_inicio(self):
        d = {"inicio_hms": "00:01:00.000", "inicio": "00:00:30.000", "fim_hms": "00:02:00.000"}
        result = normalizar_desvio(d)
        assert result["inicio_seg"] == pytest.approx(60.0)

    def test_gera_hms_a_partir_de_seg(self):
        d = {"inicio_seg": 60.0, "fim_seg": 120.0}
        result = normalizar_desvio(d)
        assert result["inicio_hms"] == "00:01:00.000"
        assert result["fim_hms"] == "00:02:00.000"

    def test_nao_modifica_dict_original(self):
        d = {"inicio_hms": "00:01:00.000", "fim_hms": "00:02:00.000"}
        original = d.copy()
        normalizar_desvio(d)
        assert d == original


class TestCalcularSegmentos:
    def test_sem_desvios_retorna_range_completo(self):
        result = calcular_segmentos(0.0, 100.0, [])
        assert result == [{"start": 0.0, "end": 100.0}]

    def test_desvio_no_meio_divide_em_dois(self):
        desvios = [{"inicio_seg": 30.0, "fim_seg": 40.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert len(result) == 2
        assert result[0] == {"start": 0.0, "end": 30.0}
        assert result[1] == {"start": 40.0, "end": 100.0}

    def test_desvio_no_inicio(self):
        desvios = [{"inicio_seg": 0.0, "fim_seg": 10.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert result == [{"start": 10.0, "end": 100.0}]

    def test_desvio_no_fim(self):
        desvios = [{"inicio_seg": 90.0, "fim_seg": 100.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert result == [{"start": 0.0, "end": 90.0}]

    def test_desvio_fora_do_range_ignorado(self):
        desvios = [{"inicio_seg": 200.0, "fim_seg": 210.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert result == [{"start": 0.0, "end": 100.0}]

    def test_multiplos_desvios(self):
        desvios = [
            {"inicio_seg": 20.0, "fim_seg": 30.0},
            {"inicio_seg": 50.0, "fim_seg": 60.0},
        ]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert len(result) == 3
        assert result[0] == {"start": 0.0, "end": 20.0}
        assert result[1] == {"start": 30.0, "end": 50.0}
        assert result[2] == {"start": 60.0, "end": 100.0}

    def test_desvios_desordenados_ordenados_internamente(self):
        desvios = [
            {"inicio_seg": 50.0, "fim_seg": 60.0},
            {"inicio_seg": 20.0, "fim_seg": 30.0},
        ]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert result[0]["start"] == 0.0
        assert result[0]["end"] == 20.0

    def test_threshold_0_1s_remove_micro_segmento(self):
        # Desvio cria segmento de 0.05s no início → deve ser descartado
        desvios = [{"inicio_seg": 0.05, "fim_seg": 10.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        # O micro-segmento [0.0, 0.05] não deve aparecer
        assert not any(s["start"] == 0.0 and s["end"] == pytest.approx(0.05) for s in result)

    def test_desvio_cobre_range_inteiro_retorna_range_completo(self):
        # Se todos os segmentos são eliminados, retorna o range como fallback
        desvios = [{"inicio_seg": 0.0, "fim_seg": 100.0}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert result == [{"start": 0.0, "end": 100.0}]

    def test_desvio_com_inicio_hms_aceito(self):
        desvios = [{"inicio_hms": "00:00:30.000", "fim_hms": "00:00:40.000"}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        assert len(result) == 2
        assert result[0]["end"] == pytest.approx(30.0)
        assert result[1]["start"] == pytest.approx(40.0)

    def test_resultado_arredondado_em_3_casas(self):
        desvios = [{"inicio_seg": 30.1234, "fim_seg": 40.5678}]
        result = calcular_segmentos(0.0, 100.0, desvios)
        for seg in result:
            assert seg["start"] == round(seg["start"], 3)
            assert seg["end"] == round(seg["end"], 3)

    def test_honra_desvios_independente_do_motivo(self):
        """Regressão: o bruto deve respeitar TODOS os trechos marcados,
        sejam silêncios técnicos, manuais ou detectados por IA editorial.
        A função não filtra por motivo — usa apenas os tempos.
        """
        desvios = [
            {"inicio_seg": 10.0, "fim_seg": 15.0, "motivo": "Silêncio Detectado (IA/Técnico)"},
            {"inicio_seg": 30.0, "fim_seg": 35.0, "motivo": "Desvio manual"},
            {"inicio_seg": 60.0, "fim_seg": 70.0, "motivo": "[REPETICAO] Locutor repete"},
            {"inicio_seg": 85.0, "fim_seg": 90.0, "motivo": "[DESVIO] Fora do tema"},
        ]
        result = calcular_segmentos(0.0, 100.0, desvios)
        # 4 desvios bem espaçados → 5 segmentos mantidos
        assert len(result) == 5
        assert result[0] == {"start": 0.0, "end": 10.0}
        assert result[1] == {"start": 15.0, "end": 30.0}
        assert result[2] == {"start": 35.0, "end": 60.0}
        assert result[3] == {"start": 70.0, "end": 85.0}
        assert result[4] == {"start": 90.0, "end": 100.0}


class TestMesclarDesviosSobrepostos:
    """Mescla desvios sobrepostos em intervalos atomicos nao-sobrepostos."""

    def test_lista_vazia_retorna_vazia(self):
        assert mesclar_desvios_sobrepostos([]) == []

    def test_desvio_unico_passa_intacto(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 10.0
        assert result[0]["fim_seg"] == 20.0

    def test_dois_desvios_sem_sobreposicao_passam_intactos(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"},
                {"inicio_seg": 30.0, "fim_seg": 40.0, "motivo": "B"},
            ]
        )
        assert len(result) == 2

    def test_dois_desvios_sobrepostos_viram_um(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 30.0, "motivo": "A"},
                {"inicio_seg": 20.0, "fim_seg": 40.0, "motivo": "B"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 10.0
        assert result[0]["fim_seg"] == 40.0

    def test_desvio_totalmente_contido_em_outro_e_absorvido(self):
        # [10, 50] contem [20, 30] — resultado: [10, 50]
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 50.0, "motivo": "Grande"},
                {"inicio_seg": 20.0, "fim_seg": 30.0, "motivo": "Pequeno"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 10.0
        assert result[0]["fim_seg"] == 50.0

    def test_tres_desvios_concentricos_viram_um(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 100.0, "motivo": "A"},
                {"inicio_seg": 20.0, "fim_seg": 80.0, "motivo": "B"},
                {"inicio_seg": 30.0, "fim_seg": 50.0, "motivo": "C"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 10.0
        assert result[0]["fim_seg"] == 100.0

    def test_motivo_indica_quantidade_de_sobreposicoes(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 30.0, "motivo": "Primeiro"},
                {"inicio_seg": 20.0, "fim_seg": 40.0, "motivo": "Segundo"},
                {"inicio_seg": 25.0, "fim_seg": 35.0, "motivo": "Terceiro"},
            ]
        )
        # 3 desvios em 1 bloco → motivo deve indicar "+ 2 sobrepostos"
        assert "2 sobrepostos" in result[0]["motivo"]

    def test_motivo_intacto_quando_nao_ha_sobreposicao(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "Original"},
            ]
        )
        assert result[0]["motivo"] == "Original"

    def test_desvios_desordenados_sao_ordenados_internamente(self):
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 50.0, "fim_seg": 60.0, "motivo": "B"},
                {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"},
            ]
        )
        assert result[0]["inicio_seg"] == 10.0
        assert result[1]["inicio_seg"] == 50.0

    def test_desvio_invalido_descartado(self):
        # fim <= inicio é invalido, deve ser ignorado
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 5.0, "motivo": "Invalido"},
                {"inicio_seg": 20.0, "fim_seg": 30.0, "motivo": "OK"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 20.0

    def test_adjacentes_exatos_sao_mesclados(self):
        # [10, 20] e [20, 30] — adjacentes exatos viram [10, 30].
        result = mesclar_desvios_sobrepostos(
            [
                {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"},
                {"inicio_seg": 20.0, "fim_seg": 30.0, "motivo": "B"},
            ]
        )
        assert len(result) == 1
        assert result[0]["inicio_seg"] == 10.0
        assert result[0]["fim_seg"] == 30.0

    def test_paridade_com_calcular_segmentos(self):
        """REGRESSAO: passar desvios crus OU mesclados em calcular_segmentos
        deve produzir os MESMOS segmentos. A mescla e otimizacao/clareza,
        nao deve alterar a saida final.
        """
        desvios = [
            {"inicio_seg": 10.0, "fim_seg": 30.0, "motivo": "A"},
            {"inicio_seg": 20.0, "fim_seg": 40.0, "motivo": "B"},  # sobrepoe A
            {"inicio_seg": 50.0, "fim_seg": 60.0, "motivo": "C"},
            {"inicio_seg": 55.0, "fim_seg": 70.0, "motivo": "D"},  # sobrepoe C
            {"inicio_seg": 80.0, "fim_seg": 85.0, "motivo": "E"},
        ]
        segs_crus = calcular_segmentos(0.0, 100.0, desvios)
        segs_mesclados = calcular_segmentos(0.0, 100.0, mesclar_desvios_sobrepostos(desvios))
        assert segs_crus == segs_mesclados

    def test_cenario_real_corte_480e2023(self):
        """REGRESSAO: subconjunto do corte real com muitas sobreposicoes.
        Sem o pre-merge, sao 8 desvios. Com pre-merge, devem virar 1 bloco
        atomico cobrindo todo o range, porque [REPETICAO] contem todos os
        silencios.
        """
        desvios = [
            {"inicio_seg": 1751.0, "fim_seg": 1767.98, "motivo": "Silencio"},
            {"inicio_seg": 1767.78, "fim_seg": 1815.98, "motivo": "[REPETICAO]"},
            {"inicio_seg": 1769.94, "fim_seg": 1782.99, "motivo": "Silencio"},
            {"inicio_seg": 1784.20, "fim_seg": 1786.01, "motivo": "Silencio"},
            {"inicio_seg": 1787.14, "fim_seg": 1789.17, "motivo": "Silencio"},
            {"inicio_seg": 1796.06, "fim_seg": 1808.88, "motivo": "Silencio"},
            {"inicio_seg": 1810.16, "fim_seg": 1812.28, "motivo": "Silencio"},
            {"inicio_seg": 1813.33, "fim_seg": 1817.97, "motivo": "Silencio"},
        ]
        mesclados = mesclar_desvios_sobrepostos(desvios)
        # Os 8 desvios cobrem [1751, 1817.97] continuamente → 1 bloco
        assert len(mesclados) == 1
        assert mesclados[0]["inicio_seg"] == pytest.approx(1751.0)
        assert mesclados[0]["fim_seg"] == pytest.approx(1817.97)


class TestDividirDesviosNoPonto:
    """F-061: particiona desvios de um corte ao dividi-lo em dois."""

    def test_sem_desvios_retorna_dois_lados_vazios(self):
        esq, dir = dividir_desvios_no_ponto([], 50.0)
        assert esq == []
        assert dir == []

    def test_desvio_antes_do_ponto_vai_para_esquerda(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "A"}], 50.0
        )
        assert len(esq) == 1
        assert dir == []
        assert esq[0]["motivo"] == "A"

    def test_desvio_depois_do_ponto_vai_para_direita(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 60.0, "fim_seg": 70.0, "motivo": "B"}], 50.0
        )
        assert esq == []
        assert len(dir) == 1
        assert dir[0]["inicio_seg"] == pytest.approx(60.0)

    def test_desvio_que_cruza_o_ponto_e_fatiado_em_dois(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 40.0, "fim_seg": 60.0, "motivo": "Cruza"}], 50.0
        )
        assert len(esq) == 1
        assert len(dir) == 1
        # Esquerda termina no ponto, direita começa no ponto — sem perder o trecho.
        assert esq[0]["inicio_seg"] == pytest.approx(40.0)
        assert esq[0]["fim_seg"] == pytest.approx(50.0)
        assert dir[0]["inicio_seg"] == pytest.approx(50.0)
        assert dir[0]["fim_seg"] == pytest.approx(60.0)

    def test_fatia_preserva_motivo_em_ambos_os_lados(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 40.0, "fim_seg": 60.0, "motivo": "[REPETICAO] x"}], 50.0
        )
        assert esq[0]["motivo"] == "[REPETICAO] x"
        assert dir[0]["motivo"] == "[REPETICAO] x"

    def test_fatia_atualiza_hms_dos_dois_lados(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 40.0, "fim_seg": 60.0, "motivo": "x"}], 50.0
        )
        assert esq[0]["fim_hms"] == "00:00:50.000"
        assert dir[0]["inicio_hms"] == "00:00:50.000"

    def test_nenhum_trecho_de_remocao_e_perdido(self):
        """A soma das durações de remoção antes e depois deve igualar a original."""
        desvios = [
            {"inicio_seg": 10.0, "fim_seg": 20.0, "motivo": "antes"},
            {"inicio_seg": 45.0, "fim_seg": 55.0, "motivo": "cruza"},
            {"inicio_seg": 80.0, "fim_seg": 90.0, "motivo": "depois"},
        ]
        total_original = sum(d["fim_seg"] - d["inicio_seg"] for d in desvios)
        esq, dir = dividir_desvios_no_ponto(desvios, 50.0)
        total_apos = sum(d["fim_seg"] - d["inicio_seg"] for d in esq + dir)
        assert total_apos == pytest.approx(total_original)
        # cruza vira 1 fatia em cada lado → 4 desvios no total
        assert len(esq) + len(dir) == 4

    def test_desvio_invalido_descartado(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_seg": 30.0, "fim_seg": 30.0, "motivo": "zero"}], 50.0
        )
        assert esq == []
        assert dir == []

    def test_cada_lado_ordenado_cronologicamente(self):
        desvios = [
            {"inicio_seg": 30.0, "fim_seg": 35.0, "motivo": "B"},
            {"inicio_seg": 10.0, "fim_seg": 15.0, "motivo": "A"},
            {"inicio_seg": 80.0, "fim_seg": 85.0, "motivo": "D"},
            {"inicio_seg": 60.0, "fim_seg": 65.0, "motivo": "C"},
        ]
        esq, dir = dividir_desvios_no_ponto(desvios, 50.0)
        assert [d["inicio_seg"] for d in esq] == [10.0, 30.0]
        assert [d["inicio_seg"] for d in dir] == [60.0, 80.0]

    def test_aceita_desvio_com_hms(self):
        esq, dir = dividir_desvios_no_ponto(
            [{"inicio_hms": "00:00:40.000", "fim_hms": "00:00:45.000", "motivo": "x"}],
            50.0,
        )
        assert len(esq) == 1
        assert dir == []
        assert esq[0]["fim_seg"] == pytest.approx(45.0)

    def test_nao_modifica_dicts_originais(self):
        desvios = [{"inicio_seg": 40.0, "fim_seg": 60.0, "motivo": "x"}]
        copia = [dict(d) for d in desvios]
        dividir_desvios_no_ponto(desvios, 50.0)
        assert desvios == copia
