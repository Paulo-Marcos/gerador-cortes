"""D-929: qual rosto é o apresentador e quais quadros da frase vão ao ChatGPT.

Os números imitam o corte da prova (0d624bfc, 1280x720): a webcam à esquerda,
o rosto do apresentador perto de x=0.15, e um vídeo comentado à direita com o
rosto de uma moça, de frente e pausado.
"""

from __future__ import annotations

import pytest
from app.domain.canal.fotos_do_apresentador import MAXIMO_DE_FOTOS_POR_CAPA
from app.domain.canal.quadros_do_apresentador import (
    INTERVALO_MINIMO_SEG,
    Caixa,
    QuadroCandidato,
    ampliacao,
    apresentador_entre,
    dentro_da_webcam,
    escolher_quadros,
    instantes_da_frase,
    lugares_de_rosto,
    regiao_do_apresentador,
)

APRESENTADOR = Caixa(0.15, 0.40, 0.094, 0.167)
MOCA_DO_VIDEO = Caixa(0.73, 0.26, 0.15, 0.27)
WEBCAM = Caixa(0.009, 0.26, 0.335, 0.407)  # crop_facecam 17,281,643,440 no canvas 1920


def _perto(caixa: Caixa, dx: float) -> Caixa:
    return Caixa(caixa.x + dx, caixa.y, caixa.largura, caixa.altura)


def _quadros(serie: list[float], *, instante0: float = 0.0, nitidez: float = 100.0):
    """Candidatos cuja miniatura é um tom só — a vida é a variação entre tons."""
    return [
        QuadroCandidato(instante0 + i, nitidez, (tom,) * 4, tem_rosto=True)
        for i, tom in enumerate(serie)
    ]


PARADO = _quadros([0.5, 0.5, 0.501, 0.5])
FALANDO = _quadros([0.5, 0.53, 0.49, 0.55])


class TestLugaresDeRosto:
    def test_o_rosto_que_volta_ao_mesmo_lugar_vira_um_lugar(self):
        quadros = [[_perto(APRESENTADOR, dx)] for dx in (0.0, 0.01, -0.01, 0.005)] + [[], []]

        lugares = lugares_de_rosto(quadros)

        assert len(lugares) == 1
        assert lugares[0].x == pytest.approx(APRESENTADOR.x + 0.0025, abs=0.003)

    def test_rosto_de_passagem_nao_e_lugar(self):
        quadros = [[APRESENTADOR]] * 5 + [[APRESENTADOR, MOCA_DO_VIDEO]] + [[]] * 4

        assert lugares_de_rosto(quadros) == [APRESENTADOR]

    def test_dois_rostos_fixos_viram_dois_lugares_do_mais_frequente_ao_menos(self):
        quadros = [[APRESENTADOR, MOCA_DO_VIDEO]] * 3 + [[MOCA_DO_VIDEO]] * 3

        assert lugares_de_rosto(quadros) == [MOCA_DO_VIDEO, APRESENTADOR]

    def test_sem_rosto_nenhum_nao_ha_lugar(self):
        assert lugares_de_rosto([[], [], []]) == []


class TestApresentadorEntre:
    def test_a_webcam_do_layout_vence_o_rosto_mais_vivo_fora_dela(self):
        """Corte ae39ddad: o convidado do vídeo fala a frase; o apresentador ouve."""
        ouvindo = _quadros([0.5, 0.505, 0.5, 0.506])

        qual = apresentador_entre([MOCA_DO_VIDEO, APRESENTADOR], [FALANDO, ouvindo], WEBCAM)

        assert qual == 1

    def test_sem_webcam_vence_quem_se_mexe_na_frase(self):
        """Corte 0d624bfc: a moça do vídeo pausado aparece mais, mas está parada."""
        assert apresentador_entre([MOCA_DO_VIDEO, APRESENTADOR], [PARADO, FALANDO]) == 1

    def test_webcam_sem_rosto_vivo_cai_no_criterio_da_vida(self):
        assert apresentador_entre([MOCA_DO_VIDEO], [FALANDO], WEBCAM) == 0

    def test_retrato_parado_nao_e_referencia_de_expressao(self):
        assert apresentador_entre([APRESENTADOR], [PARADO], WEBCAM) is None
        assert apresentador_entre([], []) is None


