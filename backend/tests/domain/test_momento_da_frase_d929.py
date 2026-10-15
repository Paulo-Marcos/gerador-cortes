"""D-929: onde, na `transcricao_final`, o apresentador diz a frase da capa.

A fala usada aqui é a do corte da prova (0d624bfc), com os tempos por palavra
como estão no banco: a frase da capa é a versão curada dela, em caixa alta.
"""

from __future__ import annotations

from app.domain.corte.momento_da_frase import janela_da_frase, palavras_de_peso, palavras_faladas

FRASE_DA_CAPA = "ESSES CARAS NUNCA PISARAM NA RUA... SE PISAR NO SOL, ELES DISSOLVEM NO AR..."


def _segmento(*palavras: tuple[str, float]) -> dict:
    return {"palavras": [{"texto": t, "inicio_seg": s} for t, s in palavras]}


TRANSCRICAO = [
    _segmento(("Eles", 6.0), ("foram", 6.28), ("eleitos", 6.599)),
    _segmento(("fazendo", 7.96), ("a", 8.599), ("vida", 8.799), ("na", 9.0)),
    _segmento(("internet,", 9.2), ("nunca", 9.68)),
    _segmento(
        ("pisaram", 9.96),
        ("na", 10.4),
        ("rua.", 10.6),
        ("Eu", 10.9),
        ("acho", 11.1),
        ("que", 11.3),
        ("se", 11.5),
        ("pisar", 11.6),
        ("no", 11.8),
    ),
    _segmento(
        ("sol,", 11.88),
        ("esses", 12.2),
        ("caras", 12.5),
        ("dissolvem", 12.8),
        ("no", 13.2),
        ("ar,", 13.3),
        ("porque", 13.4),
    ),
    _segmento(("diz", 16.375), ("assim:", 16.6), ("vai", 17.0), ("pra", 17.2), ("rua", 17.4)),
]


class TestJanelaDaFrase:
    def test_acha_a_fala_que_a_capa_reescreveu(self):
        janela = janela_da_frase(TRANSCRICAO, FRASE_DA_CAPA)

        assert janela is not None
        assert (janela.inicio_seg, janela.fim_seg) == (9.68, 13.2)

    def test_nao_estica_ate_uma_palavra_solta_da_fala_anterior(self):
        """O "Eles" das 6 s casa com a capa, mas é outra frase: a janela começa no "nunca"."""
        janela = janela_da_frase(TRANSCRICAO, FRASE_DA_CAPA)

        assert janela.inicio_seg > 6.0
        assert janela.casamento < 1.0

    def test_frase_que_nao_foi_dita_volta_vazia(self):
        assert janela_da_frase(TRANSCRICAO, "O BANCO CENTRAL ERROU A META DE INFLAÇÃO") is None

    def test_frase_so_de_conectivos_nao_localiza_nada(self):
        assert janela_da_frase(TRANSCRICAO, "NA RUA") is None

    def test_trechos_restringem_a_busca_ao_que_o_short_contem(self):
        """Fora dos trechos a palavra não existe: o short não contém aquele momento."""
        assert janela_da_frase(TRANSCRICAO, FRASE_DA_CAPA, trechos=[(14.0, 20.0)]) is None
        assert janela_da_frase(TRANSCRICAO, FRASE_DA_CAPA, trechos=[(9.0, 14.0)]) is not None

    def test_acento_e_pontuacao_nao_atrapalham(self):
        transcricao = [_segmento(("Lula", 140.0), ("é", 140.3), ("adulto", 140.5))]

        janela = janela_da_frase(transcricao, '"LULA É ADULTO"')

        assert (janela.inicio_seg, janela.casamento) == (140.0, 1.0)

    def test_transcricao_torta_nao_derruba(self):
        torta = [None, "texto", {"palavras": [None, {"texto": "x"}, {"inicio_seg": "nan"}]}]

        assert janela_da_frase(torta, FRASE_DA_CAPA) is None


class TestPalavras:
    def test_palavra_de_peso_tem_tres_letras_ou_mais(self):
        assert palavras_de_peso("SE PISAR NO SOL") == ["pisar", "sol"]

    def test_o_fim_de_cada_palavra_e_o_comeco_da_seguinte_com_teto(self):
        """A palavra antes de uma pausa não herda o silêncio (achado do teste do serviço)."""
        faladas = palavras_faladas([_segmento(("c", 30.0), ("a", 1.0), ("b", 1.3))])

        assert [(p.texto, p.inicio_seg, p.fim_seg) for p in faladas] == [
            ("a", 1.0, 1.3),
            ("b", 1.3, 1.9),
            ("c", 30.0, 30.6),
        ]
