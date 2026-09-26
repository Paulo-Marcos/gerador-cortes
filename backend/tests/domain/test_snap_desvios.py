"""Testes de `app.domain.corte.snap_desvios` (D-339 — encaixe na borda de palavra).

Função pura: recebe um desvio + a lista achatada de palavras (com tempo real por
palavra, da D-337) e devolve o desvio com as bordas encaixadas na palavra mais
próxima, dentro de uma janela — sem nunca piorar o intervalo.
"""

from __future__ import annotations

from app.domain.corte.snap_desvios import achatar_palavras, snap_desvio_a_palavras

# Palavras de referência (tempos absolutos em segundos), já ordenadas.
_PALAVRAS = [
    {"texto": "a", "inicio_seg": 10.0},
    {"texto": "b", "inicio_seg": 10.6},
    {"texto": "c", "inicio_seg": 11.2},
    {"texto": "d", "inicio_seg": 12.0},
]


class TestSnapDesvioAPalavras:
    def test_borda_no_meio_da_palavra_encaixa_na_palavra(self):
        """(a) Início e fim caídos no meio de palavras são movidos para as bordas
        reais mais próximas dentro da janela."""
        desvio = {"inicio_seg": 10.2, "fim_seg": 11.5, "motivo": "chat"}
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS)

        # início 10.2 → 10.0 (começo da palavra 'a'); fim 11.5 → 11.2 (fim de 'c',
        # que é o início da próxima palavra 'd'? não — 11.2 é o início de 'c'):
        # os FINS de palavra = inícios das seguintes → [10.6, 11.2, 12.0, 12.3];
        # o mais próximo de 11.5 é 11.2.
        assert snap["inicio_seg"] == 10.0
        assert snap["fim_seg"] == 11.2
        # hms recalculados de forma coerente
        assert snap["inicio_hms"] == "00:00:10.000"
        assert snap["fim_hms"] == "00:00:11.200"

    def test_sem_palavras_e_no_op(self):
        """(b) Corte antigo sem timing por palavra → devolve o desvio idêntico."""
        desvio = {"inicio_seg": 10.2, "fim_seg": 11.5, "motivo": "chat", "origem": "claude"}
        assert snap_desvio_a_palavras(desvio, []) == desvio

    def test_janela_maxima_respeitada_nao_snapa_longe(self):
        """(c) Proposta longe de qualquer palavra (fora da janela) → sem snap."""
        desvio = {"inicio_seg": 50.0, "fim_seg": 51.0, "motivo": "chat"}
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS, janela_seg=0.8)
        assert snap == desvio

    def test_snap_que_inverteria_ou_colapsaria_devolve_original(self):
        """(d) Se o encaixe faria fim <= início, mantém o desvio original."""
        # início 11.9 → 12.0 ('d'); fim 12.1 → 12.0 (fim de 'd'): colapsaria.
        desvio = {"inicio_seg": 11.9, "fim_seg": 12.1, "motivo": "chat"}
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS)
        assert snap == desvio

    def test_preserva_motivo_origem_e_demais_campos(self):
        """(e) Todos os campos fora de tempo sobrevivem ao snap."""
        desvio = {
            "inicio_seg": 10.2,
            "fim_seg": 11.5,
            "motivo": "[REPETICAO] repete demais",
            "origem": "claude",
            "extra": {"k": 1},
        }
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS)
        assert snap["motivo"] == "[REPETICAO] repete demais"
        assert snap["origem"] == "claude"
        assert snap["extra"] == {"k": 1}
        # o original não é mutado (dict de saída é uma cópia)
        assert desvio["inicio_seg"] == 10.2

    def test_snap_parcial_um_lado_dentro_outro_fora_da_janela(self):
        """Só o lado com borda na janela é encaixado; o outro mantém o proposto."""
        # início 10.2 → 10.0 (na janela); fim 40.0 → longe de tudo (mantém 40.0).
        desvio = {"inicio_seg": 10.2, "fim_seg": 40.0, "motivo": "chat"}
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS)
        assert snap["inicio_seg"] == 10.0
        assert snap["fim_seg"] == 40.0

    def test_le_bordas_a_partir_de_hms_quando_faltam_segundos(self):
        """Sem inicio_seg/fim_seg, cai para inicio_hms/fim_hms (dado legado)."""
        desvio = {"inicio_hms": "00:00:10.200", "fim_hms": "00:00:11.500", "motivo": "x"}
        snap = snap_desvio_a_palavras(desvio, _PALAVRAS)
        assert snap["inicio_seg"] == 10.0
        assert snap["fim_seg"] == 11.2


class TestAchatarPalavras:
    def test_achata_de_varios_segmentos_e_ordena(self):
        transcricao = [
            {"texto": "seg2", "palavras": [{"texto": "c", "inicio_seg": 11.0}]},
            {
                "texto": "seg1",
                "palavras": [
                    {"texto": "a", "inicio_seg": 9.0},
                    {"texto": "b", "inicio_seg": 10.0},
                ],
            },
            {"texto": "sem palavras"},  # segmento legado → não contribui
        ]
        achatadas = achatar_palavras(transcricao)
        assert [p["inicio_seg"] for p in achatadas] == [9.0, 10.0, 11.0]
        assert [p["texto"] for p in achatadas] == ["a", "b", "c"]

    def test_sem_palavras_em_lugar_nenhum_retorna_vazio(self):
        assert achatar_palavras([{"texto": "x"}, {"texto": "y"}]) == []

    def test_tolera_entrada_vazia_ou_none(self):
        assert achatar_palavras([]) == []
        assert achatar_palavras(None) == []
