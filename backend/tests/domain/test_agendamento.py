"""D-580: a regra de "quando o post vai ao ar", sem plataforma nenhuma.

O que estes testes guardam nao e a aritmetica de datas — e a RECUSA. Cada regra
aqui existe porque, sem ela, a plataforma nao daria erro: daria outra coisa.
"""

from datetime import datetime, timedelta, timezone

import pytest
from app.domain.agendamento import Agendamento, AgendamentoInvalido, validar


def _daqui(horas: float) -> datetime:
    return datetime.now().astimezone() + timedelta(hours=horas)


class TestLeituraDoTexto:
    def test_vazio_e_ausencia_e_nao_erro(self):
        """Publicar agora continua sendo uma escolha legitima."""
        assert Agendamento.de_texto("") is None
        assert Agendamento.de_texto(None) is None
        assert Agendamento.de_texto("   ") is None

    def test_le_o_formato_que_a_tela_manda(self):
        agendamento = Agendamento.de_texto("2030-09-12T14:05")

        assert agendamento.data_iso() == "2030-09-12"
        assert (agendamento.hora(), agendamento.minuto()) == ("14", "05")

    def test_texto_sem_sentido_falha_dizendo_o_formato(self):
        with pytest.raises(AgendamentoInvalido, match="2026-09-12T14:05"):
            Agendamento.de_texto("quinta de manha")

    def test_o_dia_sai_sem_zero_a_esquerda(self):
        """O calendario escreve 5, nao 05: procurar '05' nao acharia nada."""
        assert Agendamento.de_texto("2030-09-05T10:00").dia() == "5"


class TestConversaoParaOYouTube:
    def test_converte_para_utc_com_z(self):
        menos_tres = timezone(timedelta(hours=-3))
        agendamento = Agendamento(datetime(2030, 9, 12, 14, 5, tzinfo=menos_tres))

        assert agendamento.em_utc_iso() == "2030-09-12T17:05:00Z"


class TestRecusas:
    def test_passado_e_recusado(self):
        with pytest.raises(AgendamentoInvalido, match="passou"):
            validar(Agendamento(_daqui(-1)), "tiktok")

    def test_daqui_a_um_minuto_e_recusado(self):
        """Perderia a corrida contra o proprio upload."""
        with pytest.raises(AgendamentoInvalido, match="perto demais|passou"):
            validar(Agendamento(_daqui(0.01)), "tiktok")

    def test_minuto_fora_da_grade_de_cinco_e_recusado_no_tiktok(self):
        """O seletor do TikTok nao tem 14:03 — o robo clicaria em outra coisa."""
        alvo = _daqui(24).replace(minute=3, second=0, microsecond=0)

        with pytest.raises(AgendamentoInvalido, match="5 em 5"):
            validar(Agendamento(alvo), "tiktok")

    def test_o_mesmo_minuto_passa_no_youtube(self):
        """A regra e do TikTok, nao do agendamento: o YouTube aceita 14:03."""
        alvo = _daqui(24).replace(minute=3, second=0, microsecond=0)

        validar(Agendamento(alvo), "youtube_shorts")

    def test_fora_do_horizonte_da_plataforma_e_recusado(self):
        with pytest.raises(AgendamentoInvalido, match="10 dias"):
            validar(Agendamento(_daqui(24 * 30)), "tiktok")

    def test_o_horizontal_segue_a_mesma_regra_do_tiktok(self):
        """`tiktok_horizontal` e o mesmo Studio, com o mesmo seletor."""
        alvo = _daqui(24).replace(minute=7, second=0, microsecond=0)

        with pytest.raises(AgendamentoInvalido, match="5 em 5"):
            validar(Agendamento(alvo), "tiktok_horizontal")

    def test_caminho_feliz_nao_levanta_nada(self):
        alvo = _daqui(24).replace(minute=0, second=0, microsecond=0)

        validar(Agendamento(alvo), "tiktok")
