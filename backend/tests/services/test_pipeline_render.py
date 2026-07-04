"""Testes para as funções puras de pipeline_render.py.

Cobertas aqui: _agrupar_overlay_chunks, _criar_overlay_chunk,
_deve_pular_fase, _extrair_cenas, _arquivo_minimo,
_build_overlay_render_cmd, _aguardar_cooldown.

Funções com I/O (ffprobe, asyncio, worker) não são testadas aqui —
precisariam de integração ou mocks de subprocess.
"""

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from app.domain.overlay_codec import OverlayCodec, overlay_codec_profile
from app.domain.overlay_metadata import OverlayEntry
from app.domain.retry_policy import RetryPolicy
from app.services.pipeline_render import (
    _agrupar_overlay_chunks,
    _aguardar_cooldown,
    _arquivo_minimo,
    _build_overlay_render_cmd,
    _construir_cenas_chunk_relativas,
    _criar_overlay_chunk,
    _deve_limpar_artefatos,
    _deve_pular_fase,
    _extrair_cenas,
    _filtrar_chunks_pendentes,
    _find_clip_raw,
    _limpar_a_partir_de,
    _localizar_overlay_existente,
    _mensagem_falha_total_overlays,
    _normalizar_fase_alias,
    _render_retry_policy,
    _resolver_overlays_para_composicao,
    _retry_async,
    _validar_video_completo,
    _assets_servidos_do_bundle,
    _validar_video_completo_sync,
)
from app.domain.remotion_bundle import compute_src_fingerprint

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────


def _entry(
    start: float,
    end: float,
    tipo: str = "card_informacao",
    id_: str = "001",
    cena_dict_extras: dict | None = None,
) -> OverlayEntry:
    cena_dict = {"tipo": tipo, "inicio": start, "fim": end}
    if cena_dict_extras:
        cena_dict.update(cena_dict_extras)
    return OverlayEntry(
        id=id_,
        start_sec=start,
        end_sec=end,
        tipo=tipo,
        cena_dict=cena_dict,
    )


def _mock_corte(cenas_remotion=None):
    corte = MagicMock()
    corte.cenas_remotion = cenas_remotion
    return corte


# ─────────────────────────────────────────────────────────────
# _criar_overlay_chunk
# ─────────────────────────────────────────────────────────────


class TestCriarOverlayChunk:
    def test_id_formatado_com_zero_padding(self):
        chunk = _criar_overlay_chunk(1, [_entry(0.0, 5.0)])
        assert chunk["id"] == "001"

    def test_id_segundo_chunk(self):
        chunk = _criar_overlay_chunk(2, [_entry(0.0, 5.0)])
        assert chunk["id"] == "002"

    def test_start_sec_menor_das_entries(self):
        entries = [_entry(5.0, 10.0), _entry(2.0, 4.0), _entry(8.0, 12.0)]
        chunk = _criar_overlay_chunk(1, entries)
        assert chunk["start_sec"] == pytest.approx(2.0)

    def test_end_sec_maior_das_entries(self):
        entries = [_entry(5.0, 10.0), _entry(2.0, 4.0), _entry(8.0, 15.0)]
        chunk = _criar_overlay_chunk(1, entries)
        assert chunk["end_sec"] == pytest.approx(15.0)

    def test_entries_preservadas(self):
        entries = [_entry(0.0, 5.0, id_="aaa"), _entry(6.0, 8.0, id_="bbb")]
        chunk = _criar_overlay_chunk(1, entries)
        assert chunk["entries"] is entries

    def test_chunk_unico_entry(self):
        entry = _entry(10.0, 15.0)
        chunk = _criar_overlay_chunk(1, [entry])
        assert chunk["start_sec"] == pytest.approx(10.0)
        assert chunk["end_sec"] == pytest.approx(15.0)


# ─────────────────────────────────────────────────────────────
# _agrupar_overlay_chunks
# ─────────────────────────────────────────────────────────────


class TestAgruparOverlayChunks:
    def test_lista_vazia_retorna_vazia(self):
        assert _agrupar_overlay_chunks([]) == []

    def test_entrada_unica_gera_um_chunk(self):
        result = _agrupar_overlay_chunks([_entry(0.0, 5.0)])
        assert len(result) == 1

    def test_duas_entradas_proximas_ficam_no_mesmo_chunk(self):
        # gap de 2s — abaixo do limite de 8s
        entries = [_entry(0.0, 5.0), _entry(7.0, 10.0)]
        result = _agrupar_overlay_chunks(entries)
        assert len(result) == 1

    def test_gap_maior_que_limite_separa_chunks(self):
        # gap de 20s — acima do limite de 8s
        entries = [_entry(0.0, 5.0), _entry(25.0, 30.0)]
        result = _agrupar_overlay_chunks(entries)
        assert len(result) == 2

    def test_duracao_chunk_acima_de_30s_separa(self):
        # Se a duração total ultrapassar 30s, deve criar novo chunk
        # entry1: 0→5, entry2: 6→11, entry3: 12→17, entry4: 18→23, entry5: 24→29, entry6: 30→36
        # would_duration de entry6 = 36 - 0 = 36 > 30
        entries = [_entry(float(i * 6), float(i * 6 + 5)) for i in range(7)]
        result = _agrupar_overlay_chunks(entries)
        assert len(result) >= 2

    def test_ids_sao_sequenciais(self):
        entries = [_entry(0.0, 5.0), _entry(25.0, 30.0), _entry(50.0, 55.0)]
        result = _agrupar_overlay_chunks(entries)
        ids = [c["id"] for c in result]
        assert ids == [f"{i + 1:03d}" for i in range(len(ids))]

    def test_chunk_contem_entries_corretas(self):
        e1 = _entry(0.0, 5.0, id_="aaa")
        e2 = _entry(30.0, 35.0, id_="bbb")  # gap > 8s — chunk separado
        result = _agrupar_overlay_chunks([e1, e2])
        assert len(result[0]["entries"]) == 1
        assert result[0]["entries"][0].id == "aaa"
        assert result[1]["entries"][0].id == "bbb"

    def test_start_sec_do_chunk_igual_ao_menor_start(self):
        entries = [_entry(5.0, 10.0), _entry(12.0, 15.0)]
        result = _agrupar_overlay_chunks(entries)
        assert result[0]["start_sec"] == pytest.approx(5.0)

    def test_end_sec_do_chunk_igual_ao_maior_end(self):
        entries = [_entry(5.0, 10.0), _entry(12.0, 18.0)]
        result = _agrupar_overlay_chunks(entries)
        assert result[0]["end_sec"] == pytest.approx(18.0)


# ─────────────────────────────────────────────────────────────
# _construir_cenas_chunk_relativas — regressão do bug do <Sequence>
# ─────────────────────────────────────────────────────────────


