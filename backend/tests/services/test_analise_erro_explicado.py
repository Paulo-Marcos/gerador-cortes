"""D-445: uma análise que não gera corte precisa dizer POR QUÊ.

Quando o modelo descarta a live inteira ele escreve o motivo em `descartados`;
esse texto era jogado fora e o operador recebia só "Claude não retornou cortes".
"""

from app.services.analise import AnaliseService


class TestMotivoDeZeroCortes:
    def test_usa_o_motivo_que_o_modelo_registrou(self):
        descartados = [
            {
                "tema": "Live inteira",
                "motivo": "TRANSCRIÇÃO INDISPONÍVEL: o material recebido não tem fala.",
            }
        ]

        mensagem = AnaliseService._motivo_de_zero_cortes(descartados)

        assert "TRANSCRIÇÃO INDISPONÍVEL" in mensagem
        assert "não tem fala" in mensagem

    def test_ignora_descartes_sem_motivo_e_pega_o_primeiro_que_tem(self):
        descartados = [{"tema": "A"}, {"tema": "B", "motivo": "fora da régua editorial"}]

        assert "fora da régua editorial" in AnaliseService._motivo_de_zero_cortes(descartados)

    def test_sem_descartados_ainda_orienta_o_operador(self):
        mensagem = AnaliseService._motivo_de_zero_cortes([])

        assert "não registrou o motivo" in mensagem
        assert "transcrição" in mensagem

    def test_motivo_longo_e_truncado_para_caber_na_tela(self):
        descartados = [{"tema": "X", "motivo": "palavra " * 200}]

        mensagem = AnaliseService._motivo_de_zero_cortes(descartados)

        assert len(mensagem) < 500
        assert mensagem.endswith("…")
