import pytest
from app.domain.transcricao_utils import dividir_segmentos_longos, limpar_e_ordenar_transcricao


def _seg(start, end, texto="texto"):
    return {"start": start, "end": end, "texto": texto}


def _seg_hms(inicio, fim, texto="texto"):
    return {"inicio": inicio, "fim": fim, "texto": texto}


class TestPreservaFalante:
    """D-286: o rótulo de falante deve sobreviver à limpeza e ao split."""

    def test_limpar_preserva_speaker(self):
        seg = {"start": 0.0, "end": 3.0, "texto": "oi", "speaker": "SPEAKER_00"}
        result = limpar_e_ordenar_transcricao([seg])
        assert result[0]["speaker"] == "SPEAKER_00"

    def test_limpar_sem_speaker_nao_inventa_campo(self):
        result = limpar_e_ordenar_transcricao([_seg(0.0, 3.0, "oi")])
        assert "speaker" not in result[0]

    def test_dividir_propaga_speaker_para_todas_as_partes(self):
        seg = {
            "start": 0.0,
            "end": 20.0,
            "texto": "um dois tres quatro cinco seis sete oito",
            "speaker": "SPEAKER_01",
        }
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=2)
        assert len(result) > 1
        assert all(parte["speaker"] == "SPEAKER_01" for parte in result)


class TestDividirSegmentosLongos:
    def test_lista_vazia_retorna_vazia(self):
        assert dividir_segmentos_longos([]) == []

    def test_segmento_curto_mantido_intacto(self):
        seg = _seg(0.0, 3.0, "curto")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=10)
        assert len(result) == 1
        assert result[0]["texto"] == "curto"

    def test_segmento_longo_por_tempo_dividido(self):
        seg = _seg(0.0, 10.0, "um dois tres quatro cinco")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=20)
        assert len(result) > 1

    def test_segmento_longo_por_palavras_dividido(self):
        seg = _seg(0.0, 3.0, "um dois tres quatro cinco seis sete oito nove dez onze")
        result = dividir_segmentos_longos([seg], max_duracao=10.0, max_palavras=5)
        assert len(result) > 1

    def test_segmentos_divididos_cobrem_tempo_total(self):
        seg = _seg(0.0, 20.0, "a b c d e f g h i j k l m n o p")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=5)
        assert result[0]["start"] >= 0.0
        assert result[-1]["end"] <= 20.0 + 1e-6

    def test_segmentos_divididos_nao_perdem_palavras(self):
        texto = "palavra1 palavra2 palavra3 palavra4 palavra5 palavra6"
        seg = _seg(0.0, 12.0, texto)
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=3)
        palavras_result = " ".join(r["texto"] for r in result).split()
        palavras_orig = texto.split()
        assert sorted(palavras_result) == sorted(palavras_orig)

    def test_segmento_sem_texto_ignorado(self):
        segs = [_seg(0.0, 5.0, ""), _seg(5.0, 10.0, "texto")]
        result = dividir_segmentos_longos(segs)
        assert all(r["texto"] for r in result)

    def test_aceita_campos_inicio_fim_legado(self):
        seg = _seg_hms("00:00:00.000", "00:00:03.000", "texto curto")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=10)
        assert len(result) == 1

    def test_partes_tem_start_end_inicio_fim(self):
        seg = _seg(0.0, 20.0, "a b c d e f g h i j k l")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=3)
        for r in result:
            assert "start" in r
            assert "end" in r
            assert "inicio" in r
            assert "fim" in r

    def test_end_nao_ultrapassa_fim_original(self):
        seg = _seg(0.0, 10.0, "a b c d e f g h i j k l")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=3)
        assert result[-1]["end"] <= 10.0 + 1e-6


def _palavra(texto, inicio_seg):
    return {"texto": texto, "inicio_seg": inicio_seg}


class TestDividirComTimingReal:
    """D-337: com `palavras` (bordas reais), o split corta no início real de cada
    palavra em vez de interpolar por tempo uniforme."""

    def test_corta_nas_bordas_reais_nao_interpola(self):
        # Palavras com espaçamento IRREGULAR: interpolação uniforme daria 2.5s por
        # parte; as bordas reais são 0/1/6/9.
        seg = {
            "start": 0.0,
            "end": 10.0,
            "texto": "um dois tres quatro",
            "palavras": [
                _palavra("um", 0.0),
                _palavra("dois", 1.0),
                _palavra("tres", 6.0),
                _palavra("quatro", 9.0),
            ],
        }
        result = dividir_segmentos_longos([seg], max_duracao=100.0, max_palavras=1)
        bordas = [(r["start"], r["end"]) for r in result]
        assert bordas == [(0.0, 1.0), (1.0, 6.0), (6.0, 9.0), (9.0, 10.0)]

    def test_ultima_parte_termina_no_fim_do_segmento(self):
        seg = {
            "start": 0.0,
            "end": 12.0,
            "texto": "a b c",
            "palavras": [_palavra("a", 0.0), _palavra("b", 3.0), _palavra("c", 7.0)],
        }
        result = dividir_segmentos_longos([seg], max_duracao=100.0, max_palavras=1)
        assert result[-1]["end"] == pytest.approx(12.0)

    def test_sub_segmentos_preservam_palavras(self):
        seg = {
            "start": 0.0,
            "end": 10.0,
            "texto": "um dois tres quatro",
            "palavras": [
                _palavra("um", 0.0),
                _palavra("dois", 1.0),
                _palavra("tres", 6.0),
                _palavra("quatro", 9.0),
            ],
        }
        result = dividir_segmentos_longos([seg], max_duracao=100.0, max_palavras=1)
        assert all("palavras" in r for r in result)
        # Nenhuma palavra se perde no split.
        textos = [p["texto"] for r in result for p in r["palavras"]]
        assert textos == ["um", "dois", "tres", "quatro"]

    def test_start_end_batem_com_inicio_seg_das_palavras(self):
        seg = {
            "start": 0.0,
            "end": 10.0,
            "texto": "um dois tres quatro",
            "palavras": [
                _palavra("um", 0.0),
                _palavra("dois", 1.0),
                _palavra("tres", 6.0),
                _palavra("quatro", 9.0),
            ],
        }
        result = dividir_segmentos_longos([seg], max_duracao=100.0, max_palavras=1)
        # Cada sub-segmento começa exatamente no inicio_seg da sua primeira palavra.
        assert [r["start"] for r in result] == [0.0, 1.0, 6.0, 9.0]