class TestRegiao:
    def test_cabeca_e_ombros_em_volta_do_rosto(self):
        regiao = regiao_do_apresentador(APRESENTADOR, 16 / 9)

        cx, _ = regiao.centro
        assert cx == pytest.approx(APRESENTADOR.centro[0])
        assert regiao.largura == pytest.approx(APRESENTADOR.largura * 3)
        assert regiao.y < APRESENTADOR.y
        assert regiao.y + regiao.altura > APRESENTADOR.y + APRESENTADOR.altura

    def test_rosto_na_borda_nao_tira_a_regiao_do_quadro(self):
        regiao = regiao_do_apresentador(Caixa(0.0, 0.9, 0.1, 0.1), 16 / 9)

        assert regiao.x == 0.0
        assert regiao.y + regiao.altura == pytest.approx(1.0)

    def test_a_tela_ao_lado_da_webcam_fica_de_fora(self):
        regiao = dentro_da_webcam(Caixa(0.0, 0.2, 0.4, 0.4), WEBCAM)

        assert regiao.x + regiao.largura == pytest.approx(WEBCAM.x + WEBCAM.largura, abs=1e-3)

    def test_regiao_fora_da_webcam_fica_inteira(self):
        fora = Caixa(0.6, 0.2, 0.3, 0.4)

        assert dentro_da_webcam(fora, WEBCAM) == fora
        assert dentro_da_webcam(fora, None) == fora


class TestInstantes:
    def test_a_janela_da_frase_ganha_folga_e_nao_sai_do_video(self):
        instantes = instantes_da_frase(0.1, 3.5, 4.0)

        assert instantes[0] == 0.0
        assert instantes[-1] < 4.0

    def test_frase_curta_ainda_da_o_que_escolher(self):
        assert len(instantes_da_frase(140.0, 140.7, 445.9)) >= MAXIMO_DE_FOTOS_POR_CAPA * 2


class TestEscolherQuadros:
    def _candidato(self, instante, nitidez, tom, rosto=True):
        return QuadroCandidato(instante, nitidez, (tom,) * 4, rosto)

    def test_tres_quadros_nitidos_e_diferentes_em_ordem_de_tempo(self):
        candidatos = [
            self._candidato(0.0, 900, 0.50),
            self._candidato(0.4, 880, 0.50),  # igual ao primeiro e colado nele
            self._candidato(1.2, 850, 0.80),
            self._candidato(2.0, 100, 0.20),  # diferente, mas borrado
            self._candidato(2.8, 800, 0.20),
        ]

        escolhidos = escolher_quadros(candidatos)

        assert [c.instante for c in escolhidos] == [0.0, 1.2, 2.8]

    def test_o_primeiro_e_o_mais_nitido_com_rosto(self):
        candidatos = [
            self._candidato(0.0, 999, 0.5, rosto=False),
            self._candidato(2.0, 500, 0.6),
        ]

        assert escolher_quadros(candidatos, maximo=1)[0].instante == 2.0

    def test_quadros_ficam_distantes_no_tempo(self):
        candidatos = [self._candidato(i * 0.4, 500, i / 10) for i in range(4)]

        escolhidos = escolher_quadros(candidatos)

        tempos = [c.instante for c in escolhidos]
        assert all(b - a >= INTERVALO_MINIMO_SEG for a, b in zip(tempos, tempos[1:], strict=False))

    def test_sem_candidatos_nada(self):
        assert escolher_quadros([]) == []


class TestAmpliacao:
    def test_amplia_ate_o_lado_maior_sem_passar_de_quatro_vezes(self):
        assert ampliacao(440, 320) == pytest.approx(2.909, abs=1e-3)
        assert ampliacao(100, 80) == 4.0
        assert ampliacao(1920, 1080) == 1.0
