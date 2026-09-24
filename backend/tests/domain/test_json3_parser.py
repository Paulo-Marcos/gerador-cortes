import json

import pytest
from app.domain.projeto.json3_parser import ms_to_hms, parse_json3


class TestMsToHms:
    @pytest.mark.parametrize(
        "ms, expected",
        [
            (0, "00:00:00.000"),
            (1000, "00:00:01.000"),
            (60000, "00:01:00.000"),
            (3600000, "01:00:00.000"),
            (3723500, "01:02:03.500"),
            (500, "00:00:00.500"),
            (1500, "00:00:01.500"),
        ],
    )
    def test_converte_milissegundos_para_hms(self, ms, expected):
        assert ms_to_hms(ms) == expected

    def test_formato_tem_seis_caracteres_segundos(self):
        # Deve ser "SS.mmm" (06.3f) — garante zero-padding
        result = ms_to_hms(1500)
        partes = result.split(":")
        assert len(partes[2]) == 6  # "01.500"

    def test_horas_zero_padded(self):
        result = ms_to_hms(0)
        assert result.startswith("00:")

    def test_minutos_zero_padded(self):
        result = ms_to_hms(1000)
        assert result[3:5] == "00"


class TestParseJson3:
    def _make_json3(self, events):
        return json.dumps({"events": events})

    def test_json_invalido_retorna_lista_vazia(self):
        assert parse_json3("isso nao é json") == []

    def test_json_sem_events_retorna_lista_vazia(self):
        assert parse_json3("{}") == []

    def test_events_vazio_retorna_lista_vazia(self):
        assert parse_json3(self._make_json3([])) == []

    def test_evento_sem_texto_ignorado(self):
        events = [{"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": ""}]}]
        result = parse_json3(self._make_json3(events))
        assert result == []

    def test_evento_sem_segs_ignorado(self):
        events = [{"tStartMs": 0, "dDurationMs": 1000, "segs": []}]
        result = parse_json3(self._make_json3(events))
        assert result == []

    def test_evento_simples_converte_corretamente(self):
        events = [{"tStartMs": 1000, "dDurationMs": 2000, "segs": [{"utf8": "Olá mundo"}]}]
        result = parse_json3(self._make_json3(events))
        assert len(result) == 1
        assert result[0]["inicio"] == "00:00:01.000"
        assert result[0]["fim"] == "00:00:03.000"
        assert result[0]["texto"] == "Olá mundo"

    def test_resultado_tem_chaves_inicio_fim_texto(self):
        events = [{"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "Texto"}]}]
        result = parse_json3(self._make_json3(events))
        # inicio/fim/texto continuam presentes (back-compat); `palavras` é aditivo (D-337).
        assert {"inicio", "fim", "texto"}.issubset(result[0].keys())

    def test_multiplos_eventos(self):
        events = [
            {"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "Primeiro"}]},
            {"tStartMs": 2000, "dDurationMs": 1000, "segs": [{"utf8": "Segundo"}]},
        ]
        result = parse_json3(self._make_json3(events))
        assert len(result) == 2
        assert result[0]["texto"] == "Primeiro"
        assert result[1]["texto"] == "Segundo"

    def test_segs_multiplos_concatenados(self):
        events = [
            {
                "tStartMs": 0,
                "dDurationMs": 1000,
                "segs": [
                    {"utf8": "Olá "},
                    {"utf8": "mundo"},
                ],
            }
        ]
        result = parse_json3(self._make_json3(events))
        assert result[0]["texto"] == "Olá mundo"

    def test_newlines_normalizados_para_espaco(self):
        events = [{"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "linha1\nlinha2"}]}]
        result = parse_json3(self._make_json3(events))
        assert "\n" not in result[0]["texto"]
        assert "linha1 linha2" == result[0]["texto"]

    def test_offset_positivo_aplicado(self):
        events = [{"tStartMs": 5000, "dDurationMs": 1000, "segs": [{"utf8": "Texto"}]}]
        result = parse_json3(self._make_json3(events), offset_ms=2000)
        assert result[0]["inicio"] == "00:00:07.000"  # 5000 + 2000 = 7000ms
        assert result[0]["fim"] == "00:00:08.000"  # 7000 + 1000 = 8000ms

    def test_offset_negativo_clampado_a_zero(self):
        # tStartMs=100, offset=-500 → tStartMs deve ser 0 (não negativo)
        events = [{"tStartMs": 100, "dDurationMs": 1000, "segs": [{"utf8": "Texto"}]}]
        result = parse_json3(self._make_json3(events), offset_ms=-500)
        assert result[0]["inicio"] == "00:00:00.000"

    def test_texto_com_espacos_extras_stripado(self):
        events = [{"tStartMs": 0, "dDurationMs": 1000, "segs": [{"utf8": "  texto  "}]}]
        result = parse_json3(self._make_json3(events))
        assert result[0]["texto"] == "texto"

    def test_sem_offset_padrao_zero(self):
        events = [{"tStartMs": 3000, "dDurationMs": 1000, "segs": [{"utf8": "Texto"}]}]
        result_sem = parse_json3(self._make_json3(events))
        result_com = parse_json3(self._make_json3(events), offset_ms=0)
        assert result_sem[0]["inicio"] == result_com[0]["inicio"]


class TestParseJson3TimingPorPalavra:
    """D-337: o json3 traz timing por palavra via `tOffsetMs`; parse_json3 preserva
    esse tempo real absoluto em `palavras`."""

    def _make_json3(self, events):
        return json.dumps({"events": events})

    def _evento_spike(self):
        # Exemplo real do spike: tStartMs=25199, primeira palavra sem offset.
        return {
            "tStartMs": 25199,
            "dDurationMs": 3000,
            "segs": [
                {"utf8": "Fala"},
                {"utf8": " meus", "tOffsetMs": 201},
                {"utf8": " amigos", "tOffsetMs": 441},
                {"utf8": " e", "tOffsetMs": 641},
                {"utf8": " minhas", "tOffsetMs": 801},
                {"utf8": " queridas", "tOffsetMs": 1041},
            ],
        }

    def test_preserva_lista_de_palavras(self):
        result = parse_json3(self._make_json3([self._evento_spike()]))
        palavras = result[0]["palavras"]
        assert [p["texto"] for p in palavras] == [
            "Fala",
            "meus",
            "amigos",
            "e",
            "minhas",
            "queridas",
        ]

    def test_primeira_palavra_sem_offset_usa_tstart_do_evento(self):
        result = parse_json3(self._make_json3([self._evento_spike()]))
        # 25199ms → 25.199s
        assert result[0]["palavras"][0]["inicio_seg"] == pytest.approx(25.199)

    def test_palavra_com_offset_soma_ao_tstart(self):
        result = parse_json3(self._make_json3([self._evento_spike()]))
        palavras = result[0]["palavras"]
        # "amigos" tem tOffsetMs=441 → (25199 + 441)/1000 = 25.640
        assert palavras[2]["inicio_seg"] == pytest.approx(25.640)

    def test_offset_pts_soma_ao_timing_da_palavra(self):
        result = parse_json3(self._make_json3([self._evento_spike()]), offset_ms=1000)
        palavras = result[0]["palavras"]
        # 25199 + 1000 (PTS) = 26199 na primeira palavra
        assert palavras[0]["inicio_seg"] == pytest.approx(26.199)
        # "meus": 25199 + 1000 + 201 = 26400
        assert palavras[1]["inicio_seg"] == pytest.approx(26.400)

    def test_seg_apenas_quebra_de_linha_nao_vira_palavra(self):
        events = [
            {
                "tStartMs": 1000,
                "dDurationMs": 1000,
                "segs": [{"utf8": "Olá"}, {"utf8": "\n"}, {"utf8": " mundo", "tOffsetMs": 300}],
            }
        ]
        result = parse_json3(self._make_json3(events))
        palavras = result[0]["palavras"]
        assert [p["texto"] for p in palavras] == ["Olá", "mundo"]

    def test_texto_concatenado_continua_igual(self):
        # O texto do evento (back-compat) não muda por causa das palavras.
        result = parse_json3(self._make_json3([self._evento_spike()]))
        assert result[0]["texto"] == "Fala meus amigos e minhas queridas"
