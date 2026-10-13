"""D-909: a claridade da capa, medida em imagens sintéticas.

As imagens são geradas no teste com o Pillow e lidas pelo mesmo histograma que o
serviço usa; os números da medição de 13/10/2026 viram casos da meta.
"""

import pytest
from app.domain.compartilhado.erros import PedidoInvalido
from app.domain.corte.claridade_da_capa import (
    Claridade,
    MetaDeClaridade,
    abaixo_da_meta,
    medir_claridade,
    meta_valida,
)
from app.infrastructure.imagem.histograma import histograma_de_luminancia
from PIL import Image


def _medir(tmp_path, imagem: Image.Image) -> Claridade:
    caminho = tmp_path / "capa.png"
    imagem.save(caminho)
    return medir_claridade(histograma_de_luminancia(caminho))


def test_branca_e_toda_clara(tmp_path):
    assert _medir(tmp_path, Image.new("RGB", (160, 90), "white")) == Claridade(255.0, 0.0)


def test_preta_e_toda_escura(tmp_path):
    assert _medir(tmp_path, Image.new("RGB", (160, 90), "black")) == Claridade(0.0, 100.0)


def test_metade_preta_metade_branca(tmp_path):
    imagem = Image.new("L", (160, 90), 0)
    imagem.paste(255, (80, 0, 160, 90))

    assert _medir(tmp_path, imagem) == Claridade(127.5, 50.0)


def test_o_limiar_do_escuro_e_50(tmp_path):
    imagem = Image.new("L", (100, 10), 49)
    imagem.paste(50, (50, 0, 100, 10))

    assert _medir(tmp_path, imagem).escuros_pct == 50.0


def test_cor_vira_luminancia_e_alfa_nao_conta(tmp_path):
    medida = _medir(tmp_path, Image.new("RGBA", (40, 40), (255, 0, 0, 0)))

    # Vermelho puro em luma 601: 0,299 x 255 ~ 76.
    assert medida == Claridade(76.0, 0.0)


def test_histograma_errado_e_recusado():
    with pytest.raises(PedidoInvalido):
        medir_claridade([1, 2, 3])
    with pytest.raises(PedidoInvalido):
        medir_claridade([0] * 256)


class TestMeta:
    def test_a_meta_padrao_e_a_combinada(self):
        assert MetaDeClaridade() == MetaDeClaridade(95.0, 40.0)

    @pytest.mark.parametrize(
        ("medida", "abaixo"),
        [
            (Claridade(77, 51), True),  # o canal do operador, 13/10
            (Claridade(85, 43), True),  # a referência roxa
            (Claridade(107, 34), False),  # o canal Flow
            (Claridade(120, 45), True),  # média boa, mas grade escura demais
        ],
    )
    def test_as_grades_medidas_contra_a_meta_padrao(self, medida, abaixo):
        assert abaixo_da_meta(medida, MetaDeClaridade()) is abaixo

    def test_meta_do_canal_muda_a_regua(self):
        assert abaixo_da_meta(Claridade(85, 43), MetaDeClaridade(80, 45)) is False

    @pytest.mark.parametrize(("lum", "escuros"), [(-1, 40), (256, 40), (95, -1), (95, 101)])
    def test_meta_fora_da_escala_e_recusada(self, lum, escuros):
        with pytest.raises(PedidoInvalido):
            meta_valida(lum, escuros)
