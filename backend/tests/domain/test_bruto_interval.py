import pytest
from app.domain.bruto_interval import calcular_intervalo_bruto


class TestCalcularIntervaloBruto:
    def test_intervalo_e_exatamente_o_corte(self):
        assert calcular_intervalo_bruto(60.0, 300.0, 600.0) == (60.0, 300.0)

    def test_fim_clipado_pela_duracao_do_video(self):
        assert calcular_intervalo_bruto(60.0, 700.0, 600.0) == (60.0, 600.0)

    def test_fim_sem_duracao_conhecida_mantem_corte(self):
        assert calcular_intervalo_bruto(60.0, 300.0, None) == (60.0, 300.0)

    def test_sem_padding_inicial(self):
        # Mesmo com corte começando perto do início do vídeo, não há recuo de 30s.
        assert calcular_intervalo_bruto(10.0, 100.0, 600.0) == (10.0, 100.0)

    def test_corte_no_zero(self):
        assert calcular_intervalo_bruto(0.0, 100.0, 600.0) == (0.0, 100.0)

    def test_duracao_do_arquivo_bruto_igual_a_duracao_do_corte(self):
        """Invariante chave: a duração do bruto deve ser idêntica a (fim - inicio) do corte,
        para que o campo 'Duração' do editor coincida com o arquivo gerado."""
        inicio, fim = 123.4, 615.5  # 492.1s = 08:12.1
        i, f = calcular_intervalo_bruto(inicio, fim, 7200.0)
        assert f - i == pytest.approx(fim - inicio)

    def test_aceita_inteiros(self):
        i, f = calcular_intervalo_bruto(60, 300, 600)
        assert isinstance(i, float) and isinstance(f, float)
        assert (i, f) == (60.0, 300.0)
