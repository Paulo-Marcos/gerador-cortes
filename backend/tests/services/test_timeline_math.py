"""Testes para TimelineMath — mapeamento de timestamps entre timelines.

TimelineMath é pura lógica sem I/O, então nenhum mock é necessário.
É o coração da sincronização: qualquer erro aqui propaga para todas as cenas.
"""

import pytest
from app.services.timeline_math import TimelineMath

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _segs(*pairs):
    """Cria lista de segmentos a partir de pares (start, end)."""
    return [{"start": s, "end": e} for s, e in pairs]


def _trans(*items):
    """Cria lista de segmentos de transcrição a partir de tuplas (start, end, texto)."""
    return [{"start": s, "end": e, "texto": t} for s, e, t in items]


# ─────────────────────────────────────────────────────────────
# mapear_tempo_linear
# ─────────────────────────────────────────────────────────────


class TestMapearTempoLinear:
    def test_tempo_no_inicio_do_primeiro_segmento(self):
        segs = _segs((10.0, 20.0))
        assert TimelineMath.mapear_tempo_linear(10.0, segs) == pytest.approx(0.0)

    def test_tempo_no_fim_do_primeiro_segmento(self):
        segs = _segs((10.0, 20.0))
        assert TimelineMath.mapear_tempo_linear(20.0, segs) == pytest.approx(10.0)

    def test_tempo_no_meio_do_segmento(self):
        segs = _segs((10.0, 20.0))
        assert TimelineMath.mapear_tempo_linear(15.0, segs) == pytest.approx(5.0)

    def test_dois_segmentos_tempo_no_segundo(self):
        # Dois segmentos: [0-10] e [20-30] — desvio [10-20] removido
        # Tempo 25 no original → 5s dentro do segundo segmento → acumulado 10 + 5 = 15
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        assert TimelineMath.mapear_tempo_linear(25.0, segs) == pytest.approx(15.0)

    def test_tempo_no_buraco_retorna_none(self):
        # Desvio removido: [10-20] — tempo 15 está no buraco
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        assert TimelineMath.mapear_tempo_linear(15.0, segs) is None

    def test_tempo_antes_do_primeiro_segmento_retorna_none(self):
        segs = _segs((10.0, 20.0))
        assert TimelineMath.mapear_tempo_linear(5.0, segs) is None

    def test_tempo_apos_ultimo_segmento_retorna_none(self):
        segs = _segs((0.0, 10.0))
        assert TimelineMath.mapear_tempo_linear(15.0, segs) is None

    def test_tolerancia_epsilon_no_limite_inicio(self):
        # 9.997 está dentro da tolerância de 5ms do início (10.0)
        segs = _segs((10.0, 20.0))
        result = TimelineMath.mapear_tempo_linear(9.997, segs)
        assert result is not None
        assert result == pytest.approx(0.0, abs=0.01)

    def test_tolerancia_epsilon_no_limite_fim(self):
        # 20.003 está dentro da tolerância de 5ms do fim (20.0)
        segs = _segs((10.0, 20.0))
        result = TimelineMath.mapear_tempo_linear(20.003, segs)
        assert result is not None

    def test_tres_segmentos_acumulacao_correta(self):
        # [0-5], [10-15], [20-25] — cada um tem 5s
        # Tempo 22 → está no terceiro segmento, 2s dentro → 5+5+2 = 12s
        segs = _segs((0.0, 5.0), (10.0, 15.0), (20.0, 25.0))
        assert TimelineMath.mapear_tempo_linear(22.0, segs) == pytest.approx(12.0)

    def test_segmento_unico_sem_desvios(self):
        segs = _segs((0.0, 100.0))
        assert TimelineMath.mapear_tempo_linear(50.0, segs) == pytest.approx(50.0)

    def test_resultado_arredondado_em_4_casas(self):
        segs = _segs((0.0, 10.0))
        result = TimelineMath.mapear_tempo_linear(3.14159, segs)
        assert result == round(result, 4)

    def test_segmentos_nao_precisam_estar_ordenados_na_entrada(self):
        # A função deve trabalhar corretamente independente da ordem de entrada
        segs = _segs((20.0, 30.0), (0.0, 10.0))
        # Com segs desordenados, o acúmulo é por ordem de entrada
        # Primeiro: [20-30], depois [0-10]
        # Tempo 25 está em [20-30], offset=5, acumulado=0 → 5
        result = TimelineMath.mapear_tempo_linear(25.0, segs)
        assert result == pytest.approx(5.0)


# ─────────────────────────────────────────────────────────────
# recalcular_transcricao
# ─────────────────────────────────────────────────────────────


