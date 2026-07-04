from datetime import datetime

import pytest
from app.domain.time_convert import (
    epoch_to_hora_local,
    hms_to_seg,
    hms_to_srt,
    seg_to_duracao_humana,
    seg_to_hms,
    seg_to_hms_short,
    to_seg,
)


class TestHmsToSeg:
    @pytest.mark.parametrize(
        "hms, expected",
        [
            ("01:02:03.500", 3723.5),
            ("00:00:01.000", 1.0),
            ("00:00:00.000", 0.0),
            ("01:00:00.000", 3600.0),
            ("00:01:00.000", 60.0),
            ("10:30:45.250", 37845.25),
        ],
    )
    def test_formato_hh_mm_ss_mmm(self, hms, expected):
        assert hms_to_seg(hms) == pytest.approx(expected, abs=1e-6)

    @pytest.mark.parametrize(
        "hms, expected",
        [
            ("01:02:03", 3723.0),
            ("00:00:01", 1.0),
            ("10:30:45", 37845.0),
        ],
    )
    def test_formato_hh_mm_ss_sem_milissegundos(self, hms, expected):
        assert hms_to_seg(hms) == pytest.approx(expected, abs=1e-6)

    @pytest.mark.parametrize(
        "hms, expected",
        [
            ("02:30", 150.0),
            ("00:01", 1.0),
            ("10:00", 600.0),
        ],
    )
    def test_formato_mm_ss(self, hms, expected):
        assert hms_to_seg(hms) == pytest.approx(expected, abs=1e-6)

    @pytest.mark.parametrize("hms", ["", None])
    def test_string_vazia_ou_none_retorna_zero(self, hms):
        assert hms_to_seg(hms or "") == 0.0

    def test_string_numerica_simples(self):
        assert hms_to_seg("3723.5") == pytest.approx(3723.5, abs=1e-6)


class TestSegToHms:
    @pytest.mark.parametrize(
        "seg, expected",
        [
            (3723.5, "01:02:03.500"),
            (0.0, "00:00:00.000"),
            (3600.0, "01:00:00.000"),
            (60.0, "00:01:00.000"),
            (1.0, "00:00:01.000"),
            (37845.25, "10:30:45.250"),
        ],
    )
    def test_converte_segundos_para_hms(self, seg, expected):
        assert seg_to_hms(seg) == expected

    def test_round_trip_hms_to_seg_to_hms(self):
        original = "01:23:45.678"
        assert seg_to_hms(hms_to_seg(original)) == original

    def test_round_trip_seg_to_hms_to_seg(self):
        original = 5025.5
        assert hms_to_seg(seg_to_hms(original)) == pytest.approx(original, abs=1e-3)


class TestSegToHmsShort:
    @pytest.mark.parametrize(
        "seconds, expected",
        [
            (3723.7, "01:02:03"),
            (0.0, "00:00:00"),
            (3600.0, "01:00:00"),
            (60.0, "00:01:00"),
            (86399.9, "23:59:59"),
        ],
    )
    def test_converte_sem_milissegundos(self, seconds, expected):
        assert seg_to_hms_short(seconds) == expected

    def test_trunca_milissegundos_sem_arredondar(self):
        # 3723.999 deve ser "01:02:03", não "01:02:04"
        assert seg_to_hms_short(3723.999) == "01:02:03"


class TestToSeg:
    def test_aceita_float(self):
        assert to_seg(120.5) == pytest.approx(120.5)

    def test_aceita_int(self):
        assert to_seg(120) == pytest.approx(120.0)

    def test_aceita_zero(self):
        assert to_seg(0) == pytest.approx(0.0)

    def test_aceita_string_numerica(self):
        assert to_seg("123.45") == pytest.approx(123.45)

    def test_aceita_string_hms(self):
        assert to_seg("01:02:03") == pytest.approx(3723.0)

    def test_aceita_string_hms_com_milissegundos(self):
        assert to_seg("01:02:03.500") == pytest.approx(3723.5)

    def test_string_vazia_retorna_zero(self):
        assert to_seg("") == 0.0

    def test_none_retorna_zero(self):
        assert to_seg(None) == 0.0


class TestHmsToSrt:
    def test_adiciona_milissegundos_quando_ausentes(self):
        assert hms_to_srt("01:02:03") == "01:02:03.000"

    def test_mantem_milissegundos_existentes(self):
        assert hms_to_srt("01:02:03.500") == "01:02:03.500"

    def test_mantem_milissegundos_zeros(self):
        assert hms_to_srt("01:02:03.000") == "01:02:03.000"

    @pytest.mark.parametrize(
        "hms",
        [
            "00:00:01",
            "10:30:45",
            "23:59:59",
        ],
    )
    def test_multiplos_sem_milissegundos(self, hms):
        result = hms_to_srt(hms)
        assert result == f"{hms}.000"
        assert "." in result


class TestEpochToHoraLocal:
    @pytest.mark.parametrize(
        "hora, minuto, segundo, esperado",
        [
            (14, 32, 1, "14:32:01"),
            (0, 0, 0, "00:00:00"),
            (9, 5, 7, "09:05:07"),
            (23, 59, 59, "23:59:59"),
        ],
    )
    def test_formata_hora_de_relogio_local(self, hora, minuto, segundo, esperado):
        # Constrói o epoch a partir de um datetime LOCAL e espera a mesma
        # hora de volta — round-trip independente do fuso da maquina de CI.
        epoch = datetime(2024, 6, 15, hora, minuto, segundo).timestamp()
        assert epoch_to_hora_local(epoch) == esperado

    def test_saida_tem_formato_hh_mm_ss(self):
        epoch = datetime(2024, 1, 1, 1, 2, 3).timestamp()
        resultado = epoch_to_hora_local(epoch)
        assert len(resultado) == 8
        assert resultado.count(":") == 2


class TestSegToDuracaoHumana:
    @pytest.mark.parametrize(
        "seg, esperado",
        [
            (0, "0s"),
            (-5, "0s"),
            (1, "1s"),
            (45, "45s"),
            (59.9, "59s"),
            (60, "1m 00s"),
            (979, "16m 19s"),
            (3599, "59m 59s"),
            (3600, "1h 00m 00s"),
            (3723, "1h 02m 03s"),
            (4198.4, "1h 09m 58s"),
        ],
    )
    def test_formata_duracao_legivel(self, seg, esperado):
        assert seg_to_duracao_humana(seg) == esperado

    def test_trunca_sem_arredondar(self):
        assert seg_to_duracao_humana(119.999) == "1m 59s"
