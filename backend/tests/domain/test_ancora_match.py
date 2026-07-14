"""Testes de `app.domain.ancora_match` (D-355 — âncora verbatim de borda).

Função pura: dada a CITAÇÃO do texto onde a borda cai e o timestamp aproximado
do LLM, ancora a borda no tempo real daquela palavra na transcrição word-level,
buscando SÓ numa janela em torno do timestamp — não-quebradiço (sem citação, sem
palavras ou sem bom match → None; nunca inverte a borda).
"""

from __future__ import annotations

from app.domain.ancora_match import ancorar_borda, ancorar_intervalo

# Palavras word-level (tempos absolutos em segundos), já ordenadas. A frase
# "subiu no telhado" aparece DUAS vezes: perto de t=101 e de novo lá em t=500.
_PALAVRAS = [
    {"texto": "o", "inicio_seg": 100.0},
    {"texto": "gato", "inicio_seg": 100.5},
    {"texto": "subiu", "inicio_seg": 101.0},
    {"texto": "no", "inicio_seg": 101.5},
    {"texto": "telhado", "inicio_seg": 102.0},
    {"texto": "e", "inicio_seg": 102.5},
    {"texto": "miou", "inicio_seg": 103.0},
    # ... muito depois, a MESMA frase de novo (deve ficar fora da janela) ...
    {"texto": "subiu", "inicio_seg": 500.0},
    {"texto": "no", "inicio_seg": 500.5},
    {"texto": "telhado", "inicio_seg": 501.0},
]


class TestAncorarBorda:
    def test_citacao_casa_dentro_da_janela(self):
        """(a) A citação bate na palavra certa dentro da janela → devolve o
        inicio_seg da primeira palavra do trecho casado."""
        t = ancorar_borda("subiu no telhado", 101.0, _PALAVRAS, janela_seg=5.0, is_inicio=True)
        assert t == 101.0

    def test_frase_repetida_fora_da_janela_nao_interfere(self):
        """(b) A MESMA frase existe em t=500, mas a janela ±5s de t=101 a exclui —
        vence a ocorrência de dentro da janela."""
        t = ancorar_borda("subiu no telhado", 101.0, _PALAVRAS, janela_seg=5.0, is_inicio=True)
        assert t == 101.0  # não 500.0

    def test_similaridade_baixa_devolve_none(self):
        """(c) Citação que não se parece com nada na janela → None (fallback)."""
        t = ancorar_borda(
            "elefante roxo dançando xilofone",
            101.0,
            _PALAVRAS,
            janela_seg=5.0,
            is_inicio=True,
        )
        assert t is None

    def test_sem_palavras_devolve_none(self):
        """(d) Sem timing por palavra (VTT legado) → None."""
        assert ancorar_borda("subiu no telhado", 101.0, [], janela_seg=5.0, is_inicio=True) is None

    def test_citacao_vazia_devolve_none(self):
        """Citação vazia/ausente → None (nada a ancorar)."""
        assert ancorar_borda("", 101.0, _PALAVRAS, janela_seg=5.0, is_inicio=True) is None
        assert ancorar_borda("   ", 101.0, _PALAVRAS, janela_seg=5.0, is_inicio=True) is None

    def test_fim_devolve_o_fim_da_ultima_palavra(self):
        """is_inicio=False → o FIM da última palavra casada = início da seguinte."""
        # casa "gato"; a palavra seguinte ("subiu") começa em 101.0 → é o fim.
        t = ancorar_borda("gato", 100.5, _PALAVRAS, janela_seg=5.0, is_inicio=False)
        assert t == 101.0

    def test_ocorrencia_mais_proxima_vence_em_empate(self):
        """Duas ocorrências idênticas DENTRO da janela → a mais próxima do
        timestamp aproximado vence (determinístico)."""
        palavras = [
            {"texto": "corte", "inicio_seg": 10.0},
            {"texto": "aqui", "inicio_seg": 10.5},
            {"texto": "corte", "inicio_seg": 30.0},
            {"texto": "aqui", "inicio_seg": 30.5},
        ]
        # tempo_aprox mais perto da segunda ocorrência
        t = ancorar_borda("corte aqui", 29.0, palavras, janela_seg=25.0, is_inicio=True)
        assert t == 30.0


class TestAncorarIntervalo:
    def test_ancora_ambas_as_bordas(self):
        novo_ini, novo_fim = ancorar_intervalo(
            "gato subiu", "e miou", 100.0, 104.0, _PALAVRAS, janela_seg=5.0
        )
        assert novo_ini == 100.5  # início de "gato"
        assert novo_fim == 103.3  # última palavra "miou" (103.0) + folga 0.3

    def test_nao_inverte_borda(self):
        """(e) Se a âncora inverteria/colapsaria o intervalo (fim ≤ início),
        descarta a âncora e mantém o par proposto original."""
        # inicio_texto casa "telhado" (t=102.0); fim_texto casa "gato" (fim=101.0):
        # ancorado daria início=102 e fim≈101 → inversão → fallback total.
        novo_ini, novo_fim = ancorar_intervalo(
            "telhado", "gato", 100.0, 103.0, _PALAVRAS, janela_seg=5.0
        )
        assert (novo_ini, novo_fim) == (100.0, 103.0)

    def test_um_lado_sem_citacao_mantem_o_proposto(self):
        """Só o início tem citação → só ele é ancorado; o fim mantém o proposto."""
        novo_ini, novo_fim = ancorar_intervalo(
            "gato subiu", "", 100.0, 104.0, _PALAVRAS, janela_seg=5.0
        )
        assert novo_ini == 100.5
        assert novo_fim == 104.0

    def test_sem_palavras_mantem_o_proposto(self):
        assert ancorar_intervalo("gato", "miou", 100.0, 104.0, [], janela_seg=5.0) == (100.0, 104.0)