class TestConstruirCenasChunkRelativas:
    """Regressão: o `normalizarCenaRemotion` em video-renderer/src/schema.ts
    prefere `inicio_seg`/`fim_seg` sobre `inicio`/`fim`. Se o pipeline mandar
    cenas com `inicio`/`fim` relativos ao chunk mas mantiver `inicio_seg`/
    `fim_seg` absolutos do banco, o `<Sequence>` na composição Remotion fica
    posicionado em frames fora do chunk: o primeiro chunk renderiza com
    atraso (cenas aparecem só depois do `inicio_seg` em segundos) e chunks
    subsequentes ficam completamente vazios. A função deve reescrever AS
    QUATRO chaves de timing para coordenadas relativas ao chunk.
    """

    def test_lista_vazia_retorna_vazia(self):
        assert _construir_cenas_chunk_relativas(0.0, []) == []

    def test_chunk_em_zero_mantem_timings_absolutos(self):
        # chunk_start=0 → relativo = absoluto
        entries = [_entry(0.0, 5.0, cena_dict_extras={"inicio_seg": 0.0, "fim_seg": 5.0})]
        cenas = _construir_cenas_chunk_relativas(0.0, entries)
        assert cenas[0]["inicio"] == pytest.approx(0.0)
        assert cenas[0]["fim"] == pytest.approx(5.0)

    def test_chunk_tardio_subtrai_offset_em_inicio_e_fim(self):
        # entry: 50→55s; chunk_start=50 → relativo (0, 5)
        entries = [_entry(50.0, 55.0)]
        cenas = _construir_cenas_chunk_relativas(50.0, entries)
        assert cenas[0]["inicio"] == pytest.approx(0.0)
        assert cenas[0]["fim"] == pytest.approx(5.0)

    def test_sobrescreve_inicio_seg_e_fim_seg_absolutos_do_banco(self):
        """O bug original: a cena vinha do banco com `inicio_seg=50` e
        `fim_seg=55` (absolutos). A função tem que reescrever ESSES
        campos também, não só `inicio`/`fim`. Caso contrário o schema
        Zod prefere o `_seg` absoluto e o `<Sequence>` é posicionado
        no frame errado.
        """
        entries = [
            _entry(
                50.0,
                55.0,
                cena_dict_extras={"inicio_seg": 50.0, "fim_seg": 55.0},
            )
        ]
        cenas = _construir_cenas_chunk_relativas(50.0, entries)
        assert cenas[0]["inicio_seg"] == pytest.approx(0.0), (
            "inicio_seg precisa virar relativo — senão o Zod do Remotion "
            "vai preferi-lo sobre `inicio` e posicionar a Sequence em frame "
            "absoluto."
        )
        assert cenas[0]["fim_seg"] == pytest.approx(5.0)

    def test_invariante_inicio_e_inicio_seg_sempre_iguais(self):
        """Invariante chave: como `normalizarCenaRemotion` retorna
        `inicio = primeiroNumeroValido(inicio_seg, inicio)`, é mandatório
        que pipeline e schema cheguem ao mesmo número independente de qual
        chave for preferida — i.e. `inicio == inicio_seg` sempre."""
        entries = [
            _entry(10.0, 12.0, id_="aaa", cena_dict_extras={"inicio_seg": 10.0, "fim_seg": 12.0}),
            _entry(15.0, 20.0, id_="bbb", cena_dict_extras={"inicio_seg": 15.0, "fim_seg": 20.0}),
        ]
        cenas = _construir_cenas_chunk_relativas(10.0, entries)
        for cena in cenas:
            assert cena["inicio"] == pytest.approx(cena["inicio_seg"])
            assert cena["fim"] == pytest.approx(cena["fim_seg"])

    def test_todas_cenas_dentro_da_duracao_do_chunk(self):
        """Invariante visual: nenhuma cena pode ter timing além do fim do
        chunk. Se isto falhar, a `<Sequence>` no Remotion fica fora da
        composição → chunk preto."""
        chunk = _criar_overlay_chunk(
            1,
            [
                _entry(20.0, 22.0, id_="a", cena_dict_extras={"inicio_seg": 20.0, "fim_seg": 22.0}),
                _entry(23.0, 25.0, id_="b", cena_dict_extras={"inicio_seg": 23.0, "fim_seg": 25.0}),
            ],
        )
        chunk_dur_sec = chunk["end_sec"] - chunk["start_sec"]
        cenas = _construir_cenas_chunk_relativas(chunk["start_sec"], chunk["entries"])
        for cena in cenas:
            for chave in ("inicio", "fim", "inicio_seg", "fim_seg"):
                valor = cena[chave]
                assert 0.0 <= valor <= chunk_dur_sec + 1e-6, (
                    f"{chave}={valor} fora do intervalo [0, {chunk_dur_sec}] — "
                    "vai posicionar a Sequence fora da composição Remotion."
                )

    def test_preserva_campos_da_cena_que_nao_sao_timing(self):
        entries = [
            _entry(
                10.0,
                15.0,
                tipo="card_informacao",
                cena_dict_extras={
                    "texto": "Olá",
                    "subtexto": "Mundo",
                    "mascotMood": "pensativo",
                    "icone": "🔥",
                },
            )
        ]
        cenas = _construir_cenas_chunk_relativas(10.0, entries)
        assert cenas[0]["tipo"] == "card_informacao"
        assert cenas[0]["texto"] == "Olá"
        assert cenas[0]["subtexto"] == "Mundo"
        assert cenas[0]["mascotMood"] == "pensativo"
        assert cenas[0]["icone"] == "🔥"

    def test_entry_anterior_ao_chunk_start_e_clampado_em_zero(self):
        """Defensivo: se por bug de upstream uma entry começasse antes
        do chunk, `inicio` deve virar 0 (não negativo)."""
        entries = [_entry(5.0, 10.0)]
        cenas = _construir_cenas_chunk_relativas(8.0, entries)
        assert cenas[0]["inicio"] == pytest.approx(0.0)
        assert cenas[0]["inicio_seg"] == pytest.approx(0.0)

    def test_fim_igual_ao_inicio_clampa_em_0_001(self):
        """Defensivo: duração zero quebraria animações no Remotion. A
        função força um mínimo positivo para `fim`."""
        entries = [_entry(10.0, 10.0)]
        cenas = _construir_cenas_chunk_relativas(10.0, entries)
        assert cenas[0]["fim"] >= 0.001
        assert cenas[0]["fim_seg"] >= 0.001

    def test_multiplas_entries_cada_uma_relativa_ao_mesmo_chunk(self):
        # chunk começa em 100s; entries em 100→102, 105→108, 110→115
        entries = [
            _entry(100.0, 102.0, id_="a", cena_dict_extras={"inicio_seg": 100.0, "fim_seg": 102.0}),
            _entry(105.0, 108.0, id_="b", cena_dict_extras={"inicio_seg": 105.0, "fim_seg": 108.0}),
            _entry(110.0, 115.0, id_="c", cena_dict_extras={"inicio_seg": 110.0, "fim_seg": 115.0}),
        ]
        cenas = _construir_cenas_chunk_relativas(100.0, entries)
        assert [c["inicio"] for c in cenas] == [
            pytest.approx(0.0),
            pytest.approx(5.0),
            pytest.approx(10.0),
        ]
        assert [c["fim"] for c in cenas] == [
            pytest.approx(2.0),
            pytest.approx(8.0),
            pytest.approx(15.0),
        ]
        # E `_seg` acompanham
        assert [c["inicio_seg"] for c in cenas] == [
            pytest.approx(0.0),
            pytest.approx(5.0),
            pytest.approx(10.0),
        ]
        assert [c["fim_seg"] for c in cenas] == [
            pytest.approx(2.0),
            pytest.approx(8.0),
            pytest.approx(15.0),
        ]

    def test_props_geradas_compativeis_com_normalize_do_schema_remotion(self):
        """Simula o `normalizarCenaRemotion` do schema.ts (que prefere
        `inicio_seg`/`fim_seg` sobre `inicio`/`fim`). Se a função do
        pipeline estiver correta, a normalização do schema produz o
        mesmo número independentemente da chave preferida.
        """

        def normalizar_como_remotion(cena: dict) -> tuple[float, float]:
            """Réplica em Python da lógica de `normalizarCenaRemotion`
            (video-renderer/src/schema.ts:97-109): prefere `_seg`, cai em
            `inicio`/`fim`. Mantida síncrona ao schema TS para que esta
            duplicação sirva de canário."""

            def primeiro_numero(*valores):
                for valor in valores:
                    if isinstance(valor, (int, float)) and valor == valor:  # not NaN
                        return float(valor)
                return None

            inicio = primeiro_numero(cena.get("inicio_seg"), cena.get("inicio")) or 0.0
            fim_orig = primeiro_numero(cena.get("fim_seg"), cena.get("fim")) or (inicio + 5)
            fim = fim_orig if fim_orig > inicio else inicio + 5
            return inicio, fim

        # Cena que viria do banco com `_seg` absolutos
        entries = [
            _entry(
                50.0,
                55.0,
                cena_dict_extras={"inicio_seg": 50.0, "fim_seg": 55.0},
            )
        ]
        cenas = _construir_cenas_chunk_relativas(50.0, entries)
        inicio_rem, fim_rem = normalizar_como_remotion(cenas[0])
        assert inicio_rem == pytest.approx(0.0), (
            "Se este teste falha, a Sequence no Remotion vai ser posicionada "
            "em frame absoluto (50 * fps) dentro de um chunk que começa "
            "em 50s — exatamente o bug que travou todos os chunks tardios."
        )
        assert fim_rem == pytest.approx(5.0)


# ─────────────────────────────────────────────────────────────
# _deve_pular_fase
# ─────────────────────────────────────────────────────────────


