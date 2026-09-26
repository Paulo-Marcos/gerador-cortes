"""Os chunks de overlay: criar, agrupar, remapear as cenas, filtrar o que já
existe, montar a composição e isolar a falha de um chunk no lote.

Parte do antigo test_pipeline_render.py (1927 linhas), dividido por assunto
no D-719. Os testes são os mesmos; só mudaram de arquivo.
"""

import asyncio
from pathlib import Path

import pytest
from app.infrastructure.render.overlay_codec import overlay_codec_profile
from app.infrastructure.render.overlay_metadata import OverlayEntry
from app.services.render.pipeline_render import (
    _agrupar_overlay_chunks,
    _construir_cenas_chunk_relativas,
    _criar_overlay_chunk,
    _filtrar_chunks_pendentes,
    _localizar_overlay_existente,
    _mensagem_falha_total_overlays,
    _resolver_overlays_para_composicao,
)

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
# Isolamento de falha em batch (gather return_exceptions)
# ─────────────────────────────────────────────────────────────


class TestBatchIsoladoSobFalha:
    """Garante que falha de 1 chunk não derruba os outros, e que o
    batch retorna a lista dos que falharam após esgotar as retries."""

    def test_dois_chunks_um_falha_outro_segue(self, tmp_path, monkeypatch):
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

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
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

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
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

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
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

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
        from app.services.app_settings import (
            AppSettingsService,
            RenderSettings,
        )
        from app.services.render import pipeline_render as pr

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
