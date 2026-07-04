import json

import pytest
from app.domain.json3_parser import ms_to_hms, parse_json3


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
        assert set(result[0].keys()) == {"inicio", "fim", "texto"}

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