class TestDividirSemPalavrasCaracterizacao:
    """D-337: back-compat — segmento SEM `palavras` produz EXATAMENTE a saída
    proporcional anterior (proteção contra regressão)."""

    def test_saida_identica_ao_comportamento_proporcional(self):
        seg = _seg(0.0, 10.0, "a b c d e f")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=3)
        assert result == [
            {"start": 0.0, "end": 3.333, "inicio": 0.0, "fim": 3.333, "texto": "a b"},
            {"start": 3.333, "end": 6.667, "inicio": 3.333, "fim": 6.667, "texto": "c d"},
            {"start": 6.667, "end": 10.0, "inicio": 6.667, "fim": 10.0, "texto": "e f"},
        ]

    def test_nenhuma_chave_palavras_quando_entrada_nao_tem(self):
        seg = _seg(0.0, 20.0, "a b c d e f g h i j k l")
        result = dividir_segmentos_longos([seg], max_duracao=4.0, max_palavras=3)
        assert all("palavras" not in r for r in result)


class TestLimparPreservaPalavras:
    """D-337: o timing por palavra sobrevive à limpeza para chegar à granularização."""

    def test_limpar_preserva_palavras(self):
        seg = {
            "start": 0.0,
            "end": 3.0,
            "texto": "oi mundo",
            "palavras": [_palavra("oi", 0.0), _palavra("mundo", 1.5)],
        }
        result = limpar_e_ordenar_transcricao([seg])
        assert result[0]["palavras"] == [
            {"texto": "oi", "inicio_seg": 0.0},
            {"texto": "mundo", "inicio_seg": 1.5},
        ]

    def test_limpar_sem_palavras_nao_inventa_campo(self):
        result = limpar_e_ordenar_transcricao([_seg(0.0, 3.0, "oi")])
        assert "palavras" not in result[0]


class TestLimparEOrdenarTranscricao:
    def test_lista_vazia_retorna_vazia(self):
        assert limpar_e_ordenar_transcricao([]) == []

    def test_ordena_por_inicio(self):
        segs = [_seg(10.0, 12.0, "b"), _seg(0.0, 2.0, "a")]
        result = limpar_e_ordenar_transcricao(segs)
        assert result[0]["texto"] == "a"
        assert result[1]["texto"] == "b"

    def test_remove_segmento_sem_texto(self):
        segs = [_seg(0.0, 2.0, ""), _seg(3.0, 5.0, "texto")]
        result = limpar_e_ordenar_transcricao(segs)
        assert len(result) == 1
        assert result[0]["texto"] == "texto"

    def test_remove_texto_apenas_espacos(self):
        segs = [_seg(0.0, 2.0, "   "), _seg(3.0, 5.0, "ok")]
        result = limpar_e_ordenar_transcricao(segs)
        assert len(result) == 1

    def test_corrige_sobreposicao(self):
        # seg1 vai até 5.0 mas seg2 começa em 3.0 → seg1 deve ser truncado para 3.0
        segs = [_seg(0.0, 5.0, "a"), _seg(3.0, 7.0, "b")]
        result = limpar_e_ordenar_transcricao(segs)
        assert result[0]["end"] == pytest.approx(3.0)

    def test_garante_duracao_minima(self):
        # Segmento com fim == inicio deve ser ajustado para inicio + 0.05
        segs = [{"start": 5.0, "end": 5.0, "texto": "x"}]
        result = limpar_e_ordenar_transcricao(segs)
        assert result[0]["end"] > result[0]["start"]

    def test_segmento_invalido_fim_antes_de_inicio_removido(self):
        # Após truncamento, se end <= start, deve ser descartado
        segs = [
            _seg(0.0, 3.0, "a"),
            _seg(0.5, 1.0, "b"),  # Dentro de "a" — após fix de sobreposição, "a" vai a 0.5
            _seg(0.1, 0.2, "c"),  # "b" vai a 0.1 mas começa em 0.5... não faz sentido
        ]
        result = limpar_e_ordenar_transcricao(segs)
        # Pelo menos o primeiro deve ser válido
        assert all(r["end"] > r["start"] for r in result)

    def test_resultado_tem_start_end_texto(self):
        segs = [_seg(0.0, 2.0, "teste")]
        result = limpar_e_ordenar_transcricao(segs)
        assert "start" in result[0]
        assert "end" in result[0]
        assert "texto" in result[0]

    def test_multiplos_segmentos_ordenados_e_limpos(self):
        segs = [
            _seg(10.0, 12.0, "terceiro"),
            _seg(0.0, 3.0, "primeiro"),
            _seg(5.0, 8.0, "segundo"),
        ]
        result = limpar_e_ordenar_transcricao(segs)
        starts = [r["start"] for r in result]
        assert starts == sorted(starts)

    def test_aceita_campos_inicio_fim_legado(self):
        segs = [_seg_hms("00:00:01.000", "00:00:03.000", "texto")]
        result = limpar_e_ordenar_transcricao(segs)
        assert len(result) == 1
        assert result[0]["texto"] == "texto"
