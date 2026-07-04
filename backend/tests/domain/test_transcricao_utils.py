import pytest
from app.domain.transcricao_utils import dividir_segmentos_longos, limpar_e_ordenar_transcricao


def _seg(start, end, texto="texto"):
    return {"start": start, "end": end, "texto": texto}


def _seg_hms(inicio, fim, texto="texto"):
    return {"inicio": inicio, "fim": fim, "texto": texto}


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