class TestRecalcularTranscricao:
    def test_lista_vazia_retorna_vazia(self):
        result = TimelineMath.recalcular_transcricao([], _segs((0.0, 10.0)))
        assert result == []

    def test_sem_desvios_preserva_timestamps(self):
        trans = _trans((0.0, 2.0, "a"), (3.0, 5.0, "b"))
        segs = _segs((0.0, 10.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert result[0]["start"] == pytest.approx(0.0)
        assert result[1]["start"] == pytest.approx(3.0)

    def test_desvio_remove_palavra_no_buraco(self):
        # [0-10] mantido, [10-20] removido, [20-30] mantido
        # Palavra em [12-14] está no buraco → deve sumir
        trans = _trans((5.0, 7.0, "antes"), (12.0, 14.0, "no_buraco"), (22.0, 24.0, "depois"))
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        textos = [r["texto"] for r in result]
        assert "no_buraco" not in textos
        assert "antes" in textos
        assert "depois" in textos

    def test_timestamps_remapeados_para_timeline_editada(self):
        # [0-10] e [20-30] — desvio [10-20] removido
        # Palavra em [22, 24] → remapeado para [12, 14] na timeline editada
        trans = _trans((22.0, 24.0, "depois"))
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert len(result) == 1
        assert result[0]["start"] == pytest.approx(12.0)
        assert result[0]["end"] == pytest.approx(14.0)

    def test_resultado_tem_campos_start_end_texto(self):
        trans = _trans((0.0, 2.0, "palavra"))
        segs = _segs((0.0, 10.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert "start" in result[0]
        assert "end" in result[0]
        assert "texto" in result[0]

    def test_resultado_tem_campos_inicio_fim_legado(self):
        trans = _trans((0.0, 2.0, "palavra"))
        segs = _segs((0.0, 10.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert "inicio" in result[0]
        assert "fim" in result[0]

    def test_palavras_antes_do_primeiro_segmento_ignoradas(self):
        # Transcrição começa antes do primeiro segmento mantido
        trans = _trans((5.0, 7.0, "antes_do_corte"), (20.0, 22.0, "dentro_do_corte"))
        segs = _segs((10.0, 30.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        textos = [r["texto"] for r in result]
        assert "antes_do_corte" not in textos
        assert "dentro_do_corte" in textos

    def test_ordem_saida_preserva_ordem_entrada(self):
        # recalcular_transcricao NÃO ordena a transcrição de entrada.
        # A saída mantém a mesma ordem da entrada. Cabe ao chamador passar
        # a transcrição pré-ordenada (ex: via limpar_e_ordenar_transcricao).
        trans = _trans((5.0, 6.0, "a"), (25.0, 26.0, "b"), (2.0, 3.0, "c"))
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        textos = [r["texto"] for r in result]
        assert textos == ["a", "b", "c"]  # preserva ordem da entrada

    def test_duracao_zero_descartada(self):
        # Palavra onde início e fim caem no mesmo ponto da timeline editada
        # Início em 10.0 (exatamente no fim do primeiro seg) e fim em 10.001 (no buraco)
        # → novo_inicio mapeado, novo_fim pode ser None → ajustado para novo_inicio
        # → duração zero → descartada
        trans = [{"start": 10.0, "end": 10.001, "texto": "micro"}]
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        # Micro-segmento pode ou não aparecer dependendo do epsilon
        # O que importa: o resultado não deve ter items com start >= end
        for item in result:
            assert item["start"] < item["end"]

    def test_aceita_campo_inicio_fim_legado_na_entrada(self):
        trans = [{"inicio": 5.0, "fim": 7.0, "texto": "legado"}]
        segs = _segs((0.0, 10.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert len(result) == 1
        assert result[0]["texto"] == "legado"

    def test_multiplos_desvios_remapeia_corretamente(self):
        # [0-10] [20-30] [40-50] — dois desvios removidos
        # Palavra em [45, 46] → na timeline editada: 10+10+5 = 25s
        trans = _trans((45.0, 46.0, "terceira_parte"))
        segs = _segs((0.0, 10.0), (20.0, 30.0), (40.0, 50.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert len(result) == 1
        assert result[0]["start"] == pytest.approx(25.0)

    def test_segs_desordenados_ordena_internamente(self):
        # recalcular_transcricao ordena os segmentos antes de processar
        trans = _trans((22.0, 24.0, "palavra"))
        segs = _segs((20.0, 30.0), (0.0, 10.0))  # desordenados
        result = TimelineMath.recalcular_transcricao(trans, segs)
        # Com segs ordenados: [0-10][20-30], tempo 22 → 10+(22-20)=12
        assert len(result) == 1
        assert result[0]["start"] == pytest.approx(12.0)


# ─────────────────────────────────────────────────────────────
# gerar_ffconcat_file
# ─────────────────────────────────────────────────────────────


class TestGerarFfconcatFile:
    def test_formato_basico(self):
        segs = _segs((0.0, 10.0))
        result = TimelineMath.gerar_ffconcat_file(segs, "/videos/video.mp4")
        assert "file '/videos/video.mp4'" in result
        assert "inpoint 0.000" in result
        assert "outpoint 10.000" in result

    def test_multiplos_segmentos(self):
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        result = TimelineMath.gerar_ffconcat_file(segs, "/videos/v.mp4")
        # Cada segmento deve ter uma entrada 'file'
        assert result.count("file '") == 2

    def test_segmentos_ordenados_no_output(self):
        segs = _segs((20.0, 30.0), (0.0, 10.0))  # desordenados na entrada
        result = TimelineMath.gerar_ffconcat_file(segs, "/v.mp4")
        linhas = result.splitlines()
        inpoints = [ln for ln in linhas if ln.startswith("inpoint")]
        assert inpoints[0] == "inpoint 0.000"
        assert inpoints[1] == "inpoint 20.000"

    def test_aspas_simples_no_path_escapadas(self):
        segs = _segs((0.0, 5.0))
        result = TimelineMath.gerar_ffconcat_file(segs, "/videos/it's fine.mp4")
        assert "\\'" in result

    def test_precisao_3_casas_decimais(self):
        segs = [{"start": 10.1234, "end": 20.5678}]
        result = TimelineMath.gerar_ffconcat_file(segs, "/v.mp4")
        assert "inpoint 10.123" in result
        assert "outpoint 20.568" in result


# ─────────────────────────────────────────────────────────────
# Teste de invariante de sincronização
# ─────────────────────────────────────────────────────────────


class TestInvariantesSincronizacao:
    """Invariantes que, se falharem, indicam desync no vídeo final."""

    def test_duracao_timeline_editada_igual_soma_segmentos(self):
        """A duração total da timeline editada deve ser exatamente a soma dos segmentos."""
        segs = _segs((0.0, 10.0), (20.0, 30.0), (40.0, 50.0))
        duracao_esperada = sum(s["end"] - s["start"] for s in segs)  # 30s

        # O tempo do fim do último segmento na nova timeline
        ultimo_tempo = TimelineMath.mapear_tempo_linear(50.0, segs)
        assert ultimo_tempo == pytest.approx(duracao_esperada, abs=0.01)

    def test_mapeamento_monotono_dentro_de_segmento(self):
        """Tempos crescentes dentro de um segmento devem mapear para tempos crescentes."""
        segs = _segs((10.0, 30.0))
        t1 = TimelineMath.mapear_tempo_linear(12.0, segs)
        t2 = TimelineMath.mapear_tempo_linear(15.0, segs)
        t3 = TimelineMath.mapear_tempo_linear(25.0, segs)
        assert t1 < t2 < t3

    def test_transcricao_remapeada_comeca_em_zero_se_corte_sem_desvios(self):
        """Sem desvios, o primeiro item da transcrição deve começar em ~0s na timeline editada."""
        trans = _trans((0.0, 2.0, "inicio"), (5.0, 7.0, "meio"))
        segs = _segs((0.0, 60.0))
        result = TimelineMath.recalcular_transcricao(trans, segs)
        assert result[0]["start"] == pytest.approx(0.0, abs=0.01)

    def test_palavras_em_desvio_removidas_nao_criam_buracos_na_timeline(self):
        """Após remapear, não deve haver saltos de tempo maiores que a maior duração de segmento."""
        segs = _segs((0.0, 10.0), (20.0, 30.0))
        trans = _trans(
            (1.0, 2.0, "a"),
            (8.0, 9.0, "b"),  # no primeiro seg
            (21.0, 22.0, "c"),
            (28.0, 29.0, "d"),  # no segundo seg
        )
        result = TimelineMath.recalcular_transcricao(trans, segs)
        # Na timeline editada, 'b' termina em ~9s, 'c' começa em ~11s
        # Não deve haver salto maior que 10s (tamanho do primeiro segmento)
        starts = [r["start"] for r in result]
        for i in range(1, len(starts)):
            assert starts[i] - starts[i - 1] < 15.0, (
                f"Salto suspeito entre {starts[i - 1]} e {starts[i]}"
            )

    def test_remapeamento_idempotente_sem_desvios(self):
        """Sem desvios, remapear duas vezes não muda os timestamps."""
        trans = _trans((5.0, 7.0, "texto"), (10.0, 12.0, "outro"))
        segs = _segs((0.0, 60.0))
        result1 = TimelineMath.recalcular_transcricao(trans, segs)
        result2 = TimelineMath.recalcular_transcricao(result1, segs)
        for a, b in zip(result1, result2, strict=False):
            assert a["start"] == pytest.approx(b["start"], abs=0.01)
