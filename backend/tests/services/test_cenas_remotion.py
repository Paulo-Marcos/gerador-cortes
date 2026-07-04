"""Testes para CenasRemotionService — métodos estáticos puros.

_resolver_startleg e _converter_startleg são o pivô da sincronização
cena↔vídeo. Um erro aqui coloca TODAS as cenas nas posições erradas.

Nota: importar_cenas e montar_prompt requerem banco — são testados
com AsyncMock para verificar a consistência dos índices de granularização.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.services.cenas_remotion import CenasRemotionService, _calcular_limites

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _trans(*items):
    return [{"start": s, "end": e, "texto": t} for s, e, t in items]


def _trans_longa(n=20, duracao_por_seg=3.0):
    """Transcrição com n segmentos de duracao_por_seg segundos cada."""
    return [
        {"start": i * duracao_por_seg, "end": (i + 1) * duracao_por_seg, "texto": f"palavra{i}"}
        for i in range(n)
    ]


def _mock_corte(transcricao_final=None, cenas_remotion=None):
    corte = MagicMock()
    corte.id = "test-corte-id"
    corte.titulo_proposto = "Título de Teste"
    corte.tema_central = "tema"
    corte.resumo = "resumo"
    corte.transcricao_final = json.dumps(transcricao_final or [])
    corte.cenas_remotion = json.dumps(cenas_remotion) if cenas_remotion else None
    return corte


def _mock_db_ctx(corte):
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=corte)
    mock_db.commit = AsyncMock()
    mock_ctx = MagicMock()
    mock_ctx.__aenter__ = AsyncMock(return_value=mock_db)
    mock_ctx.__aexit__ = AsyncMock(return_value=None)
    return mock_ctx, mock_db


# ─────────────────────────────────────────────────────────────
# _calcular_limites
# ─────────────────────────────────────────────────────────────


class TestCalcularLimites:
    def test_video_curto_retorna_minimo_cenas(self):
        result = _calcular_limites(30)  # 30s
        assert result["max_cenas"] >= 2

    def test_video_de_5_min_retorna_pelo_menos_4_cenas(self):
        result = _calcular_limites(300)  # 5min
        assert result["max_cenas"] >= 4

    def test_teto_absoluto_40_cenas(self):
        result = _calcular_limites(10000)  # ~2.7h
        assert result["max_cenas"] <= 40

    def test_max_identidade_menor_que_max_cenas(self):
        result = _calcular_limites(600)
        assert result["max_identidade"] < result["max_cenas"]

    def test_max_fullscreen_menor_que_max_identidade(self):
        result = _calcular_limites(600)
        assert result["max_fullscreen"] <= result["max_identidade"]

    def test_hook_obrigatorio_em_video_longo(self):
        result = _calcular_limites(600)
        assert result["min_primeiros_15s"] >= 1

    def test_duracao_zero_nao_explode(self):
        result = _calcular_limites(0)
        assert result["max_cenas"] >= 2

    @pytest.mark.parametrize("duracao", [60, 300, 600, 1800, 3600])
    def test_todos_campos_presentes(self, duracao):
        result = _calcular_limites(duracao)
        assert "max_cenas" in result
        assert "max_identidade" in result
        assert "max_fullscreen" in result
        assert "min_primeiros_15s" in result


# ─────────────────────────────────────────────────────────────
# _get_granular
# ─────────────────────────────────────────────────────────────


class TestGetGranular:
    def test_lista_vazia_retorna_vazia(self):
        result = CenasRemotionService._get_granular([])
        assert result == []

    def test_atribui_global_index(self):
        trans = _trans((0.0, 2.0, "a"), (3.0, 5.0, "b"))
        result = CenasRemotionService._get_granular(trans)
        assert all("global_index" in item for item in result)

    def test_indices_sao_sequenciais_e_unicos(self):
        trans = _trans_longa(10)
        result = CenasRemotionService._get_granular(trans)
        indices = [item["global_index"] for item in result]
        assert indices == list(range(len(result)))

    def test_determinismo_na_mesma_entrada(self):
        """CRÍTICO: mesmo input → mesmo output. Se não for determinístico,
        os índices entre montar_prompt e importar_cenas divergem."""
        trans = _trans_longa(15)
        result1 = CenasRemotionService._get_granular(trans)
        result2 = CenasRemotionService._get_granular(trans)
        indices1 = [i["global_index"] for i in result1]
        indices2 = [i["global_index"] for i in result2]
        assert indices1 == indices2

    def test_segmentos_longos_sao_divididos(self):
        # Segmento de 20s com muitas palavras deve ser dividido
        trans = [{"start": 0.0, "end": 20.0, "texto": "a b c d e f g h i j k l m n o p q r s t"}]
        result = CenasRemotionService._get_granular(trans)
        assert len(result) > 1

    def test_global_index_comeca_em_zero(self):
        trans = _trans((5.0, 7.0, "primeiro"))
        result = CenasRemotionService._get_granular(trans)
        assert result[0]["global_index"] == 0

    def test_granularidade_preserva_timestamps_aproximados(self):
        trans = _trans((0.0, 10.0, "texto longo aqui"), (15.0, 20.0, "outro"))
        result = CenasRemotionService._get_granular(trans)
        # O primeiro segmento deve iniciar em ~0s
        assert result[0]["start"] == pytest.approx(0.0, abs=0.1)


# ─────────────────────────────────────────────────────────────
# _montar_legendas_numeradas
# ─────────────────────────────────────────────────────────────


class TestMontarLegendasNumeradas:
    def test_formato_basico(self):
        trans = [{"start": 0.0, "end": 2.0, "texto": "Olá mundo", "global_index": 0}]
        result = CenasRemotionService._montar_legendas_numeradas(trans)
        assert "[0]" in result
        assert "Olá mundo" in result

    def test_usa_global_index_nao_posicao_local(self):
        # Se o chunk começa no item 50, o índice deve ser 50, não 0
        trans = [
            {"start": 100.0, "end": 102.0, "texto": "meio do video", "global_index": 50},
            {"start": 103.0, "end": 105.0, "texto": "continuacao", "global_index": 51},
        ]
        result = CenasRemotionService._montar_legendas_numeradas(trans)
        assert "[50]" in result
        assert "[51]" in result
        assert "[0]" not in result

    def test_timestamp_hms_no_formato(self):
        trans = [{"start": 65.0, "end": 67.0, "texto": "um minuto", "global_index": 5}]
        result = CenasRemotionService._montar_legendas_numeradas(trans)
        assert "01:05" in result  # HH:MM:SS para 65s

    def test_item_sem_texto_ignorado(self):
        trans = [
            {"start": 0.0, "end": 2.0, "texto": "", "global_index": 0},
            {"start": 3.0, "end": 5.0, "texto": "com texto", "global_index": 1},
        ]
        result = CenasRemotionService._montar_legendas_numeradas(trans)
        assert "[0]" not in result
        assert "[1]" in result

    def test_cada_item_em_linha_separada(self):
        trans = [
            {"start": 0.0, "end": 2.0, "texto": "a", "global_index": 0},
            {"start": 3.0, "end": 5.0, "texto": "b", "global_index": 1},
        ]
        result = CenasRemotionService._montar_legendas_numeradas(trans)
        linhas = result.strip().splitlines()
        assert len(linhas) == 2


# ─────────────────────────────────────────────────────────────
# _resolver_startleg — FUNÇÃO MAIS CRÍTICA PARA SINCRONIZAÇÃO
# ─────────────────────────────────────────────────────────────


class TestResolverStartleg:
    def test_indice_valido_retorna_tempo_do_item(self):
        trans = [
            {"start": 10.0, "end": 12.0, "global_index": 0},
            {"start": 15.0, "end": 17.0, "global_index": 1},
            {"start": 20.0, "end": 22.0, "global_index": 2},
        ]
        assert CenasRemotionService._resolver_startleg(1, trans) == pytest.approx(15.0)

    def test_indice_zero(self):
        trans = [{"start": 5.0, "end": 7.0, "global_index": 0}]
        assert CenasRemotionService._resolver_startleg(0, trans) == pytest.approx(5.0)

    def test_indice_negativo_nao_explode(self):
        # Índice negativo -> Python aceita como índice reverso da lista
        # _resolver_startleg faz `if start_leg < len(transcricao)` — índice negativo satisfaz isso
        trans = [{"start": 5.0, "end": 7.0}, {"start": 10.0, "end": 12.0}]
        # Não deve explodir
        result = CenasRemotionService._resolver_startleg(-1, trans)
        assert isinstance(result, float)

    def test_indice_fora_do_range_fallback_para_tempo_mais_proximo(self):
        # startLeg=1000 enquanto transcrição tem 10 items
        # Fallback: trata como tempo em segundos, busca item mais próximo de 1000s
        trans = [
            {"start": float(i * 10), "end": float(i * 10 + 5), "global_index": i} for i in range(10)
        ]  # tempos de 0s a 90s
        result = CenasRemotionService._resolver_startleg(1000, trans)
        # Deve retornar o tempo do item mais próximo de 1000s → último item (90s)
        assert result == pytest.approx(90.0, abs=1.0)

    def test_transcricao_vazia_retorna_zero(self):
        assert CenasRemotionService._resolver_startleg(5, []) == 0.0

    def test_startleg_como_float_truncado_para_int(self):
        # A chamada real faz int(start_leg), então 42.9 → 42
        trans = [{"start": float(i), "end": float(i + 1), "global_index": i} for i in range(50)]
        result = CenasRemotionService._resolver_startleg(int(42.9), trans)
        assert result == pytest.approx(42.0)

    def test_aceita_campo_inicio_legado(self):
        trans = [{"inicio": 30.0, "fim": 32.0}]
        result = CenasRemotionService._resolver_startleg(0, trans)
        assert result == pytest.approx(30.0)

    def test_indice_no_limite_exato_len_minus_1(self):
        trans = [{"start": float(i), "end": float(i + 1)} for i in range(5)]
        result = CenasRemotionService._resolver_startleg(4, trans)
        assert result == pytest.approx(4.0)

    def test_indice_igual_a_len_usa_fallback(self):
        # startLeg == len(trans) → out of bounds → fallback por tempo
        trans = [{"start": float(i), "end": float(i + 1)} for i in range(5)]
        # start_leg=5 == len=5, não entra no if start_leg < len(transcricao)
        # Trata 5 como segundos, busca item mais próximo de 5s → último item em 4s
        result = CenasRemotionService._resolver_startleg(5, trans)
        assert isinstance(result, float)


# ─────────────────────────────────────────────────────────────
# _converter_startleg
# ─────────────────────────────────────────────────────────────


class TestConverterStartleg:
    def _trans_granular(self, n=20):
        return [
            {"start": float(i * 3), "end": float(i * 3 + 2), "texto": f"t{i}", "global_index": i}
            for i in range(n)
        ]

    def test_lista_vazia_retorna_vazia(self):
        result = CenasRemotionService._converter_startleg([], self._trans_granular())
        assert result == []

    def test_cena_simples_convertida(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "barra_inferior", "startLeg": 2, "duracao_s": 4, "texto": "Teste"}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert len(result) == 1
        assert result[0]["tipo"] == "barra_inferior"
        assert result[0]["inicio"] == pytest.approx(6.0)  # item[2].start = 2*3 = 6
        assert result[0]["fim"] == pytest.approx(10.0)  # 6 + 4

    def test_inicio_calculado_de_startleg(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "card_informacao", "startLeg": 5, "duracao_s": 5}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["inicio"] == pytest.approx(15.0)  # item[5].start = 5*3 = 15

    def test_fim_e_inicio_mais_duracao(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "card_informacao", "startLeg": 3, "duracao_s": 6}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["fim"] == pytest.approx(result[0]["inicio"] + 6)

    def test_campos_opcionais_copiados(self):
        trans = self._trans_granular()
        cenas = [
            {
                "tipo": "ficha_biografica",
                "startLeg": 0,
                "duracao_s": 5,
                "texto": "Johann Wolfgang von Goethe",
                "nome_curto": "Johann W. Goethe",
                "subtexto": "1749-1832",
            }
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["texto"] == "Johann Wolfgang von Goethe"
        assert result[0]["nome_curto"] == "Johann W. Goethe"
        assert result[0]["subtexto"] == "1749-1832"

    def test_normaliza_alias_nome_curto_da_ficha_biografica(self):
        trans = self._trans_granular()
        cenas = [
            {
                "tipo": "ficha_biografica",
                "startLeg": 0,
                "duracao_s": 5,
                "texto": "Georg Wilhelm Friedrich Hegel",
                "nome_exibicao": "G. W. F. Hegel",
            }
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["nome_curto"] == "G. W. F. Hegel"

    def test_preserva_retrato_url_importado(self):
        trans = self._trans_granular()
        cenas = [
            {
                "tipo": "ficha_biografica",
                "startLeg": 0,
                "duracao_s": 5,
                "texto": "Friedrich Nietzsche",
                "retrato_url": "https://example.test/nietzsche.jpg",
            }
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["retrato_url"] == "https://example.test/nietzsche.jpg"

    def test_preserva_rotulos_do_comparativo_contraponto(self):
        trans = self._trans_granular()
        cenas = [
            {
                "tipo": "comparativo_contraponto",
                "startLeg": 0,
                "duracao_s": 5,
                "texto": "MATERIALISMO",
                "subtexto": "IDEALISMO",
                "rotuloA": "TESE MATERIAL",
                "rotuloB": "TESE IDEAL",
                "contexto": "EIXO FILOSOFICO",
            }
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["tipo"] == "comparativo_contraponto"
        assert result[0]["rotuloA"] == "TESE MATERIAL"
        assert result[0]["rotuloB"] == "TESE IDEAL"
        assert result[0]["contexto"] == "EIXO FILOSOFICO"

    def test_mascot_mood_copiado(self):
        trans = self._trans_granular()
        cenas = [
            {"tipo": "card_informacao", "startLeg": 0, "duracao_s": 5, "mascotMood": "investigador"}
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["mascotMood"] == "investigador"

    def test_mascot_mood_back_compat_chave_legada_sapo(self):
        # D-186: IA/canais legados emitem sapoMood; a escrita normaliza para mascotMood
        # e não deixa a chave legada vazar para o banco.
        trans = self._trans_granular()
        cenas = [
            {"tipo": "card_informacao", "startLeg": 0, "duracao_s": 5, "sapoMood": "investigador"}
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["mascotMood"] == "investigador"
        assert "sapoMood" not in result[0]

    def test_multiplas_cenas_ordenadas_por_inicio(self):
        trans = self._trans_granular(20)
        cenas = [
            {"tipo": "card_informacao", "startLeg": 10, "duracao_s": 4},
            {"tipo": "barra_inferior", "startLeg": 3, "duracao_s": 4},
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["inicio"] < result[1]["inicio"]

    def test_normaliza_destaque_numerico_alias_valor(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "destaque_numerico", "startLeg": 0, "duracao_s": 4, "valor": "1789"}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert "numero" in result[0]

    def test_normaliza_fonte_referencia_alias(self):
        trans = self._trans_granular()
        cenas = [
            {"tipo": "fonte_referencia", "startLeg": 0, "duracao_s": 3, "referencia": "Wikipedia"}
        ]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0].get("fonte") == "Wikipedia"

    def test_normaliza_chamada_final_alias_titulo(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "chamada_final", "startLeg": 0, "duracao_s": 5, "titulo": "Inscreva-se"}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0].get("texto") == "Inscreva-se"

    def test_normaliza_marco_historico_alias_evento(self):
        trans = self._trans_granular()
        cenas = [{"tipo": "marco_historico", "startLeg": 0, "duracao_s": 5, "evento": "Revolução"}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0].get("texto") == "Revolução"

    def test_campo_marcos_lista_copiado(self):
        trans = self._trans_granular()
        marcos = [{"data": "1789", "titulo": "Rev. Francesa"}]
        cenas = [{"tipo": "linha_tempo", "startLeg": 0, "duracao_s": 5, "marcos": marcos}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["marcos"] == marcos

    def test_inicio_arredondado_em_2_casas(self):
        trans = [{"start": 1.23456, "end": 3.0, "global_index": 0}]
        cenas = [{"tipo": "card_informacao", "startLeg": 0, "duracao_s": 5}]
        result = CenasRemotionService._converter_startleg(cenas, trans)
        assert result[0]["inicio"] == round(result[0]["inicio"], 2)


# ─────────────────────────────────────────────────────────────
# Teste de invariante: índices de granularização são estáveis
# ─────────────────────────────────────────────────────────────


class TestPreencherRetratos:
    @pytest.mark.asyncio
    async def test_preenche_retrato_em_ficha_biografica(self):
        cenas = [
            {"tipo": "ficha_biografica", "texto": "Friedrich Nietzsche"},
            {"tipo": "card_informacao", "texto": "Niilismo"},
        ]
        retrato = SimpleNamespace(url_publica="/api/retratos/friedrich_nietzsche")

        with patch(
            "app.services.cenas_remotion.retrato_wikipedia.buscar_wikipedia",
            new=AsyncMock(return_value=retrato),
        ) as buscar:
            stats = await CenasRemotionService._preencher_retratos_cenas(cenas)

        buscar.assert_awaited_once()
        assert cenas[0]["retrato_url"] == "http://localhost:8000/api/retratos/friedrich_nietzsche"
        assert stats["total_fichas"] == 1
        assert stats["atualizados"] == 1

    @pytest.mark.asyncio
    async def test_mantem_retrato_existente_sem_forcar(self):
        cenas = [
            {
                "tipo": "ficha_biografica",
                "texto": "Friedrich Nietzsche",
                "retrato_url": "https://example.test/nietzsche.jpg",
            }
        ]

        with patch(
            "app.services.cenas_remotion.retrato_wikipedia.buscar_wikipedia",
            new=AsyncMock(),
        ) as buscar:
            stats = await CenasRemotionService._preencher_retratos_cenas(cenas)

        buscar.assert_not_awaited()
        assert cenas[0]["retrato_url"] == "https://example.test/nietzsche.jpg"
        assert stats["ja_tinham"] == 1
        assert stats["atualizados"] == 0

    @pytest.mark.asyncio
    async def test_normaliza_retrato_relativo_existente(self):
        cenas = [
            {
                "tipo": "ficha_biografica",
                "texto": "Friedrich Nietzsche",
                "retrato_url": "/api/retratos/friedrich_nietzsche",
            }
        ]

        stats = await CenasRemotionService._preencher_retratos_cenas(cenas)

        assert cenas[0]["retrato_url"] == "http://localhost:8000/api/retratos/friedrich_nietzsche"
        assert stats["ja_tinham"] == 1
        assert stats["atualizados"] == 1


class TestInvarianteIndicesGranularizacao:
    """Verifica que os índices gerados em montar_prompt e importar_cenas são idênticos.

    Esta é a invariante de sincronização mais crítica do sistema de cenas.
    Se _get_granular(transcricao_final) retornar índices diferentes entre as
    duas chamadas, TODAS as cenas vão para posições erradas no vídeo.
    """

    def test_mesma_transcricao_mesmos_indices(self):
        trans = _trans_longa(30)
        g1 = CenasRemotionService._get_granular(trans)
        g2 = CenasRemotionService._get_granular(trans)
        assert [i["global_index"] for i in g1] == [i["global_index"] for i in g2]

    def test_mesma_transcricao_mesmos_timestamps(self):
        trans = _trans_longa(20)
        g1 = CenasRemotionService._get_granular(trans)
        g2 = CenasRemotionService._get_granular(trans)
        starts1 = [round(i["start"], 3) for i in g1]
        starts2 = [round(i["start"], 3) for i in g2]
        assert starts1 == starts2

    def test_startleg_resolve_para_mesmo_tempo_em_ambas_chamadas(self):
        """Simula o fluxo real: montar_prompt e importar_cenas usam _get_granular separadamente.
        O startLeg=10 deve mapear para o MESMO timestamp em ambas as chamadas."""
        trans = _trans_longa(30)
        START_LEG = 10

        granular_prompt = CenasRemotionService._get_granular(trans)
        tempo_prompt = CenasRemotionService._resolver_startleg(START_LEG, granular_prompt)

        granular_import = CenasRemotionService._get_granular(trans)
        tempo_import = CenasRemotionService._resolver_startleg(START_LEG, granular_import)

        assert tempo_prompt == pytest.approx(tempo_import, abs=0.001), (
            f"DESYNC: startLeg={START_LEG} mapeia para {tempo_prompt}s em prompt, mas {tempo_import}s em importar_cenas"
        )

    def test_transcricao_com_segmentos_longos_indices_coerentes(self):
        """Segmentos longos são divididos, mas os índices globais devem ser contíguos."""
        trans = [
            {"start": 0.0, "end": 30.0, "texto": " ".join([f"p{i}" for i in range(30)])},
            {"start": 35.0, "end": 40.0, "texto": "curto"},
        ]
        result = CenasRemotionService._get_granular(trans)
        indices = [item["global_index"] for item in result]
        assert indices == list(range(len(result)))

    @pytest.mark.asyncio
    async def test_montar_prompt_retorna_prompt_agregado_corte_curto(self):
        """Corte curto (1 chunk) → prompt agregado igual ao único prompts[0].texto."""
        trans = _trans_longa(n=10, duracao_por_seg=3.0)  # ~30s, bem abaixo do chunk de 900s
        corte = _mock_corte(transcricao_final=trans)
        mock_ctx, _ = _mock_db_ctx(corte)

        with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=mock_ctx):
            result = await CenasRemotionService.montar_prompt("test-id")

        assert isinstance(result["prompt"], str) and result["prompt"]
        assert len(result["prompts"]) == 1
        assert result["prompt"] == result["prompts"][0]["texto"]
        assert "========== PRÓXIMA PARTE ==========" not in result["prompt"]
        assert "formato_esperado" in result

    @pytest.mark.asyncio
    async def test_montar_prompt_concatena_partes_corte_longo(self):
        """Corte longo (>15min) → múltiplas partes com separador entre elas."""
        # 25 minutos a 3s por segmento → 500 segmentos cobrindo 1500s (>900s = multi-chunk)
        trans = _trans_longa(n=500, duracao_por_seg=3.0)
        corte = _mock_corte(transcricao_final=trans)
        mock_ctx, _ = _mock_db_ctx(corte)

        with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=mock_ctx):
            result = await CenasRemotionService.montar_prompt("test-id")

        assert len(result["prompts"]) > 1, "transcrição longa deveria gerar múltiplos chunks"
        separador = "========== PRÓXIMA PARTE =========="
        assert result["prompt"].count(separador) == len(result["prompts"]) - 1
        for parte in result["prompts"]:
            assert parte["texto"] in result["prompt"]

    @pytest.mark.asyncio
    async def test_montar_prompt_mantem_formato_esperado(self):
        """Não-regressão: o frontend Angular legado depende de `formato_esperado` e `prompts`."""
        trans = _trans_longa(n=10)
        corte = _mock_corte(transcricao_final=trans)
        mock_ctx, _ = _mock_db_ctx(corte)

        with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=mock_ctx):
            result = await CenasRemotionService.montar_prompt("test-id")

        assert "prompts" in result
        assert "formato_esperado" in result
        assert result["formato_esperado"]["formato"] == "vlog_analitico"
        assert isinstance(result["formato_esperado"]["cenas"], list)

    @pytest.mark.asyncio
    async def test_prompt_separa_comparativo_de_enfase(self):
        trans = _trans_longa(n=10)
        corte = _mock_corte(transcricao_final=trans)
        mock_ctx, _ = _mock_db_ctx(corte)

        with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=mock_ctx):
            result = await CenasRemotionService.montar_prompt("test-id")

        prompt = result["prompt"]
        # Invariante ESTRUTURAL (independente da prosa editorial customizável):
        # `comparativo_contraponto` e `enfase` são tipos de cena SEPARADOS.
        assert "comparativo_contraponto" in prompt
        assert "- enfase" in prompt
        assert "rotuloA" in prompt
        assert "rotuloB" in prompt
        assert "nome_curto" in prompt
        # Não-regressão: o nome LEGADO/merged `comparativo_enfase` não deve
        # reaparecer como tipo. Se alguém reintroduzi-lo no editorial, falha aqui.
        assert "comparativo_enfase" not in prompt, (
            "tipo merged legado 'comparativo_enfase' reapareceu no prompt; "
            "use os tipos separados 'comparativo_contraponto' + 'enfase'"
        )

    @pytest.mark.asyncio
    async def test_importar_cenas_usa_mesma_granularizacao_que_prompt(self):
        """Verifica que importar_cenas resolve startLeg consistentemente com o que
        seria gerado em montar_prompt, dado o mesmo transcricao_final."""
        trans = _trans_longa(30)
        corte = _mock_corte(transcricao_final=trans)
        mock_ctx, mock_db = _mock_db_ctx(corte)

        # Simula a IA retornando startLeg=8 → deve mapear para o mesmo tempo
        # que _get_granular produz para o índice 8
        granular_esperado = CenasRemotionService._get_granular(trans)
        tempo_esperado = CenasRemotionService._resolver_startleg(8, granular_esperado)

        payload = {"cenas": [{"tipo": "card_informacao", "startLeg": 8, "duracao_s": 5}]}

        with patch("app.services.cenas_remotion.AsyncSessionLocal", return_value=mock_ctx):
            result = await CenasRemotionService.importar_cenas("test-id", payload)

        cenas_salvas = result["cenas"]
        assert len(cenas_salvas) == 1
        assert cenas_salvas[0]["inicio"] == pytest.approx(tempo_esperado, abs=0.01), (
            f"DESYNC: esperado {tempo_esperado}s, obtido {cenas_salvas[0]['inicio']}s"
        )