class TestDevePularFase:
    def test_artefato_invalido_nunca_pula(self):
        assert _deve_pular_fase("grade", "auto", continuar=True, artefato_valido=False) is False

    def test_start_from_auto_continuar_true_pula_se_valido(self):
        assert _deve_pular_fase("grade", "auto", continuar=True, artefato_valido=True) is True

    def test_start_from_auto_continuar_false_nao_pula(self):
        assert _deve_pular_fase("grade", "auto", continuar=False, artefato_valido=True) is False

    def test_fase_anterior_ao_start_from_pula(self):
        # grade (1) < overlays (2) → deve pular grade quando start_from=overlays
        assert _deve_pular_fase("grade", "overlays", continuar=True, artefato_valido=True) is True

    def test_mesma_fase_que_start_from_nao_pula(self):
        # grade (1) não é menor que grade (1)
        assert _deve_pular_fase("grade", "grade", continuar=True, artefato_valido=True) is False

    def test_fase_posterior_ao_start_from_nao_pula(self):
        # render_final (3) > overlays (2) → não pula render_final ao retomar de overlays
        assert (
            _deve_pular_fase("render_final", "overlays", continuar=True, artefato_valido=True)
            is False
        )

    def test_render_final_pula_grade_e_overlays(self):
        assert (
            _deve_pular_fase("grade", "render_final", continuar=True, artefato_valido=True) is True
        )
        assert (
            _deve_pular_fase("overlays", "render_final", continuar=True, artefato_valido=True)
            is True
        )

    def test_render_final_nao_pula_render_final_em_si(self):
        assert (
            _deve_pular_fase("render_final", "render_final", continuar=True, artefato_valido=True)
            is False
        )

    def test_alias_compose_e_encode_apontam_para_render_final(self):
        """Retrocompatibilidade: o pipeline antigo expunha `compose` e
        `encode` como fases distintas. Hoje são a mesma fase fundida —
        aliases para `render_final`."""
        # Pedir start_from=encode pula grade e overlays
        assert _deve_pular_fase("grade", "encode", continuar=True, artefato_valido=True) is True
        assert _deve_pular_fase("overlays", "encode", continuar=True, artefato_valido=True) is True
        # E não pula a fase final (que é o destino do retomar)
        assert (
            _deve_pular_fase("render_final", "encode", continuar=True, artefato_valido=True)
            is False
        )
        # Mesma coisa via alias `compose`
        assert _deve_pular_fase("grade", "compose", continuar=True, artefato_valido=True) is True
        assert (
            _deve_pular_fase("render_final", "compose", continuar=True, artefato_valido=True)
            is False
        )
        # Aliases entre si: como mapeiam pra mesma fase canônica, não pula
        assert _deve_pular_fase("compose", "encode", continuar=True, artefato_valido=True) is False
        assert _deve_pular_fase("encode", "compose", continuar=True, artefato_valido=True) is False

    def test_fase_desconhecida_pula_silenciosamente(self):
        # AVISO: fase desconhecida recebe ordem 0, que é menor que qualquer fase real.
        # Resultado: typos como "gread" passam silenciosamente como "pular esta fase".
        # Isso NÃO é um erro intencional — é um risco de design a monitorar.
        assert (
            _deve_pular_fase("fase_estranha", "grade", continuar=True, artefato_valido=True) is True
        )


# ─────────────────────────────────────────────────────────────
# _extrair_cenas
# ─────────────────────────────────────────────────────────────


class TestExtrairCenas:
    def test_cenas_remotion_none_retorna_lista_vazia(self):
        corte = _mock_corte(cenas_remotion=None)
        assert _extrair_cenas(corte) == []

    def test_cenas_remotion_string_vazia_retorna_vazia(self):
        corte = _mock_corte(cenas_remotion="")
        assert _extrair_cenas(corte) == []

    def test_cenas_remotion_dict_com_chave_cenas(self):
        payload = {"cenas": [{"tipo": "card_informacao", "inicio": 0.0, "fim": 5.0}]}
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        result = _extrair_cenas(corte)
        assert len(result) == 1
        assert result[0]["tipo"] == "card_informacao"

    def test_cenas_remotion_lista_direta(self):
        payload = [{"tipo": "barra_inferior", "inicio": 0.0, "fim": 3.0}]
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        result = _extrair_cenas(corte)
        assert len(result) == 1

    def test_cenas_remotion_dict_sem_chave_cenas_retorna_vazia(self):
        payload = {"outro_campo": []}
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        assert _extrair_cenas(corte) == []

    def test_json_invalido_retorna_vazia_sem_explodir(self):
        corte = _mock_corte(cenas_remotion="nao_e_json{{{")
        assert _extrair_cenas(corte) == []

    def test_lista_com_multiplas_cenas(self):
        payload = {
            "cenas": [
                {"tipo": "card_informacao", "inicio": 0.0, "fim": 5.0},
                {"tipo": "barra_inferior", "inicio": 10.0, "fim": 13.0},
            ]
        }
        corte = _mock_corte(cenas_remotion=json.dumps(payload))
        assert len(_extrair_cenas(corte)) == 2

    def test_aceita_objeto_nao_string(self):
        # cenas_remotion pode vir como objeto Python (não serializado) em alguns fluxos
        payload = [{"tipo": "marco_historico", "inicio": 0.0, "fim": 5.0}]
        corte = _mock_corte(cenas_remotion=payload)
        result = _extrair_cenas(corte)
        assert len(result) == 1

    def test_aceita_dict_nao_string(self):
        payload = {"cenas": [{"tipo": "ficha_biografica", "inicio": 0.0, "fim": 5.0}]}
        corte = _mock_corte(cenas_remotion=payload)
        result = _extrair_cenas(corte)
        assert len(result) == 1


# ─────────────────────────────────────────────────────────────
# Fonte única do filtro (regressão: nunca mais filtro fantasma)
# ─────────────────────────────────────────────────────────────


class TestFiltroAplicadoNaGradeRespeitaUsuario:
    """Regressão: o pipeline deve usar `cinema_filters.get_filtro_vf` —
    nunca um filtro plano "rápido" que substitua a escolha do usuário."""

    @pytest.mark.parametrize("filtro", ["cinematic_iii"])
    def test_pipeline_usa_filtro_completo_do_domain(self, filtro):
        from app.domain.cinema_filters import get_filtro_vf

        resultado = get_filtro_vf(filtro)
        assert "curves" in resultado, (
            f"Filtro '{filtro}' deve incluir 'curves' (foi o sintoma do "
            "filtro fantasma que substituía a escolha do usuário por "
            "apenas eq+drawbox)."
        )
        assert "colorbalance" in resultado
        assert "vignette" in resultado

    def test_nenhum_retorna_none_para_pular_vf(self):
        from app.domain.cinema_filters import get_filtro_vf

        assert get_filtro_vf("nenhum") is None


# ─────────────────────────────────────────────────────────────
# _arquivo_minimo
# ─────────────────────────────────────────────────────────────


class TestArquivoMinimo:
    def test_arquivo_inexistente_retorna_false(self, tmp_path):
        assert _arquivo_minimo(tmp_path / "nao_existe.mp4", 100) is False

    def test_arquivo_abaixo_do_minimo_retorna_false(self, tmp_path):
        f = tmp_path / "pequeno.mp4"
        f.write_bytes(b"x" * 50)
        assert _arquivo_minimo(f, 100) is False

    def test_arquivo_exatamente_no_minimo_retorna_true(self, tmp_path):
        f = tmp_path / "exato.mp4"
        f.write_bytes(b"x" * 100)
        assert _arquivo_minimo(f, 100) is True

    def test_arquivo_acima_do_minimo_retorna_true(self, tmp_path):
        f = tmp_path / "grande.mp4"
        f.write_bytes(b"x" * 200)
        assert _arquivo_minimo(f, 100) is True

    def test_arquivo_vazio_retorna_false(self, tmp_path):
        f = tmp_path / "vazio.mp4"
        f.write_bytes(b"")
        assert _arquivo_minimo(f, 1) is False


# ─────────────────────────────────────────────────────────────
# _build_overlay_render_cmd (configuração injetada)
# ─────────────────────────────────────────────────────────────


class TestBuildOverlayRenderCmd:
    def _cmd(self, *, codec: OverlayCodec = OverlayCodec.VP9, **overrides):
        defaults = dict(
            composition="OverlayTimeline",
            bundle_arg="/tmp/bundle",
            output_path=Path("/tmp/chunk_001.webm"),
            props_file=Path("/tmp/props_001.json"),
            concurrency=4,
            codec_profile=overlay_codec_profile(codec),
        )
        defaults.update(overrides)
        return _build_overlay_render_cmd(**defaults)

    def test_inicia_com_npx_remotion_render(self):
        cmd = self._cmd()
        assert cmd[:3] == ["npx", "remotion", "render"]

    def test_inclui_concurrency_configurada(self):
        cmd = self._cmd(concurrency=6)
        idx = cmd.index("--concurrency")
        assert cmd[idx + 1] == "6"

    def test_concurrency_1_quando_economico(self):
        cmd = self._cmd(concurrency=1)
        idx = cmd.index("--concurrency")
        assert cmd[idx + 1] == "1"

    def test_codec_vp9_por_padrao(self):
        cmd = self._cmd(codec=OverlayCodec.VP9)
        assert "--codec=vp9" in cmd
        assert "--pixel-format=yuva420p" in cmd

    def test_codec_prores_quando_solicitado(self):
        cmd = self._cmd(codec=OverlayCodec.PRORES_4444)
        assert "--codec=prores" in cmd
        assert "--prores-profile=4444" in cmd
        assert "--pixel-format=yuva444p10le" in cmd

    def test_overwrite_presente(self):
        assert "--overwrite" in self._cmd()

    def test_aceita_composicao_overlayscene(self):
        cmd = self._cmd(composition="OverlayScene")
        assert "OverlayScene" in cmd
        assert "OverlayTimeline" not in cmd

    def test_aceita_composicao_overlaytimeline(self):
        cmd = self._cmd(composition="OverlayTimeline")
        assert "OverlayTimeline" in cmd


