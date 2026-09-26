"""Um conversor de tempo só, e erro que deixa rastro (D-654).

Havia duas implementações de "HH:MM:SS para segundos". A do router engolia
qualquer erro e devolvia 0.0 — e zero é um tempo VÁLIDO, então o erro se
disfarçava de resposta: o corte ia para o começo do vídeo e ninguém ficava
sabendo. Conferido contra os dados reais antes da troca: 78.981 tempos gravados
nos bancos de DEV e de PROD, zero divergências entre as duas implementações.
"""

import pytest
from app.domain.compartilhado.time_convert import hms_to_seg
from app.domain.projeto.transcricao_utils import _segundos


class TestOConversorUnico:
    @pytest.mark.parametrize(
        "texto,esperado",
        [
            ("00:00:10", 10.0),
            ("01:02:03", 3723.0),
            ("01:02:03.500", 3723.5),
            ("02:05", 125.0),
            ("42", 42.0),
            ("", 0.0),
        ],
    )
    def test_converte_as_formas_que_o_app_grava(self, texto, esperado):
        assert hms_to_seg(texto) == pytest.approx(esperado)

    @pytest.mark.parametrize("lixo", ["lixo", "12:34x", "--:--:--"])
    def test_tempo_impossivel_levanta_em_vez_de_inventar_zero(self, lixo):
        with pytest.raises(ValueError):
            hms_to_seg(lixo)


class TestSegundosDaTranscricao:
    """O `_segundos` do módulo substituiu duas cópias aninhadas idênticas."""

    @pytest.mark.parametrize(
        "valor,esperado",
        [
            (12.5, 12.5),
            (12, 12.0),
            ("12.5", 12.5),
            ("00:00:12.500", 12.5),
            ("01:00:00", 3600.0),
        ],
    )
    def test_le_numero_string_numerica_e_hms(self, valor, esperado):
        assert _segundos(valor) == pytest.approx(esperado)

    def test_continua_aceitando_o_formato_dos_projetos_antigos(self):
        """Era o motivo de as cópias existirem: transcrição antiga com HH:MM:SS."""
        assert _segundos("00:02:03.250") == pytest.approx(123.25)
