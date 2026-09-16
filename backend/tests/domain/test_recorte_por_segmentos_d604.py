"""D-604: a fala de um short COLADO — o defeito que sairia sem erro nenhum.

Um short montado por pedacos descontinuos tem um vao no meio, e a janela
`[inicio, fim]` cobre esse vao. Sem recortar por SEGMENTO, dois consumidores
levariam a fala que o operador tirou fora:

- a **legenda queimada** (`transcricao_fiel.recortar_varios`) escreveria por cima
  de um video que pulou — o texto lendo o que ninguem ouve;
- a **IA** (`cenas_short_ia.recortar_transcricao_varios`) prometeria no gancho,
  no post e na etiqueta da capa um assunto que o arquivo nao contem.

Nenhum dos dois quebra nada. Por isso eles precisam de teste.
"""

from app.domain.cenas_short_ia import recortar_transcricao_varios
from app.domain.transcricao_fiel import Palavra, recortar, recortar_varios

# Uma fala por bloco de dez segundos, para dar para apontar o que entrou.
FALA = [
    Palavra("zero", 2.0, 2.5),
    Palavra("dez", 12.0, 12.5),
    Palavra("vinte", 22.0, 22.5),
    Palavra("trinta", 32.0, 32.5),
    Palavra("quarenta", 42.0, 42.5),
    Palavra("cinquenta", 52.0, 52.5),
]

# O pedido do operador: 0-30 e depois 45-60. O vao de 30 a 45 fica fora.
PEDIDO = [(0.0, 30.0, 0.0), (45.0, 60.0, 30.0)]


class TestLegenda:
    def test_a_fala_do_buraco_nao_entra(self):
        # "trinta" e "quarenta" caem no vao — se aparecerem, a legenda esta
        # lendo o que o video nao mostra.
        ditas = [p.texto for p in recortar_varios(FALA, PEDIDO)]
        assert ditas == ["zero", "dez", "vinte", "cinquenta"]

    def test_o_segundo_pedaco_e_rebaseado_no_offset_e_nao_no_zero(self):
        # Sem o offset, "cinquenta" (52s no bruto) cairia aos 7s do short, por
        # cima da fala do primeiro pedaco.
        por_texto = {p.texto: p.inicio_seg for p in recortar_varios(FALA, PEDIDO)}
        assert por_texto["cinquenta"] == 37.0  # 30s de offset + 7s dentro do pedaco

    def test_uma_janela_so_devolve_o_mesmo_que_o_recorte_simples(self):
        # A nao-regressao: short sem colagem sai exatamente como antes.
        assert recortar_varios(FALA, [(10.0, 40.0, 0.0)]) == recortar(FALA, 10.0, 40.0)

    def test_a_ordem_livre_poe_a_fala_de_cada_pedaco_no_lugar_certo(self):
        # O gancho dos 45s abrindo: "cinquenta" vem primeiro, "zero" depois.
        gancho_primeiro = [(45.0, 60.0, 0.0), (0.0, 30.0, 15.0)]
        ditas = [p.texto for p in recortar_varios(FALA, gancho_primeiro)]
        assert ditas == ["cinquenta", "zero", "dez", "vinte"]

    def test_sai_ordenado_pelo_tempo_do_short(self):
        # A legenda so conhece o tempo do short; uma lista fora de ordem faria o
        # agrupamento em paginas do renderer montar frases embaralhadas.
        tempos = [
            p.inicio_seg for p in recortar_varios(FALA, [(45.0, 60.0, 0.0), (0.0, 30.0, 15.0)])
        ]
        assert tempos == sorted(tempos)

    def test_janela_nenhuma_devolve_lista_vazia(self):
        assert recortar_varios(FALA, []) == []


class TestFalaParaIA:
    # A transcricao da IA vem por segmentos de fala, com `start`/`fim`.
    TRANSCRICAO = [
        {"start": 2.0, "fim": 4.0, "texto": "abre"},
        {"start": 35.0, "fim": 38.0, "texto": "no buraco"},
        {"start": 52.0, "fim": 55.0, "texto": "fecha"},
    ]

    def test_a_fala_do_buraco_nao_chega_ao_modelo(self):
        ditas = [c["texto"] for c in recortar_transcricao_varios(self.TRANSCRICAO, PEDIDO)]
        assert ditas == ["abre", "fecha"]

    def test_o_start_vem_no_tempo_do_short(self):
        por_texto = {
            c["texto"]: c["start"] for c in recortar_transcricao_varios(self.TRANSCRICAO, PEDIDO)
        }
        assert por_texto["abre"] == 2.0
        assert por_texto["fecha"] == 37.0

    def test_ordem_livre_reordena_a_fala_como_o_short_a_conta(self):
        gancho_primeiro = [(45.0, 60.0, 0.0), (0.0, 30.0, 15.0)]
        ditas = [c["texto"] for c in recortar_transcricao_varios(self.TRANSCRICAO, gancho_primeiro)]
        assert ditas == ["fecha", "abre"]