# ─────────────────────────────────────────────────────────────
# _aguardar_cooldown (sleep configurável)
# ─────────────────────────────────────────────────────────────


class TestAguardarCooldown:
    def test_cooldown_zero_retorna_imediatamente(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(0, ha_mais_chunks=True))
        assert time.perf_counter() - inicio < 0.1

    def test_cooldown_negativo_retorna_imediatamente(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(-5, ha_mais_chunks=True))
        assert time.perf_counter() - inicio < 0.1

    def test_sem_mais_chunks_nao_dorme(self):
        inicio = time.perf_counter()
        asyncio.run(_aguardar_cooldown(20, ha_mais_chunks=False))
        assert time.perf_counter() - inicio < 0.1

    def test_cooldown_positivo_aguarda(self):
        from unittest.mock import AsyncMock, patch

        with patch(
            "app.services.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            asyncio.run(_aguardar_cooldown(3, ha_mais_chunks=True))
            fake_sleep.assert_awaited_once_with(3)


# ─────────────────────────────────────────────────────────────
# _preparar_bundle_overlay — integração com cache
# ─────────────────────────────────────────────────────────────


class TestAssetsServidosDoBundle:
    """D-190: o fingerprint do bundle precisa incluir os assets que o
    `remotion bundle` embute (mascote em public/sapo + theme.config.json).
    Sem isso, re-materializar o mascote de um canal não invalidava o cache
    e a maioria dos overlays sumia (bundle antigo servido).
    """

    @staticmethod
    def _montar_renderer(root: Path) -> Path:
        renderer = root / "video-renderer"
        (renderer / "src").mkdir(parents=True)
        (renderer / "src" / "index.ts").write_text("export const x = 1;", encoding="utf-8")
        (renderer / "package.json").write_text('{"name":"vr"}', encoding="utf-8")
        (renderer / "public" / "sapo").mkdir(parents=True)
        (renderer / "public" / "sapo" / "sapo_serio.png").write_bytes(b"png-serio")
        (renderer / "public" / "sapo" / "sapo_animado.png").write_bytes(b"png-animado")
        (renderer / "theme.config.json").write_text('{"cor":"#fff"}', encoding="utf-8")
        return renderer

    def test_inclui_pngs_do_mascote_e_theme(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        nomes = {p.name for p in _assets_servidos_do_bundle(renderer)}
        assert "sapo_serio.png" in nomes
        assert "sapo_animado.png" in nomes
        assert "theme.config.json" in nomes

    def test_renderer_sem_public_nem_theme_nao_quebra(self, tmp_path):
        renderer = tmp_path / "video-renderer"
        (renderer / "src").mkdir(parents=True)
        assert _assets_servidos_do_bundle(renderer) == []

    def test_trocar_imagem_do_mascote_muda_o_fingerprint(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        src = renderer / "src"
        pkg = renderer / "package.json"

        fp_antes = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        # Re-materializa uma pose com conteúdo novo (sem tocar em src/).
        (renderer / "public" / "sapo" / "sapo_serio.png").write_bytes(b"png-serio-v2")
        fp_depois = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        assert fp_antes != fp_depois

    def test_mudanca_no_theme_muda_o_fingerprint(self, tmp_path):
        renderer = self._montar_renderer(tmp_path)
        src = renderer / "src"
        pkg = renderer / "package.json"

        fp_antes = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        (renderer / "theme.config.json").write_text('{"cor":"#000"}', encoding="utf-8")
        fp_depois = compute_src_fingerprint(
            src, extra_files=[pkg, *_assets_servidos_do_bundle(renderer)]
        )
        assert fp_antes != fp_depois


# ─────────────────────────────────────────────────────────────
# _normalizar_fase_alias
# ─────────────────────────────────────────────────────────────


class TestNormalizarFaseAlias:
    def test_compose_vira_render_final(self):
        assert _normalizar_fase_alias("compose") == "render_final"

    def test_encode_vira_render_final(self):
        assert _normalizar_fase_alias("encode") == "render_final"

    @pytest.mark.parametrize("fase_canonica", ["grade", "overlays", "render_final", "auto"])
    def test_fases_canonicas_passam_intactas(self, fase_canonica):
        assert _normalizar_fase_alias(fase_canonica) == fase_canonica

    def test_fase_desconhecida_passa_intacta(self):
        assert _normalizar_fase_alias("xpto") == "xpto"


# ─────────────────────────────────────────────────────────────
# _filtrar_chunks_pendentes
# ─────────────────────────────────────────────────────────────


class TestFiltrarChunksPendentes:
    @staticmethod
    def _chunks_basicos():
        return [
            _criar_overlay_chunk(1, [_entry(0.0, 5.0)]),
            _criar_overlay_chunk(2, [_entry(20.0, 25.0)]),
        ]

    def test_start_from_render_final_retorna_lista_vazia(self, tmp_path):
        chunks = self._chunks_basicos()
        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="render_final",
            continuar=True,
            file_extension=".webm",
        )
        assert pendentes == []

    def test_sem_continuar_retorna_todos(self, tmp_path):
        chunks = self._chunks_basicos()
        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="auto",
            continuar=False,
            file_extension=".webm",
        )
        assert len(pendentes) == 2

    def test_continuar_pula_chunks_ja_grandes_na_extensao_atual(self, tmp_path):
        chunks = self._chunks_basicos()
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * (11 * 1024 * 1024))

        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="auto",
            continuar=True,
            file_extension=".webm",
        )
        ids_pendentes = [c["id"] for c in pendentes]
        assert "001" not in ids_pendentes
        assert "002" in ids_pendentes

    def test_continuar_nao_pula_chunk_parcial(self, tmp_path):
        chunks = self._chunks_basicos()
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * 1024)

        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="auto",
            continuar=True,
            file_extension=".webm",
        )
        ids_pendentes = [c["id"] for c in pendentes]
        assert "001" in ids_pendentes

    def test_chunk_em_extensao_antiga_e_tratado_como_pendente(self, tmp_path):
        """Trocar de ProRes (.mov) para VP9 (.webm) deve re-renderizar.
        O .mov antigo permanece no disco (será reaproveitado na composição)
        mas o filtro de pendentes só considera a extensão atual."""
        chunks = self._chunks_basicos()
        (tmp_path / "chunk_001.mov").write_bytes(b"x" * (20 * 1024 * 1024))

        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="auto",
            continuar=True,
            file_extension=".webm",
        )
        ids_pendentes = [c["id"] for c in pendentes]
        assert "001" in ids_pendentes

    def test_chunk_pequeno_mas_valido_e_pulado(self, tmp_path):
        """Threshold antigo (10 MB) re-renderizava chunks curtos válidos.
        Hoje (256 KB) só re-renderiza arquivos realmente truncados."""
        chunks = self._chunks_basicos()
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * (300 * 1024))

        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="auto",
            continuar=True,
            file_extension=".webm",
        )
        ids_pendentes = [c["id"] for c in pendentes]
        assert "001" not in ids_pendentes
        assert "002" in ids_pendentes

    def test_continuar_overlays_pula_chunk_pronto(self, tmp_path):
        """Continuar Fase 2: `start_from='overlays'` + `continuar=True` deve
        pular chunks já renderizados igual ao modo 'auto'."""
        chunks = self._chunks_basicos()
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * (11 * 1024 * 1024))

        pendentes = _filtrar_chunks_pendentes(
            overlay_chunks=chunks,
            overlays_dir=tmp_path,
            start_from="overlays",
            continuar=True,
            file_extension=".webm",
        )
        ids_pendentes = [c["id"] for c in pendentes]
        assert "001" not in ids_pendentes
        assert "002" in ids_pendentes


# ─────────────────────────────────────────────────────────────
# _deve_limpar_artefatos
# ─────────────────────────────────────────────────────────────


class TestDeveLimparArtefatos:
    def test_continuar_false_sempre_limpa(self):
        assert _deve_limpar_artefatos(continuar=False, start_from="auto") is True
        assert _deve_limpar_artefatos(continuar=False, start_from="grade") is True
        assert _deve_limpar_artefatos(continuar=False, start_from="overlays") is True

    def test_auto_com_continuar_nao_limpa(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="auto") is False

    def test_overlays_com_continuar_nao_limpa(self):
        """Modo Continuar Fase 2: preserva chunks renderizados."""
        assert _deve_limpar_artefatos(continuar=True, start_from="overlays") is False

    def test_grade_com_continuar_limpa(self):
        """Reinício explícito em 'grade' apaga intermediários adiante."""
        assert _deve_limpar_artefatos(continuar=True, start_from="grade") is True

    def test_render_final_com_continuar_limpa(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="render_final") is True

    def test_aliases_compose_encode_seguem_render_final(self):
        assert _deve_limpar_artefatos(continuar=True, start_from="compose") is True
        assert _deve_limpar_artefatos(continuar=True, start_from="encode") is True


