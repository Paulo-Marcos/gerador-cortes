"""D-543: a moldura nao degrada junto com o conteudo.

A D-508 trocou as duas barras verdes chapadas pelo palco texturizado do canal —
mas so no caminho em que HA plano de palco. Num corte sem preset de recortes o
plano e `None`, o render degrada para o recorte 9:16 do quadro cru, e a moldura
voltava a ser cor solida. Foi essa a queixa: "so o verde puro nao fica legal".

A degradacao ali e do CONTEUDO (uma janela cheia em vez de duas), e nao da
IDENTIDADE. Sao coisas diferentes e estavam amarradas.
"""

from app.domain.short.moldura_short import (
    FRACAO_FAIXA,
    Moldura,
    faixas,
    janela_entre_as_faixas,
)
from app.domain.short.palco_short import CANVAS


class TestJanelaEntreAsFaixas:
    def test_ocupa_tudo_o_que_as_faixas_deixam(self):
        janela = janela_entre_as_faixas(Moldura.PALCO)
        barras = faixas(Moldura.PALCO)

        assert janela["y"] == barras[0].h
        assert janela["y"] + janela["h"] == barras[1].y

    def test_e_de_largura_cheia(self):
        # A moldura so ocupa topo e rodape: recortar a largura aqui esconderia
        # video por nada.
        janela = janela_entre_as_faixas(Moldura.PALCO)

        assert janela["x"] == 0
        assert janela["w"] == CANVAS.largura

    def test_sem_moldura_nao_ha_janela_a_descrever(self):
        # `NENHUMA` e o quadro cru: nao ha PNG de palco nenhum para gerar, e
        # devolver uma janela aqui faria o render sobrepor uma imagem
        # inteiramente transparente por nada.
        assert janela_entre_as_faixas(Moldura.NENHUMA) is None

    def test_aceita_a_moldura_como_texto(self):
        # O valor vem do banco como string; exigir o enum aqui obrigaria cada
        # chamador a converter.
        assert janela_entre_as_faixas("palco") == janela_entre_as_faixas(Moldura.PALCO)

    def test_sobra_a_maior_parte_do_quadro_para_o_video(self):
        """Guarda contra um ajuste futuro de FRACAO_FAIXA que comesse a cena.

        As faixas moram na safe zone dos apps (18% em cima e embaixo), que ja e
        area morta. Se a janela cair abaixo de 80% da altura, a moldura deixou
        de ser assinatura e virou enquadramento.
        """
        janela = janela_entre_as_faixas(Moldura.PALCO)

        assert janela["h"] / CANVAS.altura > 0.80
        assert FRACAO_FAIXA < 0.18
