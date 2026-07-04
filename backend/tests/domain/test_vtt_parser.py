from app.domain.vtt_parser import parse_vtt


def _vtt(*blocks):
    """Monta um VTT válido a partir de blocos de texto."""
    return "WEBVTT\n\n" + "\n\n".join(blocks)


class TestParseVtt:
    def test_string_vazia_retorna_lista_vazia(self):
        assert parse_vtt("") == []

    def test_apenas_header_retorna_lista_vazia(self):
        assert parse_vtt("WEBVTT") == []

    def test_segmento_simples(self):
        vtt = _vtt("00:00:01.000 --> 00:00:02.000\nHello")
        result = parse_vtt(vtt)
        assert len(result) == 1
        assert result[0]["inicio"] == "00:00:01.000"
        assert result[0]["fim"] == "00:00:02.000"
        assert result[0]["texto"] == "Hello"

    def test_resultado_tem_chaves_inicio_fim_texto(self):
        vtt = _vtt("00:00:01.000 --> 00:00:02.000\nOlá")
        result = parse_vtt(vtt)
        assert set(result[0].keys()) == {"inicio", "fim", "texto"}

    def test_multiplos_segmentos_independentes(self):
        vtt = _vtt(
            "00:00:01.000 --> 00:00:02.000\nPrimeiro",
            "00:00:03.000 --> 00:00:04.000\nSegundo",
        )
        result = parse_vtt(vtt)
        assert len(result) == 2
        assert result[0]["texto"] == "Primeiro"
        assert result[1]["texto"] == "Segundo"

    def test_remove_tags_html(self):
        vtt = _vtt("00:00:01.000 --> 00:00:02.000\n<c>Texto</c> com <b>tags</b>")
        result = parse_vtt(vtt)
        assert result[0]["texto"] == "Texto com tags"

    def test_remove_numero_de_sequencia(self):
        # VTT com número de sequência no bloco
        vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nTexto"
        result = parse_vtt(vtt)
        assert result[0]["texto"] == "Texto"

    def test_deduplicacao_rollup_linha_repetida_ignorada(self):
        # Efeito roll-up: "Olá" aparece no bloco 1, e reaparece no bloco 2.
        # O parser deve ignorar a repetição e manter apenas "mundo".
        vtt = _vtt(
            "00:00:01.000 --> 00:00:02.000\nOlá",
            "00:00:02.000 --> 00:00:03.000\nOlá\nmundo",
        )
        result = parse_vtt(vtt)
        assert len(result) == 2
        assert result[1]["texto"] == "mundo"

    def test_deduplicacao_rollup_bloco_totalmente_repetido_ignorado(self):
        # Se o bloco seguinte tem exatamente as mesmas linhas do anterior,
        # não deve gerar um segmento de texto vazio no resultado.
        vtt = _vtt(
            "00:00:01.000 --> 00:00:02.000\nTexto igual",
            "00:00:02.000 --> 00:00:03.000\nTexto igual",
        )
        result = parse_vtt(vtt)
        # Primeiro bloco entra normalmente, segundo deve ser descartado (texto vazio)
        textos = [r["texto"] for r in result]
        assert "Texto igual" in textos
        assert textos.count("Texto igual") == 1

    def test_bloco_sem_timestamp_ignorado(self):
        vtt = "WEBVTT\n\nEste bloco não tem seta\nApenas texto\n\n00:00:01.000 --> 00:00:02.000\nVálido"
        result = parse_vtt(vtt)
        assert len(result) == 1
        assert result[0]["texto"] == "Válido"

    def test_texto_vazio_apos_remocao_html_ignorado(self):
        vtt = _vtt("00:00:01.000 --> 00:00:02.000\n<c></c>")
        result = parse_vtt(vtt)
        assert result == []

    def test_inicio_fim_extraidos_corretamente(self):
        vtt = _vtt("01:23:45.678 --> 02:34:56.789\nTexto")
        result = parse_vtt(vtt)
        assert result[0]["inicio"] == "01:23:45.678"
        assert result[0]["fim"] == "02:34:56.789"

    def test_timestamp_com_position_cue_ignorado(self):
        # VTT pode ter atributos extras no timestamp como "position:X%"
        vtt = _vtt("00:00:01.000 --> 00:00:02.000 position:50%\nTexto com posição")
        result = parse_vtt(vtt)
        assert result[0]["inicio"] == "00:00:01.000"
        assert result[0]["fim"] == "00:00:02.000"
        assert result[0]["texto"] == "Texto com posição"

    def test_linhas_multiplas_concatenadas_com_espaco(self):
        vtt = _vtt("00:00:01.000 --> 00:00:02.000\nLinha um\nLinha dois")
        result = parse_vtt(vtt)
        assert result[0]["texto"] == "Linha um Linha dois"