# ─────────────────────────────────────────────────────────────
# _resolver_overlays_para_composicao
# ─────────────────────────────────────────────────────────────


class TestResolverOverlaysParaComposicao:
    def test_chunk_webm_existente_e_preferido(self, tmp_path):
        chunks = [_criar_overlay_chunk(1, [_entry(10.0, 15.0)])]
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * 100)

        paths, timings = _resolver_overlays_para_composicao(chunks, tmp_path)
        assert len(paths) == 1
        assert paths[0].name == "chunk_001.webm"
        assert timings[0] == {"start_sec": 10.0, "end_sec": 15.0}

    def test_aceita_chunk_mov_legado(self, tmp_path):
        """Projetos antigos renderizados em ProRes (.mov) continuam usáveis
        sem re-renderizar — backward compat."""
        chunks = [_criar_overlay_chunk(1, [_entry(10.0, 15.0)])]
        (tmp_path / "chunk_001.mov").write_bytes(b"x" * 100)

        paths, _ = _resolver_overlays_para_composicao(chunks, tmp_path)
        assert paths[0].name == "chunk_001.mov"

    def test_fallback_para_ov_individual_quando_chunk_ausente(self, tmp_path):
        entries = [_entry(10.0, 15.0, id_="001"), _entry(20.0, 25.0, id_="002")]
        chunks = [_criar_overlay_chunk(1, entries)]
        (tmp_path / "ov_001.webm").write_bytes(b"x" * 100)
        (tmp_path / "ov_002.webm").write_bytes(b"x" * 100)

        paths, timings = _resolver_overlays_para_composicao(chunks, tmp_path)
        names = [p.name for p in paths]
        assert names == ["ov_001.webm", "ov_002.webm"]
        assert timings == [
            {"start_sec": 10.0, "end_sec": 15.0},
            {"start_sec": 20.0, "end_sec": 25.0},
        ]

    def test_chunk_e_individuais_ausentes_geram_lista_vazia(self, tmp_path):
        chunks = [_criar_overlay_chunk(1, [_entry(10.0, 15.0, id_="001")])]
        paths, timings = _resolver_overlays_para_composicao(chunks, tmp_path)
        assert paths == []
        assert timings == []

    def test_multiplos_chunks_preserva_ordem(self, tmp_path):
        chunks = [
            _criar_overlay_chunk(1, [_entry(0.0, 5.0)]),
            _criar_overlay_chunk(2, [_entry(30.0, 35.0)]),
        ]
        (tmp_path / "chunk_001.webm").write_bytes(b"x" * 100)
        (tmp_path / "chunk_002.webm").write_bytes(b"x" * 100)

        paths, _ = _resolver_overlays_para_composicao(chunks, tmp_path)
        assert [p.name for p in paths] == ["chunk_001.webm", "chunk_002.webm"]


# ─────────────────────────────────────────────────────────────
# _localizar_overlay_existente — lookup multi-extensão
# ─────────────────────────────────────────────────────────────


class TestLocalizarOverlayExistente:
    def test_retorna_none_quando_nada_existe(self, tmp_path):
        assert _localizar_overlay_existente(tmp_path, "chunk_001") is None

    def test_acha_webm(self, tmp_path):
        (tmp_path / "chunk_001.webm").write_bytes(b"x")
        result = _localizar_overlay_existente(tmp_path, "chunk_001")
        assert result is not None and result.name == "chunk_001.webm"

    def test_acha_mov(self, tmp_path):
        (tmp_path / "chunk_001.mov").write_bytes(b"x")
        result = _localizar_overlay_existente(tmp_path, "chunk_001")
        assert result is not None and result.name == "chunk_001.mov"

    def test_quando_ambos_existem_retorna_webm_primeiro(self, tmp_path):
        """A ordem em `_OVERLAY_EXTENSIONS_LEGADAS` privilegia .webm
        (codec atual). Se .mov antigo + .webm novo existem, usa o novo."""
        (tmp_path / "chunk_001.webm").write_bytes(b"x")
        (tmp_path / "chunk_001.mov").write_bytes(b"x")
        result = _localizar_overlay_existente(tmp_path, "chunk_001")
        assert result is not None and result.name == "chunk_001.webm"

    def test_stem_diferente_nao_e_encontrado(self, tmp_path):
        (tmp_path / "chunk_001.webm").write_bytes(b"x")
        assert _localizar_overlay_existente(tmp_path, "chunk_002") is None


# ─────────────────────────────────────────────────────────────
# _limpar_a_partir_de
# ─────────────────────────────────────────────────────────────


