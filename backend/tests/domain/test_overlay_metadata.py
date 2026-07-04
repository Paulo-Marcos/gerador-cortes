import pytest
from app.domain.overlay_metadata import OverlayEntry, build_overlay_entries


def _entry(start=0.0, end=5.0, tipo="cena", id="001"):
    return OverlayEntry(id=id, start_sec=start, end_sec=end, tipo=tipo, cena_dict={"tipo": tipo})


class TestOverlayEntry:
    def test_duration_sec(self):
        e = _entry(start=10.0, end=15.0)
        assert e.duration_sec == pytest.approx(5.0)

    def test_duration_sec_zero(self):
        e = _entry(start=5.0, end=5.0)
        assert e.duration_sec == pytest.approx(0.0)

    def test_duration_frames_30fps(self):
        e = _entry(start=0.0, end=1.0)
        assert e.duration_frames == 30

    def test_duration_frames_arredonda(self):
        e = _entry(start=0.0, end=0.5)
        assert e.duration_frames == 15

    def test_duration_frames_5seg(self):
        e = _entry(start=0.0, end=5.0)
        assert e.duration_frames == 150

    def test_to_dict_retorna_cena_dict(self):
        cena = {"tipo": "cena_intro", "titulo": "Olá"}
        e = OverlayEntry(id="001", start_sec=0.0, end_sec=5.0, tipo="cena_intro", cena_dict=cena)
        assert e.to_dict() == cena

    def test_e_imutavel_frozen(self):
        e = _entry()
        with pytest.raises(Exception):
            e.start_sec = 99.0  # type: ignore

    def test_id_preservado(self):
        e = _entry(id="007")
        assert e.id == "007"

    def test_tipo_preservado(self):
        e = _entry(tipo="highlight")
        assert e.tipo == "highlight"


class TestBuildOverlayEntries:
    def test_lista_vazia_retorna_vazia(self):
        assert build_overlay_entries([]) == []

    def test_converte_cena_valida(self):
        cenas = [{"tipo": "cena", "inicio": 0.0, "fim": 5.0}]
        result = build_overlay_entries(cenas)
        assert len(result) == 1

    def test_entry_tem_tipo_correto(self):
        cenas = [{"tipo": "cena_intro", "inicio": 0.0, "fim": 5.0}]
        result = build_overlay_entries(cenas)
        assert result[0].tipo == "cena_intro"

    def test_entry_tem_start_end_corretos(self):
        cenas = [{"tipo": "c", "inicio": 10.0, "fim": 20.0}]
        result = build_overlay_entries(cenas)
        assert result[0].start_sec == pytest.approx(10.0)
        assert result[0].end_sec == pytest.approx(20.0)

    def test_cena_sem_tipo_ignorada(self):
        cenas = [{"inicio": 0.0, "fim": 5.0}]
        result = build_overlay_entries(cenas)
        assert result == []

    def test_cena_com_fim_igual_inicio_ignorada(self):
        cenas = [{"tipo": "c", "inicio": 5.0, "fim": 5.0}]
        result = build_overlay_entries(cenas)
        assert result == []

    def test_cena_com_fim_menor_que_inicio_ignorada(self):
        cenas = [{"tipo": "c", "inicio": 10.0, "fim": 5.0}]
        result = build_overlay_entries(cenas)
        assert result == []

    def test_multiplas_cenas_ordenadas_por_inicio(self):
        cenas = [
            {"tipo": "b", "inicio": 20.0, "fim": 25.0},
            {"tipo": "a", "inicio": 5.0, "fim": 10.0},
        ]
        result = build_overlay_entries(cenas)
        assert result[0].start_sec < result[1].start_sec

    def test_id_gerado_com_zero_padding(self):
        cenas = [{"tipo": "c", "inicio": i * 10.0, "fim": i * 10.0 + 5.0} for i in range(3)]
        result = build_overlay_entries(cenas)
        ids = [e.id for e in result]
        assert ids == ["001", "002", "003"]

    def test_aceita_inicio_como_string_hms(self):
        cenas = [{"tipo": "c", "inicio": "00:01:00.000", "fim": "00:01:05.000"}]
        result = build_overlay_entries(cenas)
        assert len(result) == 1
        assert result[0].start_sec == pytest.approx(60.0)

    def test_cena_dict_preservada_na_entry(self):
        cena = {"tipo": "cena", "inicio": 0.0, "fim": 5.0, "dados_extras": "valor"}
        result = build_overlay_entries([cena])
        assert result[0].cena_dict == cena