class TestLimparAPartirDe:
    """`_limpar_a_partir_de` remove artefatos intermediários por fase
    mas PRESERVA o `video_final.mp4` publicado (somente o arquivo
    temporário `video.rendering.mp4` é apagado). Isso protege contra
    perda do output já entregue ao usuário se o pipeline reinicia.
    """

    @staticmethod
    def _setup(tmp_path):
        graded = tmp_path / "graded"
        overlays = tmp_path / "overlays"
        upload = tmp_path / "upload_ready"
        graded.mkdir()
        overlays.mkdir()
        upload.mkdir()
        (graded / "clip_graded.mp4").write_bytes(b"g" * 100)
        (overlays / "chunk_001.mov").write_bytes(b"o" * 100)
        video_final = upload / "video.mp4"
        video_final.write_bytes(b"f" * 100)
        # Temporário "rendering" — esse SIM deve ser limpo
        video_rendering = upload / "video.rendering.mp4"
        video_rendering.write_bytes(b"t" * 100)
        return graded, overlays, video_final, video_rendering

    def test_grade_limpa_graded_e_overlays(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final)
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()
        # video_final publicado é preservado; apenas o .rendering temp é apagado
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_overlays_preserva_graded(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("overlays", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_render_final_preserva_graded_e_overlays(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("render_final", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_alias_compose_se_comporta_como_render_final(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("compose", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_alias_encode_se_comporta_como_render_final(self, tmp_path):
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("encode", graded, overlays, video_final)
        assert (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_fase_desconhecida_cai_em_grade(self, tmp_path):
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("xpto", graded, overlays, video_final)
        # Comportamento defensivo: typo → limpeza total de intermediários
        assert not (graded / "clip_graded.mp4").exists()

    def test_so_grade_preserva_overlays(self, tmp_path):
        # D-064: render parcial "só a grade" (start_from=grade, parar_em=grade)
        # apaga apenas o graded e PRESERVA os overlays já renderizados —
        # corrigir a grade não deve custar uma nova rodada de overlays.
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em="grade")
        assert not (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_grade_ate_overlays_limpa_ambos(self, tmp_path):
        # parar_em='overlays' inclui overlays no alcance → limpa os dois.
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em="overlays")
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()

    def test_grade_com_continuar_preserva_overlays(self, tmp_path):
        # D-064: "deu problema na grade, mas os overlays já terminaram" →
        # refaz a grade até o final reaproveitando (continuar=True) os overlays
        # prontos. Sem parar_em (roda até o render final), mas continuar manda
        # preservar os overlays — eles independem do conteúdo da grade.
        graded, overlays, video_final, video_rendering = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em=None, continuar=True)
        assert not (graded / "clip_graded.mp4").exists()
        assert (overlays / "chunk_001.mov").exists()
        assert video_final.exists()
        assert not video_rendering.exists()

    def test_grade_refazer_do_zero_limpa_overlays(self, tmp_path):
        # "Reprocessar tudo" (continuar=False) reinicia pela grade e apaga
        # também os overlays — comportamento histórico do "começar do zero".
        graded, overlays, video_final, _ = self._setup(tmp_path)
        _limpar_a_partir_de("grade", graded, overlays, video_final, parar_em=None, continuar=False)
        assert not (graded / "clip_graded.mp4").exists()
        assert not (overlays / "chunk_001.mov").exists()


# ─────────────────────────────────────────────────────────────
# _validar_video_completo_sync — implementação síncrona
# ─────────────────────────────────────────────────────────────


class TestValidarVideoCompletoSync:
    """Cobre o caminho síncrono (executado em thread via to_thread).
    Mockamos `subprocess.run` para evitar depender do ffprobe no CI."""

    @staticmethod
    def _arquivo_grande(tmp_path: Path) -> Path:
        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))  # 2 MB
        return f

    def test_arquivo_inexistente_retorna_false(self, tmp_path):
        assert _validar_video_completo_sync(tmp_path / "nao_existe.mp4") is False

    def test_arquivo_menor_que_1mb_retorna_false(self, tmp_path):
        f = tmp_path / "minusculo.mp4"
        f.write_bytes(b"x" * 1024)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_sucesso_retorna_true(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=0, stderr=""))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is True

    def test_ffprobe_moov_atom_not_found_retorna_false(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=1, stderr="moov atom not found"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_invalid_data_retorna_false(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=1, stderr="Invalid data found"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is False

    def test_ffprobe_erro_desconhecido_aceita_por_tamanho(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(return_value=MagicMock(returncode=42, stderr="estranho"))
        monkeypatch.setattr(sp, "run", fake_run)
        # Arquivo é grande (2 MB) e o erro não é diagnóstico — aceita
        assert _validar_video_completo_sync(f) is True

    def test_ffprobe_nao_instalado_aceita_por_tamanho(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = self._arquivo_grande(tmp_path)
        fake_run = MagicMock(side_effect=FileNotFoundError("ffprobe"))
        monkeypatch.setattr(sp, "run", fake_run)
        assert _validar_video_completo_sync(f) is True


class TestValidarVideoCompletoAsync:
    """A versão async deve apenas delegar à versão síncrona via thread,
    sem bloquear o event loop. Cobertura: o event loop continua livre
    para outras tarefas enquanto a validação roda."""

    def test_wrapper_async_retorna_mesmo_resultado_que_sync(self, tmp_path, monkeypatch):
        import subprocess as sp
        from unittest.mock import MagicMock

        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))
        monkeypatch.setattr(sp, "run", MagicMock(return_value=MagicMock(returncode=0, stderr="")))

        assert asyncio.run(_validar_video_completo(f)) is True

    def test_event_loop_nao_bloqueia(self, tmp_path, monkeypatch):
        """Enquanto a validação roda em thread, o event loop deve
        continuar processando outras coroutines."""
        import subprocess as sp
        from unittest.mock import MagicMock

        f = tmp_path / "video.mp4"
        f.write_bytes(b"x" * (2 * 1024 * 1024))

        def lento(*args, **kwargs):
            time.sleep(0.2)
            return MagicMock(returncode=0, stderr="")

        monkeypatch.setattr(sp, "run", lento)

        async def cenario():
            ticks = {"n": 0}

            async def heartbeat():
                for _ in range(10):
                    ticks["n"] += 1
                    await asyncio.sleep(0.03)

            beat_task = asyncio.create_task(heartbeat())
            ok = await _validar_video_completo(f)
            await beat_task
            return ok, ticks["n"]

        ok, batimentos = asyncio.run(cenario())
        assert ok is True
        # Se o event loop estivesse bloqueado pelos 200ms, batimentos seria ~0
        assert batimentos >= 5


# ─────────────────────────────────────────────────────────────
# _render_retry_policy
# ─────────────────────────────────────────────────────────────


class TestRenderRetryPolicy:
    def test_le_max_attempts_das_settings(self):
        from app.services.app_settings import RenderSettings

        cfg = RenderSettings(overlay_max_attempts=5)
        policy = _render_retry_policy(cfg)
        assert policy.max_attempts == 5

    def test_default_3_attempts(self):
        from app.services.app_settings import RenderSettings

        policy = _render_retry_policy(RenderSettings())
        assert policy.max_attempts == 3

    def test_backoff_linear_2s(self):
        from app.services.app_settings import RenderSettings

        policy = _render_retry_policy(RenderSettings())
        assert policy.base_delay_sec == 2.0


# ─────────────────────────────────────────────────────────────
# _retry_async — wrapper de retry para operações async
# ─────────────────────────────────────────────────────────────


class TestRetryAsync:
    def test_sucesso_na_primeira_tentativa_chama_uma_vez(self):
        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1

        policy = RetryPolicy(max_attempts=3, base_delay_sec=0.0)
        asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 1

    def test_falha_uma_vez_depois_sucesso(self):
        from unittest.mock import AsyncMock, patch

        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            if chamadas["n"] == 1:
                raise RuntimeError("transient")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch("app.services.pipeline_render.asyncio.sleep", new_callable=AsyncMock):
            asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 2

    def test_esgota_tentativas_e_relevanta_ultimo_erro(self):
        from unittest.mock import AsyncMock, patch

        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            raise RuntimeError(f"falha-{chamadas['n']}")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch("app.services.pipeline_render.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(RuntimeError, match="falha-3"):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 3

    def test_max_attempts_1_nao_retenta(self):
        chamadas = {"n": 0}

        async def op():
            chamadas["n"] += 1
            raise RuntimeError("falha")

        policy = RetryPolicy(max_attempts=1, base_delay_sec=0.0)
        with pytest.raises(RuntimeError):
            asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        assert chamadas["n"] == 1

    def test_aguarda_backoff_entre_tentativas(self):
        from unittest.mock import AsyncMock, patch

        async def op():
            raise RuntimeError("sempre falha")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=2.0)
        with patch(
            "app.services.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            with pytest.raises(RuntimeError):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))

        # 2 retries → 2 sleeps com backoff 2s e 4s
        delays_chamados = [call.args[0] for call in fake_sleep.call_args_list]
        assert delays_chamados == [2.0, 4.0]

    def test_backoff_zero_nao_chama_sleep(self):
        from unittest.mock import AsyncMock, patch

        async def op():
            raise RuntimeError("falha")

        policy = RetryPolicy(max_attempts=3, base_delay_sec=0.0)
        with patch(
            "app.services.pipeline_render.asyncio.sleep", new_callable=AsyncMock
        ) as fake_sleep:
            with pytest.raises(RuntimeError):
                asyncio.run(_retry_async(operacao=op, policy=policy, rotulo="teste"))
        fake_sleep.assert_not_called()


# ─────────────────────────────────────────────────────────────
# Isolamento de falha em batch (gather return_exceptions)
# ─────────────────────────────────────────────────────────────


class TestBatchIsoladoSobFalha:
    """Garante que falha de 1 chunk não derruba os outros, e que o
    batch retorna a lista dos que falharam após esgotar as retries."""

    def test_dois_chunks_um_falha_outro_segue(self, tmp_path, monkeypatch):
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        # Setup do renderer fake (para o bundle)
        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name":"v"}\n', encoding="utf-8")
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        # Settings: 1 tentativa só, sem backoff (testes rápidos)
        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(
            RenderSettings(overlay_max_attempts=1, cooldown_sec=0, bundle_cache_enabled=True)
        )

        # Mock do worker: bundle ok, chunk_001 falha, chunk_002 ok
        async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            # Bundle: materializa index.html no --out-dir
            if "bundle" in job_id or job_id.startswith("overlay_bundle"):
                out_idx = cmd.index("--out-dir") + 1
                target = Path(cmd[out_idx])
                target.mkdir(parents=True, exist_ok=True)
                (target / "index.html").write_text("<html/>", encoding="utf-8")
                return

            # Render de chunk: chunk_001 falha sempre, chunk_002 sucede
            if job_id == "chunk_001":
                raise RuntimeError("falha proposital chunk_001")

            if job_id == "chunk_002":
                # Materializa o output para simular sucesso
                # cmd para overlay render tem output como argumento posicional após composition
                # mas detectamos pelo "render" + output_path no cmd
                for arg in cmd:
                    if arg.endswith(".webm") or arg.endswith(".mov"):
                        Path(arg).write_bytes(b"x" * (15 * 1024 * 1024))
                        return

        monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)

        try:
            chunks = [
                _criar_overlay_chunk(1, [_entry(0.0, 5.0)]),
                _criar_overlay_chunk(2, [_entry(20.0, 25.0)]),
            ]
            output_dir = tmp_path / "projetos" / "proj" / "overlays"
            output_dir.mkdir(parents=True)

            falhados = asyncio.run(
                pr._executar_batch_overlay_chunks_parallel(
                    chunks, output_dir, AppSettingsService.get().render
                )
            )

            # 1 chunk falhou, 1 chunk renderizou
            ids_falhados = [fid for fid, _ in falhados]
            assert ids_falhados == ["001"]
            # Extensão derivada do codec configurado (robusto ao default).
            ext = overlay_codec_profile(
                AppSettingsService.get().render.overlay_codec
            ).file_extension
            assert (output_dir / f"chunk_002{ext}").exists()
            assert not (output_dir / f"chunk_001{ext}").exists()
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_todos_sucesso_retorna_lista_vazia(self, tmp_path, monkeypatch):
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name":"v"}\n', encoding="utf-8")
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(
            RenderSettings(overlay_max_attempts=1, cooldown_sec=0, bundle_cache_enabled=True)
        )

        async def fake_worker_ok(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            if "bundle" in job_id or job_id.startswith("overlay_bundle"):
                out_idx = cmd.index("--out-dir") + 1
                target = Path(cmd[out_idx])
                target.mkdir(parents=True, exist_ok=True)
                (target / "index.html").write_text("<html/>", encoding="utf-8")
                return
            # Materializa output para qualquer chunk
            for arg in cmd:
                if arg.endswith(".webm") or arg.endswith(".mov"):
                    Path(arg).write_bytes(b"x" * (15 * 1024 * 1024))
                    return

        monkeypatch.setattr(pr, "_executar_via_worker", fake_worker_ok)

        try:
            chunks = [
                _criar_overlay_chunk(1, [_entry(0.0, 5.0)]),
                _criar_overlay_chunk(2, [_entry(20.0, 25.0)]),
            ]
            output_dir = tmp_path / "projetos" / "proj" / "overlays"
            output_dir.mkdir(parents=True)

            falhados = asyncio.run(
                pr._executar_batch_overlay_chunks_parallel(
                    chunks, output_dir, AppSettingsService.get().render
                )
            )
            assert falhados == []
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_bundle_dir_explicito_evita_preparar_novamente(self, tmp_path, monkeypatch):
        """Quando o orquestrador passa `bundle_dir` pronto (caso da paralelização
        com a Fase 1), `_executar_batch_overlay_chunks_parallel` NÃO deve chamar
        `_preparar_bundle_overlay` de novo — esse é o caminho rápido."""
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name":"v"}\n', encoding="utf-8")
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(
            RenderSettings(overlay_max_attempts=1, cooldown_sec=0, bundle_cache_enabled=True)
        )

        # Contador para detectar se _preparar_bundle_overlay foi chamado
        chamadas_bundle = {"n": 0}

        async def fake_preparar_bundle(output_dir: Path) -> Path:
            chamadas_bundle["n"] += 1
            bundle_dir = tmp_path / "fake_bundle"
            bundle_dir.mkdir(parents=True, exist_ok=True)
            (bundle_dir / "index.html").write_text("<html/>", encoding="utf-8")
            return bundle_dir

        async def fake_worker_ok(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            # Materializa output para qualquer chunk
            for arg in cmd:
                if arg.endswith(".webm") or arg.endswith(".mov"):
                    Path(arg).write_bytes(b"x" * (15 * 1024 * 1024))
                    return

        monkeypatch.setattr(pr, "_preparar_bundle_overlay", fake_preparar_bundle)
        monkeypatch.setattr(pr, "_executar_via_worker", fake_worker_ok)

        try:
            chunks = [_criar_overlay_chunk(1, [_entry(0.0, 5.0)])]
            output_dir = tmp_path / "projetos" / "proj" / "overlays"
            output_dir.mkdir(parents=True)

            # Cenário: orquestrador passou bundle pronto
            bundle_pronto = tmp_path / "bundle_externo"
            bundle_pronto.mkdir()
            (bundle_pronto / "index.html").write_text("<html/>", encoding="utf-8")

            asyncio.run(
                pr._executar_batch_overlay_chunks_parallel(
                    chunks,
                    output_dir,
                    AppSettingsService.get().render,
                    bundle_dir=bundle_pronto,
                )
            )

            assert chamadas_bundle["n"] == 0, (
                "Bundle dir já estava pronto, não deveria ser preparado novamente"
            )
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_bundle_dir_none_dispara_preparar(self, tmp_path, monkeypatch):
        """Compatibilidade reversa: quando `bundle_dir=None`, prepara
        internamente como antes (uso fora do orquestrador principal)."""
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name":"v"}\n', encoding="utf-8")
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(
            RenderSettings(overlay_max_attempts=1, cooldown_sec=0, bundle_cache_enabled=True)
        )

        chamadas_bundle = {"n": 0}

        async def fake_preparar_bundle(output_dir: Path) -> Path:
            chamadas_bundle["n"] += 1
            bundle_dir = tmp_path / "fake_bundle"
            bundle_dir.mkdir(parents=True, exist_ok=True)
            (bundle_dir / "index.html").write_text("<html/>", encoding="utf-8")
            return bundle_dir

        async def fake_worker_ok(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            for arg in cmd:
                if arg.endswith(".webm") or arg.endswith(".mov"):
                    Path(arg).write_bytes(b"x" * (15 * 1024 * 1024))
                    return

        monkeypatch.setattr(pr, "_preparar_bundle_overlay", fake_preparar_bundle)
        monkeypatch.setattr(pr, "_executar_via_worker", fake_worker_ok)

        try:
            chunks = [_criar_overlay_chunk(1, [_entry(0.0, 5.0)])]
            output_dir = tmp_path / "projetos" / "proj" / "overlays"
            output_dir.mkdir(parents=True)

            # bundle_dir=None: deve preparar
            asyncio.run(
                pr._executar_batch_overlay_chunks_parallel(
                    chunks, output_dir, AppSettingsService.get().render
                )
            )

            assert chamadas_bundle["n"] == 1
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_retry_recupera_apos_falha_transiente(self, tmp_path, monkeypatch):
        """Com max_attempts=2, chunk que falha na 1ª e sucede na 2ª acaba ok."""
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name":"v"}\n', encoding="utf-8")
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(
            RenderSettings(overlay_max_attempts=2, cooldown_sec=0, bundle_cache_enabled=True)
        )

        tentativas_por_chunk: dict[str, int] = {}

        async def fake_worker(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            if "bundle" in job_id or job_id.startswith("overlay_bundle"):
                out_idx = cmd.index("--out-dir") + 1
                target = Path(cmd[out_idx])
                target.mkdir(parents=True, exist_ok=True)
                (target / "index.html").write_text("<html/>", encoding="utf-8")
                return

            tentativas_por_chunk[job_id] = tentativas_por_chunk.get(job_id, 0) + 1
            if tentativas_por_chunk[job_id] == 1:
                raise RuntimeError("transient OOM")
            # 2ª tentativa: sucede
            for arg in cmd:
                if arg.endswith(".webm") or arg.endswith(".mov"):
                    Path(arg).write_bytes(b"x" * (15 * 1024 * 1024))
                    return

        # Mock asyncio.sleep para não atrasar testes
        from unittest.mock import AsyncMock

        monkeypatch.setattr(pr, "_executar_via_worker", fake_worker)
        monkeypatch.setattr(pr.asyncio, "sleep", AsyncMock())

        try:
            chunks = [_criar_overlay_chunk(1, [_entry(0.0, 5.0)])]
            output_dir = tmp_path / "projetos" / "proj" / "overlays"
            output_dir.mkdir(parents=True)

            falhados = asyncio.run(
                pr._executar_batch_overlay_chunks_parallel(
                    chunks, output_dir, AppSettingsService.get().render
                )
            )
            assert falhados == []
            assert tentativas_por_chunk["chunk_001"] == 2
            ext = overlay_codec_profile(
                AppSettingsService.get().render.overlay_codec
            ).file_extension
            assert (output_dir / f"chunk_001{ext}").exists()
        finally:
            AppSettingsService.set_settings_path_for_tests(None)


# Testes do watcher + polling vivem em
# `tests/infrastructure/test_worker_queue.py` (a lógica foi extraída para
# `app.infrastructure.worker_queue`). Aqui permanecem só os testes de
# orquestração do pipeline.


class TestPrepararBundleOverlay:
    """Garante que o bundle é reaproveitado quando `src/` não mudou.

    Mocka `_executar_via_worker` (subprocess) e `settings.video_renderer_dir`
    para apontar para um diretório controlado por `tmp_path`.
    """

    @staticmethod
    def _preparar_renderer(tmp_path: Path) -> Path:
        renderer_dir = tmp_path / "video-renderer"
        (renderer_dir / "src").mkdir(parents=True)
        (renderer_dir / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        (renderer_dir / "package.json").write_text('{"name": "v"}\n', encoding="utf-8")
        return renderer_dir

    @staticmethod
    def _fake_worker_que_materializa_bundle():
        from unittest.mock import AsyncMock

        async def side_effect(fila_dir, job_id, cmd, cwd, timeout=600, **_):
            # Detecta o argumento --out-dir e cria index.html lá
            try:
                out_idx = cmd.index("--out-dir") + 1
            except ValueError:
                return
            target = Path(cmd[out_idx])
            target.mkdir(parents=True, exist_ok=True)
            (target / "index.html").write_text("<html/>", encoding="utf-8")

        return AsyncMock(side_effect=side_effect)

    def test_segunda_chamada_reaproveita_bundle(self, tmp_path: Path, monkeypatch):
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=True))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir_a = tmp_path / "projeto_a" / "overlays"
            output_dir_b = tmp_path / "projeto_b" / "overlays"
            output_dir_a.mkdir(parents=True)
            output_dir_b.mkdir(parents=True)

            first = asyncio.run(pr._preparar_bundle_overlay(output_dir_a))
            second = asyncio.run(pr._preparar_bundle_overlay(output_dir_b))

            assert first == second
            assert worker_mock.await_count == 1
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_mudanca_em_src_invalida_cache(self, tmp_path: Path, monkeypatch):
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=True))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir = tmp_path / "projeto_a" / "overlays"
            output_dir.mkdir(parents=True)

            asyncio.run(pr._preparar_bundle_overlay(output_dir))
            # Mudou o conteúdo de src/ → fingerprint diferente → re-bundle
            (renderer_dir / "src" / "index.ts").write_text(
                "export const v = 2;\n", encoding="utf-8"
            )
            asyncio.run(pr._preparar_bundle_overlay(output_dir))

            assert worker_mock.await_count == 2
        finally:
            AppSettingsService.set_settings_path_for_tests(None)

    def test_cache_desligado_sempre_rebundle_dentro_do_output(self, tmp_path: Path, monkeypatch):
        from app.services import pipeline_render as pr
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )

        renderer_dir = self._preparar_renderer(tmp_path)
        monkeypatch.setattr(pr.settings, "video_renderer_dir", str(renderer_dir))
        monkeypatch.setattr(pr, "projetos_dir", lambda: tmp_path / "projetos")

        AppSettingsService.set_settings_path_for_tests(tmp_path / "app_settings.json")
        AppSettingsService.update_render(RenderSettings(bundle_cache_enabled=False))

        worker_mock = self._fake_worker_que_materializa_bundle()
        monkeypatch.setattr(pr, "_executar_via_worker", worker_mock)

        try:
            output_dir_a = tmp_path / "projeto_a" / "overlays"
            output_dir_b = tmp_path / "projeto_b" / "overlays"
            output_dir_a.mkdir(parents=True)
            output_dir_b.mkdir(parents=True)

            first = asyncio.run(pr._preparar_bundle_overlay(output_dir_a))
            second = asyncio.run(pr._preparar_bundle_overlay(output_dir_b))

            # Com cache desligado, bundle vai dentro do próprio output_dir
            assert first == output_dir_a / "_remotion_bundle"
            assert second == output_dir_b / "_remotion_bundle"
            assert worker_mock.await_count == 2
        finally:
            AppSettingsService.set_settings_path_for_tests(None)


# ─────────────────────────────────────────────────────────────────────
# I-036: cascade de layout nos overlays (paridade com o preview do pós)
# ─────────────────────────────────────────────────────────────────────


class TestPrepararOverlayChunksCascadeLayout:
    """REGRESSAO I-036: um corte intocado (sentinela full + regioes vazias)
    cujo PROJETO tem padrao compartilhada renderizava os cards em modo full
    (sem layout_card_zone), tampando as janelas do palco — divergindo do
    preview, que resolve a cascade corte → projeto → global no router.
    """

    PROJETO_PADRAO = {
        "modo_padrao": "compartilhada",
        "fundo": "hud-forte",
        "compartilhada": {
            "telas": 2,
            "crop_facecam": {"x": 27, "y": 271, "w": 643, "h": 460},
            "crop_tela": {"x": 716, "y": 151, "w": 1107, "h": 619},
            "slot_facecam": {"x": 124, "y": 645, "w": 386, "h": 276},
            "slot_tela": {"x": 570, "y": 210, "w": 1273, "h": 712},
        },
    }

    def _corte_intocado(self) -> dict:
        return {
            "id": "corte-i036",
            "layout_youtube": json.dumps({"modo_padrao": "full", "regioes": []}),
            "cenas_remotion": json.dumps(
                {
                    "cenas": [
                        {"tipo": "card_informacao", "inicio": 1.0, "fim": 6.0, "texto": "x"},
                    ],
                }
            ),
        }

    def _cenas_dos_chunks(self, chunks: list[dict]) -> list[dict]:
        return [entry.cena_dict for chunk in chunks for entry in chunk["entries"]]

    def test_corte_intocado_herda_compartilhada_do_projeto(self):
        from app.services.pipeline_render import _preparar_overlay_chunks

        chunks = asyncio.run(
            _preparar_overlay_chunks(
                self._corte_intocado(),
                "vertical",
                projeto_padrao=json.dumps(self.PROJETO_PADRAO),
            )
        )

        cenas = self._cenas_dos_chunks(chunks)
        assert cenas, "chunk sem cenas"
        for cena in cenas:
            assert cena.get("layout_youtube_modo") == "compartilhada"
            zone = cena.get("layout_card_zone")
            assert zone is not None, (
                "Cena sem layout_card_zone — o card renderiza em modo full "
                "por cima das janelas do palco (I-036)."
            )
            # Zona restrita: nunca o canvas inteiro.
            assert zone["w"] < 1920 and zone["h"] < 1080

    def test_sem_padrao_do_projeto_preserva_modo_full(self):
        from app.services.pipeline_render import _preparar_overlay_chunks

        chunks = asyncio.run(_preparar_overlay_chunks(self._corte_intocado(), "vertical"))

        for cena in self._cenas_dos_chunks(chunks):
            assert cena.get("layout_youtube_modo") != "compartilhada"
            assert cena.get("layout_card_zone") is None


# ─────────────────────────────────────────────────────────────
# _find_clip_raw — deteccao robusta do bruto (D-157)
# ─────────────────────────────────────────────────────────────


def _tocar(dir_: Path, nome: str) -> Path:
    """Cria um arquivo falso (o worktree nao tem os brutos reais de 70GB)."""
    p = dir_ / nome
    p.write_bytes(b"x")
    return p


def test_find_clip_raw_prefere_canonico(tmp_path):
    # Canonico ganha mesmo com um nome-com-timestamp presente na pasta.
    _tocar(tmp_path, "clip_raw_1782788554946.mkv")
    canonico = _tocar(tmp_path, "clip_raw_base.mkv")

    assert _find_clip_raw(tmp_path) == canonico


def test_find_clip_raw_glob_por_timestamp(tmp_path):
    # Caso que falhava: so ha um bruto com timestamp, sem nome canonico.
    bruto = _tocar(tmp_path, "clip_raw_1782788554946.mkv")

    assert _find_clip_raw(tmp_path) == bruto


def test_find_clip_raw_deprioriza_backup(tmp_path):
    # Backup com silencios e ultimo recurso: perde para qualquer outro clip_raw*.
    bruto = _tocar(tmp_path, "clip_raw_123.mkv")
    _tocar(tmp_path, "clip_raw_backup_com_silencios.mkv")

    assert _find_clip_raw(tmp_path) == bruto


def test_find_clip_raw_backup_como_ultimo_recurso(tmp_path):
    # Se so ha backup, ele e devolvido (melhor que nada).
    backup = _tocar(tmp_path, "clip_raw_backup_com_silencios.mkv")

    assert _find_clip_raw(tmp_path) == backup


def test_find_clip_raw_pasta_vazia_retorna_none(tmp_path):
    assert _find_clip_raw(tmp_path) is None


# ─────────────────────────────────────────────────────────────
# _mensagem_falha_total_overlays (D-167)
# ─────────────────────────────────────────────────────────────


def _falha(chunk_id: str = "001") -> tuple[str, BaseException]:
    return (chunk_id, RuntimeError("chrome headless morreu"))


class TestMensagemFalhaTotalOverlays:
    def test_todos_os_chunks_falharam_retorna_mensagem_acionavel(self):
        """Bug D-167: 100% dos chunks falhando deve FALHAR ALTO, não concluir 'sucesso'."""
        falhados = [_falha("001"), _falha("002"), _falha("003")]
        msg = _mensagem_falha_total_overlays(falhados, total_overlays=3)
        assert msg is not None
        assert "3/3" in msg
        assert "ensure-remotion-browser" in msg

    def test_uma_falha_isolada_em_muitos_e_tolerada(self):
        """Falha pontual (1 de 10) mantém a resiliência: não derruba a fase."""
        assert _mensagem_falha_total_overlays([_falha("001")], total_overlays=10) is None

    def test_metade_faltando_atinge_o_limiar_e_falha(self):
        """Limiar é >= 50%: 2 de 4 já derruba."""
        falhados = [_falha("001"), _falha("002")]
        assert _mensagem_falha_total_overlays(falhados, total_overlays=4) is not None

    def test_abaixo_do_limiar_tolera(self):
        """1 de 4 (25%) fica abaixo do limiar e é tolerado."""
        assert _mensagem_falha_total_overlays([_falha("001")], total_overlays=4) is None

    def test_sem_falhas_nunca_derruba(self):
        assert _mensagem_falha_total_overlays([], total_overlays=5) is None

    def test_total_zero_nao_explode(self):
        assert _mensagem_falha_total_overlays([_falha("001")], total_overlays=0) is None
