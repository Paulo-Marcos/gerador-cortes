"""Testes para `app.services.claude_ia.ClaudeIaService` (Fase 2 — análise).

Cobre a montagem do prompt/transcrição e a decisão direto-vs-lote, sem banco e
sem invocar o `claude` real (o `generate_json` é substituído por um fake).
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import claude_ia
from app.services.claude_ia import ClaudeIaService

# ── helpers ───────────────────────────────────────────────────────────────────


def _seg(idx: int, inicio: float, texto: str) -> dict:
    return {"global_index": idx, "inicio": inicio, "fim": inicio + 4, "texto": texto}


class _FakeGenerate:
    """Fake async de claude_cli_client.generate_json com contagem de chamadas."""

    def __init__(self, retorno: dict):
        self.retorno = retorno
        self.chamadas = 0
        self.ultimo_prompt = ""

    async def __call__(self, prompt: str, *, model: str = "", **_kw) -> dict:
        self.chamadas += 1
        self.ultimo_prompt = prompt
        return self.retorno


# ── _formatar_segmentos ────────────────────────────────────────────────────────


class TestFormatarSegmentos:
    def test_formata_indice_timestamp_e_texto(self):
        segs = [_seg(0, 0, "primeira fala"), _seg(1, 65, "segunda fala")]
        texto = ClaudeIaService._formatar_segmentos(segs)
        assert "[0] (00:00:00) primeira fala" in texto
        assert "[1] (00:01:05) segunda fala" in texto

    def test_ignora_segmentos_sem_texto(self):
        segs = [_seg(0, 0, "  "), _seg(1, 10, "ok")]
        texto = ClaudeIaService._formatar_segmentos(segs)
        assert "ok" in texto
        assert texto.count("\n") == 0  # só uma linha

    def test_sem_mapa_nao_injeta_rotulo(self):
        """D-286: back-compat — sem mapa a saída é idêntica ao formato antigo."""
        segs = [{**_seg(0, 0, "fala"), "speaker": "SPEAKER_00"}]
        texto = ClaudeIaService._formatar_segmentos(segs)
        assert texto == "[0] (00:00:00) fala"

    def test_com_mapa_injeta_rotulo_de_falante(self):
        """D-286: com mapa, prefixa [CANAL]/[OUTRO] conforme o falante."""
        segs = [
            {**_seg(0, 0, "fala do host"), "speaker": "SPEAKER_00"},
            {**_seg(1, 10, "fala reagida"), "speaker": "SPEAKER_01"},
        ]
        mapa = {
            "SPEAKER_00": {"nome": "Pedro", "is_canal": True},
            "SPEAKER_01": {"nome": "", "is_canal": False},
        }
        texto = ClaudeIaService._formatar_segmentos(segs, mapa)
        assert "[0] (00:00:00) [CANAL: Pedro] fala do host" in texto
        assert "[1] (00:00:10) [OUTRO] fala reagida" in texto


# ── _carregar_transcricao_raw (D-203) ────────────────────────────────────────


class TestCarregarTranscricaoRaw:
    def test_json_valido_e_parseado(self):
        raw = '[{"global_index": 0, "texto": "ok"}]'
        assert claude_ia._carregar_transcricao_raw(raw, "proj-1") == [
            {"global_index": 0, "texto": "ok"}
        ]

    def test_json_corrompido_cai_para_vazio_e_loga(self, caplog):
        import logging

        with caplog.at_level(logging.WARNING):
            resultado = claude_ia._carregar_transcricao_raw("{corrompido!!", "proj-1")

        assert resultado == []
        assert "proj-1" in caplog.text
        assert "corrompida" in caplog.text


# ── _montar_prompt ──────────────────────────────────────────────────────────────


class TestMontarPrompt:
    def test_monta_contexto_sem_corpo_da_skill(self):
        prompt = ClaudeIaService._montar_prompt(
            "[0] (00:00) fala",
            {"titulo_live": "Minha Live", "youtube_url": "http://x", "duracao_segundos": 3700},
        )
        # A skill é ATIVADA via /skill (não vai no corpo); o prompt traz só o contexto.
        assert "Cortador Expert" not in prompt and "editor-chefe" not in prompt
        assert "Minha Live" in prompt
        assert "1h1m" in prompt
        assert "[0] (00:00) fala" in prompt


# ── _gerar_cortes: direto vs lote ───────────────────────────────────────────────


class TestGerarCortes:
    def test_caminho_direto_uma_chamada(self, monkeypatch):
        fake = _FakeGenerate({"cortes": [{"titulo_proposto": "A", "inicio_seg": 10}]})
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)
        monkeypatch.setattr(
            ClaudeIaService,
            "_granularizar",
            staticmethod(lambda t: [_seg(0, 0, "fala curta")]),
        )

        payload = asyncio.run(ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 100}))

        assert fake.chamadas == 1
        # I-034: payload agora é dict {cortes, descartados}.
        assert payload["cortes"] == [{"titulo_proposto": "A", "inicio_seg": 10}]
        assert payload["descartados"] == []

    def test_provider_gemini_chega_ao_gemini_e_nao_ao_claude(self, monkeypatch):
        """O `provider` precisa atravessar os métodos estáticos até o wrapper.

        Regressão: `_gerar_cortes` usava `provider` sem recebê-lo e a análise
        morria com NameError nos DOIS providers.
        """
        chamadas_gemini: list[dict] = []

        async def fake_gemini(prompt, **kwargs):
            chamadas_gemini.append(kwargs)
            return {"cortes": [{"titulo_proposto": "G", "inicio_seg": 5}]}

        fake_claude = _FakeGenerate({"cortes": []})
        monkeypatch.setattr(claude_ia.antigravity_cli_client, "generate_json", fake_gemini)
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake_claude)
        monkeypatch.setattr(
            ClaudeIaService,
            "_granularizar",
            staticmethod(lambda t: [_seg(0, 0, "fala curta")]),
        )

        payload = asyncio.run(
            ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 100}, "gemini")
        )

        assert payload["cortes"] == [{"titulo_proposto": "G", "inicio_seg": 5}]
        assert len(chamadas_gemini) == 1
        # O modelo é o Gemini DA SKILL, nunca o alias Claude (opus/sonnet/haiku).
        assert chamadas_gemini[0]["model"].startswith("gemini-")
        assert fake_claude.chamadas == 0

    def test_desvio_novo_leva_o_provider_que_o_propos(self, monkeypatch):
        """O selo da tela sai daqui: `origem` diz QUAL IA propôs o trecho."""
        from app.domain.segment_calculator import normalizar_desvio

        desvio = normalizar_desvio(
            {"inicio_hms": "00:00:01", "fim_hms": "00:00:02", "origem": "gemini"}
        )

        assert desvio["origem"] == "gemini"

    def test_caminho_direto_inclui_descartados_da_skill(self, monkeypatch):
        """I-034: o array `descartados` da skill chega ao payload via direto."""
        retorno = {
            "cortes": [{"titulo_proposto": "A", "inicio_seg": 10}],
            "descartados": [{"tema": "treta com chat", "motivo": "off-topic"}],
        }
        fake = _FakeGenerate(retorno)
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)
        monkeypatch.setattr(
            ClaudeIaService,
            "_granularizar",
            staticmethod(lambda t: [_seg(0, 0, "fala")]),
        )

        payload = asyncio.run(ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 100}))

        assert payload["descartados"] == [{"tema": "treta com chat", "motivo": "off-topic"}]

    def test_caminho_lote_quando_excede_limite_e_deduplica(self, monkeypatch):
        # Força o lote baixando o limite; fake devolve sempre o MESMO corte →
        # a deduplicação por bucket de 30s deve manter apenas 1.
        monkeypatch.setattr(claude_ia.settings, "claude_analise_max_chars_direto", 1)
        fake = _FakeGenerate({"cortes": [{"titulo_proposto": "Dup", "inicio_seg": 600}]})
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        # Segmentos cobrindo ~80 min → fatiar gera mais de uma janela.
        segs = [_seg(i, i * 600, f"fala {i}") for i in range(9)]
        monkeypatch.setattr(ClaudeIaService, "_granularizar", staticmethod(lambda t: segs))

        payload = asyncio.run(ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 5000}))

        assert fake.chamadas >= 2, "deveria ter fatiado em múltiplas janelas"
        # I-034: payload é dict.
        assert len(payload["cortes"]) == 1, "cortes duplicados no overlap deveriam ser deduplicados"

    def test_caminho_lote_deduplica_descartados_por_tema(self, monkeypatch):
        """I-034: o lote agrega `descartados` de cada janela, deduplicando
        por `tema` (case-insensitive) para não repetir entradas do overlap.
        """
        monkeypatch.setattr(claude_ia.settings, "claude_analise_max_chars_direto", 1)
        retorno = {
            "cortes": [{"titulo_proposto": "X", "inicio_seg": 600}],
            # mesmo tema repetido em cada janela com casing/espaço variando
            "descartados": [
                {"tema": "Chat", "motivo": "off-topic"},
                {"tema": "  chat ", "motivo": "off-topic"},  # mesmo tema, deve sumir
            ],
        }
        fake = _FakeGenerate(retorno)
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        segs = [_seg(i, i * 600, f"fala {i}") for i in range(9)]
        monkeypatch.setattr(ClaudeIaService, "_granularizar", staticmethod(lambda t: segs))

        payload = asyncio.run(ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 5000}))

        # Cada janela devolve 2 entradas (mesmo tema): após dedup global,
        # restam apenas 1 entrada para `Chat` em todo o payload.
        temas = [d["tema"].strip().lower() for d in payload["descartados"]]
        assert temas.count("chat") == 1, f"esperava 1 'chat' após dedup, veio {temas}"

    def test_caminho_lote_usa_a_mesma_lente_em_todos_os_chunks(self, monkeypatch):
        """D-301: a lente é sorteada UMA vez por geração (fora do loop de
        chunks), não uma nova por chunk — evita titulação inconsistente entre
        partes da mesma live."""
        monkeypatch.setattr(claude_ia.settings, "claude_analise_max_chars_direto", 1)

        prompts_enviados: list[str] = []

        async def fake_gen(prompt: str, *, model: str = "", **_kw):
            prompts_enviados.append(prompt)
            return {"cortes": []}

        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake_gen)

        skill_customizada = claude_ia.editorial_skills.SkillResolvida(
            key="cortador-expert",
            corpo="",
            modelo="x",
            thinking_tokens=0,
            timeout=60.0,
            lentes=["LENTE A", "LENTE B", "LENTE C"],
        )
        monkeypatch.setattr(
            claude_ia.editorial_skills, "resolver_skill", lambda *_a, **_k: skill_customizada
        )

        segs = [_seg(i, i * 600, f"fala {i}") for i in range(9)]
        monkeypatch.setattr(ClaudeIaService, "_granularizar", staticmethod(lambda t: segs))

        asyncio.run(ClaudeIaService._gerar_cortes([{"x": 1}], {"duracao_segundos": 5000}))

        assert len(prompts_enviados) >= 2, "deveria ter fatiado em múltiplas janelas"
        lentes_usadas = {
            lente
            for lente in skill_customizada.lentes
            if all(lente in prompt for prompt in prompts_enviados)
        }
        assert len(lentes_usadas) == 1, (
            "esperava a MESMA lente em todos os chunks, não uma nova por chunk"
        )


# ── D-298: análise aditiva (não apaga cortes) ───────────────────────────────────


class TestModoAditivoHelpers:
    """Helpers puros que sustentam o modo aditivo: dedup por bucket de 30s e
    merge de descartados por tema."""

    def test_bucket_30s_agrupa_por_janela_de_30s(self):
        # 0–29s → bucket 0; 30–59s → bucket 1; 100s → bucket 3.
        assert ClaudeIaService._bucket_30s(0) == 0
        assert ClaudeIaService._bucket_30s(29) == 0
        assert ClaudeIaService._bucket_30s(30) == 1
        assert ClaudeIaService._bucket_30s(100) == 3
        # tolera None/ausência (mesma convenção do modo lote): vira bucket 0.
        assert ClaudeIaService._bucket_30s(None) == 0

    def test_filtrar_pula_corte_no_bucket_de_um_existente(self):
        # Existe corte em 100s (bucket 3). O corte novo em 110s cai no mesmo
        # bucket → pulado; o de 700s (bucket 23) é inédito → entra.
        buckets_existentes = {ClaudeIaService._bucket_30s(100)}
        novos, pulados = ClaudeIaService._filtrar_cortes_em_buckets(
            [
                {"titulo_proposto": "dup", "inicio_seg": 110},
                {"titulo_proposto": "novo", "inicio_seg": 700},
            ],
            buckets_existentes,
        )
        assert pulados == 1
        assert [c["titulo_proposto"] for c in novos] == ["novo"]

    def test_filtrar_sem_existentes_mantem_tudo(self):
        novos, pulados = ClaudeIaService._filtrar_cortes_em_buckets(
            [{"titulo_proposto": "a", "inicio_seg": 10}], set()
        )
        assert pulados == 0
        assert len(novos) == 1

    def test_mesclar_descartados_preserva_existentes_e_dedup_por_tema(self):
        existentes = [{"tema": "velho", "motivo": "auditoria anterior"}]
        novos = [
            {"tema": "VELHO", "motivo": "repetido"},  # mesmo tema (case-insensitive) → pula
            {"tema": "  ", "motivo": "sem tema"},  # tema vazio → ignora
            {"tema": "novo tema", "motivo": "off-topic"},  # inédito → entra
        ]
        mesclados = ClaudeIaService._mesclar_descartados(existentes, novos)
        temas = [d["tema"].strip().lower() for d in mesclados]
        assert temas == ["velho", "novo tema"]

    def test_mesclar_descartados_tolera_novos_none(self):
        existentes = [{"tema": "x", "motivo": "y"}]
        assert ClaudeIaService._mesclar_descartados(existentes, None) == existentes


class TestAnaliseAditiva:
    """D-298: `analisar_via_claude` ADICIONA cortes aos existentes, sem apagar;
    pula novos que caem no bucket de 30s de um corte existente e mescla os
    descartados com a auditoria anterior."""

    def _montar_factory(self, *, inicios_existentes, descartados_existentes):
        """Fake de AsyncSessionLocal. `execute` devolve as linhas
        (inicio_seg,) dos cortes existentes; `get` devolve o projeto. Registra
        os statements executados para provar que nenhum DELETE foi emitido."""
        projeto = MagicMock()
        projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
        projeto.youtube_url = "http://x"
        projeto.titulo_live = "L"
        projeto.duracao_segundos = 60
        projeto.falantes_map = "{}"
        projeto.status = "pronto"
        projeto.descartados_analise = json.dumps(descartados_existentes)

        executados: list = []
        rows = [(s,) for s in inicios_existentes]

        async def fake_execute(stmt, *a, **k):
            executados.append(stmt)
            return MagicMock(all=lambda: rows)

        session = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock(return_value=False)
        session.get = AsyncMock(return_value=projeto)
        session.commit = AsyncMock()
        session.execute = fake_execute
        return (lambda: session), executados

    def test_adiciona_sem_apagar_pula_bucket_existente_e_mescla_descartados(self, monkeypatch):
        factory, executados = self._montar_factory(
            inicios_existentes=[100.0],  # corte existente no bucket 3
            descartados_existentes=[{"tema": "velho", "motivo": "auditoria anterior"}],
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_cortes(_transcricao, _meta, provider="claude"):
            return {
                "cortes": [
                    # 110s cai no bucket 3 (mesmo do existente) → deve ser pulado
                    {
                        "titulo_proposto": "dup",
                        "inicio_seg": 110,
                        "inicio_hms": "00:01:50",
                        "fim_hms": "00:10:00",
                    },
                    # 700s (bucket 23) é inédito → entra
                    {
                        "titulo_proposto": "novo",
                        "inicio_seg": 700,
                        "inicio_hms": "00:11:40",
                        "fim_hms": "00:20:00",
                    },
                ],
                "descartados": [
                    {"tema": "VELHO", "motivo": "repetido"},  # dedup por tema → some
                    {"tema": "novo tema", "motivo": "off-topic"},
                ],
            }

        monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

        repasse: dict = {}

        async def fake_importar(projeto_id, cortes_data, *, descartados=None, origem="claude"):
            repasse["projeto_id"] = projeto_id
            repasse["cortes"] = cortes_data
            repasse["descartados"] = descartados

        monkeypatch.setattr(
            claude_ia.AnaliseService, "importar_resultado", staticmethod(fake_importar)
        )

        resultado = asyncio.run(
            ClaudeIaService.analisar_via_claude("p1", encadear_transcricao=False)
        )

        # Nenhum DELETE emitido → os cortes existentes são preservados.
        assert not any(type(s).__name__ == "Delete" for s in executados), (
            "modo aditivo NÃO deve apagar cortes existentes"
        )
        # Só o corte inédito foi importado; a quase-duplicata do bucket foi pulada.
        assert [c["titulo_proposto"] for c in repasse["cortes"]] == ["novo"]
        # Descartados mesclados: preserva o antigo, dedup por tema, soma o inédito.
        temas = [d["tema"].strip().lower() for d in repasse["descartados"]]
        assert temas == ["velho", "novo tema"]
        # O retorno expõe quantos entraram e quantos foram pulados.
        assert resultado == {
            "total_cortes": 1,
            "pulados_existentes": 1,
            "total_descartados": 2,
        }

    def test_projeto_sem_cortes_importa_tudo_sem_pular(self, monkeypatch):
        factory, executados = self._montar_factory(inicios_existentes=[], descartados_existentes=[])
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_cortes(_transcricao, _meta, provider="claude"):
            return {
                "cortes": [
                    {
                        "titulo_proposto": "a",
                        "inicio_seg": 10,
                        "inicio_hms": "00:00:10",
                        "fim_hms": "00:05:00",
                    },
                    {
                        "titulo_proposto": "b",
                        "inicio_seg": 600,
                        "inicio_hms": "00:10:00",
                        "fim_hms": "00:15:00",
                    },
                ],
                "descartados": [],
            }

        monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

        repasse: dict = {}

        async def fake_importar(projeto_id, cortes_data, *, descartados=None, origem="claude"):
            repasse["cortes"] = cortes_data

        monkeypatch.setattr(
            claude_ia.AnaliseService, "importar_resultado", staticmethod(fake_importar)
        )

        resultado = asyncio.run(
            ClaudeIaService.analisar_via_claude("p1", encadear_transcricao=False)
        )

        assert len(repasse["cortes"]) == 2
        assert resultado["total_cortes"] == 2
        assert resultado["pulados_existentes"] == 0


# ── Fase 2b: trechos a remover (desvios) de um corte ────────────────────────────


class TestTrechos:
    def test_montar_prompt_trechos_inclui_intervalo(self):
        cabecalho = ClaudeIaService._cabecalho_meta_corte(
            {
                "titulo": "Corte X",
                "tema_central": "tese",
                "inicio_hms": "00:10:00",
                "fim_hms": "00:25:00",
            },
            [],
        )
        prompt = ClaudeIaService._montar_prompt_trechos(
            "(00:00:00) fala",
            cabecalho,
            1,
            1,
        )
        # D-330: o scaffold magro não fixa mais os tipos DESVIO/REPETICAO (agora
        # vivem no corpo v2); ele delega a marcação à expertise via a chave `desvios`.
        assert "desvios" in prompt and "expertise" in prompt
        assert "Corte X" in prompt
        assert "00:10:00" in prompt and "00:25:00" in prompt

    def test_montar_prompt_trechos_lista_ja_marcados(self):
        cabecalho = ClaudeIaService._cabecalho_meta_corte(
            {"titulo": "C", "tema_central": "t", "inicio_hms": "00:00:00", "fim_hms": "00:30:00"},
            [{"inicio_hms": "00:05:00", "fim_hms": "00:05:30", "motivo": "chat"}],
        )
        prompt = ClaudeIaService._montar_prompt_trechos(
            "(00:00:00) fala",
            cabecalho,
            1,
            1,
        )
        assert "JÁ MARCADOS" in prompt
        assert "00:05:00" in prompt and "chat" in prompt
        assert "APENAS NOVOS" in prompt

    def test_montar_prompt_trechos_marca_chunk_quando_houver_multiplas_partes(self):
        cabecalho = ClaudeIaService._cabecalho_meta_corte(
            {"titulo": "C", "tema_central": "t", "inicio_hms": "00:00:00", "fim_hms": "01:30:00"},
            [],
        )
        prompt = ClaudeIaService._montar_prompt_trechos(
            "(00:00:00) fala",
            cabecalho,
            2,
            3,
        )
        assert "PARTE 2 de 3" in prompt

    def test_gerar_desvios_retorna_so_desvios_e_ignora_revisoes(self, monkeypatch):
        """D-332: o retorno agrega só `desvios` dos chunks; um `revisoes` no JSON
        (skill v2-com-revisão legada) é IGNORADO — a revisão automática foi
        revogada."""
        fake = _FakeGenerate(
            {
                "desvios": [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}],
                "revisoes": [{"acao": "remover", "inicio_hms": "00:15:00", "fim_hms": "00:15:20"}],
            }
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        resultado = asyncio.run(
            ClaudeIaService._gerar_desvios(
                [{"start": 0, "end": 4, "texto": "x"}],
                {
                    "titulo": "C",
                    "tema_central": "t",
                    "inicio_hms": "00:10:00",
                    "fim_hms": "00:25:00",
                },
                [],
            )
        )

        assert fake.chamadas == 1
        assert resultado["desvios"] == [
            {"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}
        ]
        # a chave `revisoes` não é mais propagada
        assert "revisoes" not in resultado

    def test_gerar_desvios_loga_impressao_digital_da_skill(self, monkeypatch, caplog):
        """D-331: antes de chamar o cliente, sai UMA linha [ClaudeIA/skill] com o
        sha1 do corpo da skill resolvida — para o operador confirmar por log qual
        skill (corpo/scaffold/versão) realmente entrou na geração."""
        import logging

        fake = _FakeGenerate({"desvios": [], "revisoes": []})
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        with caplog.at_level(logging.INFO, logger="app.services.claude_ia"):
            asyncio.run(
                ClaudeIaService._gerar_desvios(
                    [{"start": 0, "end": 4, "texto": "x"}],
                    {"titulo": "C", "tema_central": "t", "inicio_hms": "0", "fim_hms": "0"},
                    [],
                )
            )

        linhas_skill = [ln for ln in caplog.text.splitlines() if "[ClaudeIA/skill]" in ln]
        assert len(linhas_skill) == 1, "deve sair exatamente uma linha de impressão digital"
        linha = linhas_skill[0]
        assert "etapa=trechos-expert" in linha
        # o sha da linha bate com o sha1 do corpo da skill trechos-expert resolvida
        skill = claude_ia.editorial_skills.resolver_skill(claude_ia._SKILL_TRECHOS)
        assert f"sha={claude_ia._sha1_curto(skill.corpo)}" in linha
        # a etapa de trechos monta scaffold → o scaffold_sha também sai na linha
        assert "scaffold_sha=" in linha

    def test_gerar_desvios_sem_chave_revisoes_nao_quebra(self, monkeypatch):
        """Back-compat: skill que só devolve `desvios` (sem `revisoes`) flui
        normalmente e o retorno traz só os desvios."""
        fake = _FakeGenerate(
            {"desvios": [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}]}
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        resultado = asyncio.run(
            ClaudeIaService._gerar_desvios(
                [{"start": 0, "end": 4, "texto": "x"}],
                {"titulo": "C", "tema_central": "t", "inicio_hms": "0", "fim_hms": "0"},
                [],
            )
        )

        assert resultado["desvios"] == [
            {"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}
        ]
        assert "revisoes" not in resultado

    def test_mesclar_desvios_so_adiciona_nao_remove(self):
        existentes = [
            {"inicio_seg": 100.0, "fim_seg": 120.0, "motivo": "manual A"},
            {"inicio_seg": 300.0, "fim_seg": 320.0, "motivo": "manual B"},
        ]
        novos = [
            {
                "inicio_seg": 100.5,
                "fim_seg": 120.0,
                "motivo": "claude dup de A",
            },  # ~igual a A → pula
            {"inicio_seg": 500.0, "fim_seg": 520.0, "motivo": "claude novo"},  # novo → entra
        ]
        mesclados, adicionados = ClaudeIaService._mesclar_desvios(existentes, novos)

        assert adicionados == 1, "só o genuinamente novo deve entrar"
        assert len(mesclados) == 3
        # nenhum existente foi removido
        motivos = [d["motivo"] for d in mesclados]
        assert "manual A" in motivos and "manual B" in motivos and "claude novo" in motivos


# ── D-332: gerar trechos é aditivo PURO (não remove nem revisa) ─────────────────


def _desvio(inicio_hms: str, fim_hms: str, motivo: str, origem: str | None = None) -> dict:
    from app.domain.segment_calculator import normalizar_desvio

    bruto = {"inicio_hms": inicio_hms, "fim_hms": fim_hms, "motivo": motivo}
    if origem:
        bruto["origem"] = origem
    return normalizar_desvio(bruto)


class TestGerarTrechosAditivoPuro:
    """D-332 (regressão da D-302): "gerar trechos" volta a ser CUMULATIVO — soma
    os desvios novos e NUNCA remove nem ajusta os já marcados (manual OU claude);
    a revisão automática foi revogada. Um `revisoes` no JSON da skill é ignorado."""

    def _montar_factory(self, *, desvios_existentes: list, desvios_novos: list):
        """Fake de AsyncSessionLocal para gerar_trechos_via_claude. `db.get`
        despacha por classe (Corte/Projeto). Guarda o JSON final gravado em
        `corte.desvios` para o teste inspecionar."""
        corte = MagicMock()
        corte.transcricao_corte = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
        corte.desvios = json.dumps(desvios_existentes)
        corte.titulo_proposto = "Corte X"
        corte.tema_central = "tese"
        corte.inicio_hms = "00:00:00"
        corte.fim_hms = "00:30:00"
        corte.inicio_seg = 0.0
        corte.fim_seg = 1800.0
        corte.projeto_id = "p1"
        corte.trechos_geracoes = 0
        corte.trechos_geracoes_log = "[]"

        projeto = MagicMock()
        projeto.falantes_map = "{}"  # sem diarização → mapa None
        projeto.transcricao_raw = None

        async def fake_get(model, _id):
            return projeto if model is claude_ia.Projeto else corte

        session = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock(return_value=False)
        session.get = fake_get
        session.commit = AsyncMock()
        return (lambda: session), corte

    def test_preserva_manual_e_claude_existentes_e_soma_novos(self, monkeypatch):
        # Um desvio manual (sem origem) e um de origem 'claude' já marcados.
        manual = _desvio("00:05:00", "00:05:30", "manual do editor")
        claude_ant = _desvio("00:10:00", "00:10:20", "chat", origem="claude")
        factory, corte = self._montar_factory(
            desvios_existentes=[manual, claude_ant],
            desvios_novos=[],
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_desvios(_transc, _meta, _existentes, _mapa=None, provider="claude"):
            # A skill devolve um desvio NOVO, um DUPLICADO do manual (deve pular)
            # e — como skill v2-com-revisão legada — um `revisoes` que mandaria
            # remover o desvio 'claude'. A revogação IGNORA `revisoes`.
            return {
                "desvios": [
                    {"inicio_hms": "00:20:00", "fim_hms": "00:20:15", "motivo": "novo"},
                    {"inicio_hms": "00:05:00", "fim_hms": "00:05:30", "motivo": "dup do manual"},
                ],
                "revisoes": [{"acao": "remover", "inicio_hms": "00:10:00", "fim_hms": "00:10:20"}],
            }

        monkeypatch.setattr(ClaudeIaService, "_gerar_desvios", staticmethod(fake_gerar_desvios))

        sincronizados: list = []

        async def fake_sync(corte_id):
            sincronizados.append(corte_id)

        from app.services.corte import CorteService

        monkeypatch.setattr(CorteService, "sincronizar_transcricao_corte", staticmethod(fake_sync))

        resultado = asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))

        gravados = json.loads(corte.desvios)
        motivos = [d["motivo"] for d in gravados]
        # Os DOIS existentes foram preservados (revisão não removeu o 'claude').
        assert "manual do editor" in motivos
        assert "chat" in motivos
        # O novo entrou; a duplicata do manual foi pulada.
        assert "novo" in motivos
        assert "dup do manual" not in motivos
        assert resultado == {"total_desvios": 3, "novos": 1}
        # ressincronizou a transcrição final do corte
        assert sincronizados == ["c1"]
        # D-334: uma invocação incrementa o contador e loga a chamada
        assert corte.trechos_geracoes == 1
        log = json.loads(corte.trechos_geracoes_log)
        assert len(log) == 1
        assert log[0]["adicionados"] == 1
        assert log[0]["total_apos"] == 3
        assert "em" in log[0]

    def test_sem_desvios_novos_mantem_tudo(self, monkeypatch):
        manual = _desvio("00:05:00", "00:05:30", "manual do editor")
        claude_ant = _desvio("00:10:00", "00:10:20", "chat", origem="claude")
        factory, corte = self._montar_factory(
            desvios_existentes=[manual, claude_ant],
            desvios_novos=[],
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_desvios(_transc, _meta, _existentes, _mapa=None, provider="claude"):
            return {"desvios": []}  # skill sem nada novo, sem chave revisoes

        monkeypatch.setattr(ClaudeIaService, "_gerar_desvios", staticmethod(fake_gerar_desvios))

        from app.services.corte import CorteService

        monkeypatch.setattr(
            CorteService, "sincronizar_transcricao_corte", staticmethod(AsyncMock())
        )

        resultado = asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))

        gravados = json.loads(corte.desvios)
        assert [d["motivo"] for d in gravados] == ["manual do editor", "chat"]
        assert resultado == {"total_desvios": 2, "novos": 0}
        # D-334: mesmo sem desvios novos, a invocação em si conta
        assert corte.trechos_geracoes == 1
        log = json.loads(corte.trechos_geracoes_log)
        assert len(log) == 1
        assert log[0]["adicionados"] == 0
        assert log[0]["total_apos"] == 2

    def test_chamadas_sucessivas_acumulam_contador_e_log(self, monkeypatch):
        """Uma segunda invocação incrementa o contador e ACRESCENTA ao log (não
        substitui) — cobre o caso de vários cliques no botão por-corte."""
        manual = _desvio("00:05:00", "00:05:30", "manual do editor")
        factory, corte = self._montar_factory(
            desvios_existentes=[manual],
            desvios_novos=[],
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_desvios(_transc, _meta, _existentes, _mapa=None, provider="claude"):
            return {"desvios": [{"inicio_hms": "00:20:00", "fim_hms": "00:20:15", "motivo": "x"}]}

        monkeypatch.setattr(ClaudeIaService, "_gerar_desvios", staticmethod(fake_gerar_desvios))

        from app.services.corte import CorteService

        monkeypatch.setattr(
            CorteService, "sincronizar_transcricao_corte", staticmethod(AsyncMock())
        )

        asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))
        asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))

        assert corte.trechos_geracoes == 2
        log = json.loads(corte.trechos_geracoes_log)
        assert len(log) == 2


# ── D-339: snap dos desvios do Claude na borda real de palavra ──────────────────


class TestSnapDesviosNoFluxo:
    """D-339: em `gerar_trechos_via_claude`, cada desvio NOVO do Claude é encaixado
    na borda real de palavra (via `snap_desvios`) ANTES do merge; os desvios já
    existentes (manual/claude anterior) NÃO são snapados nem alterados. Sem timing
    por palavra (corte antigo), é no-op — back-compat."""

    def _montar_factory(self, *, desvios_existentes: list, transcricao_raw):
        corte = MagicMock()
        corte.transcricao_corte = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
        corte.desvios = json.dumps(desvios_existentes)
        corte.titulo_proposto = "Corte X"
        corte.tema_central = "tese"
        corte.inicio_hms = "00:00:00"
        corte.fim_hms = "00:30:00"
        corte.inicio_seg = 0.0
        corte.fim_seg = 1800.0
        corte.projeto_id = "p1"
        corte.trechos_geracoes = 0
        corte.trechos_geracoes_log = "[]"

        projeto = MagicMock()
        projeto.falantes_map = "{}"  # sem diarização → mapa None
        projeto.transcricao_raw = (
            json.dumps(transcricao_raw) if transcricao_raw is not None else None
        )

        async def fake_get(model, _id):
            return projeto if model is claude_ia.Projeto else corte

        session = AsyncMock()
        session.__aenter__ = AsyncMock(return_value=session)
        session.__aexit__ = AsyncMock(return_value=False)
        session.get = fake_get
        session.commit = AsyncMock()
        return (lambda: session), corte

    def test_snapa_novo_do_claude_mas_nao_os_existentes(self, monkeypatch):
        # A raw do projeto carrega o timing por palavra (D-337).
        transcricao_raw = [
            {
                "inicio": "00:01:40",
                "fim": "00:01:46",
                "texto": "a b c d",
                "palavras": [
                    {"texto": "a", "inicio_seg": 100.0},
                    {"texto": "b", "inicio_seg": 100.6},
                    {"texto": "c", "inicio_seg": 101.2},
                    {"texto": "d", "inicio_seg": 102.0},
                ],
            },
            # Palavra perto da borda do desvio manual (300.0) — se o manual fosse
            # snapado, iria para 300.4; provamos que NÃO é.
            {
                "inicio": "00:05:00",
                "fim": "00:05:02",
                "texto": "x",
                "palavras": [{"texto": "x", "inicio_seg": 300.4}],
            },
        ]
        # Desvio manual já marcado (sem origem), numa borda mid-palavra de propósito.
        manual = _desvio("00:05:00", "00:05:30", "manual do editor")
        factory, corte = self._montar_factory(
            desvios_existentes=[manual],
            transcricao_raw=transcricao_raw,
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_desvios(_transc, _meta, _existentes, _mapa=None, provider="claude"):
            # Início/fim caídos no meio das palavras: 100.2 → 100.0; 101.5 → 101.2.
            return {
                "desvios": [
                    {"inicio_hms": "00:01:40.200", "fim_hms": "00:01:41.500", "motivo": "novo"}
                ]
            }

        monkeypatch.setattr(ClaudeIaService, "_gerar_desvios", staticmethod(fake_gerar_desvios))

        from app.services.corte import CorteService

        monkeypatch.setattr(
            CorteService, "sincronizar_transcricao_corte", staticmethod(AsyncMock())
        )

        asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))

        gravados = json.loads(corte.desvios)
        por_motivo = {d["motivo"]: d for d in gravados}

        # O desvio NOVO do Claude foi encaixado na borda real de palavra.
        novo = por_motivo["novo"]
        assert novo["inicio_seg"] == 100.0, "início deveria snapar para a palavra 'a'"
        assert novo["fim_seg"] == 101.2, "fim deveria snapar para a borda de 'c'"

        # O desvio manual EXISTENTE não foi snapado (continua 300.0, não 300.4).
        manual_gravado = por_motivo["manual do editor"]
        assert manual_gravado["inicio_seg"] == 300.0

    def test_sem_palavras_na_raw_e_no_op(self, monkeypatch):
        """Corte antigo: a raw não tem `palavras` → o desvio novo entra sem snap."""
        transcricao_raw = [{"inicio": "00:01:40", "fim": "00:01:46", "texto": "a b c d"}]
        factory, corte = self._montar_factory(
            desvios_existentes=[],
            transcricao_raw=transcricao_raw,
        )
        monkeypatch.setattr(claude_ia, "AsyncSessionLocal", factory)

        async def fake_gerar_desvios(_transc, _meta, _existentes, _mapa=None, provider="claude"):
            return {
                "desvios": [
                    {"inicio_hms": "00:01:40.200", "fim_hms": "00:01:41.500", "motivo": "novo"}
                ]
            }

        monkeypatch.setattr(ClaudeIaService, "_gerar_desvios", staticmethod(fake_gerar_desvios))

        from app.services.corte import CorteService

        monkeypatch.setattr(
            CorteService, "sincronizar_transcricao_corte", staticmethod(AsyncMock())
        )

        asyncio.run(ClaudeIaService.gerar_trechos_via_claude("c1"))

        gravados = json.loads(corte.desvios)
        novo = next(d for d in gravados if d["motivo"] == "novo")
        # Sem timing por palavra → tempos ficam como propostos (100.2 / 101.5).
        assert novo["inicio_seg"] == 100.2
        assert novo["fim_seg"] == 101.5


class TestTrechosComFalantes:
    """D-302: em projeto diarizado, os chunks do prompt de trechos saem com o
    rótulo [CANAL]/[OUTRO] (regra: pausa por troca de falante ≠ enrolação)."""

    _MAPA = {
        "SPEAKER_00": {"nome": "Pedro", "is_canal": True},
        "SPEAKER_01": {"nome": "", "is_canal": False},
    }

    def test_formatar_chunk_prefixa_falante_com_mapa(self):
        chunk = [
            {"start": 0, "end": 4, "texto": "fala do host", "speaker": "SPEAKER_00"},
            {"start": 10, "end": 14, "texto": "fala reagida", "speaker": "SPEAKER_01"},
        ]
        texto = ClaudeIaService._formatar_chunk_para_prompt(chunk, self._MAPA)
        assert "(00:00:00) [CANAL: Pedro] fala do host" in texto
        assert "(00:00:10) [OUTRO] fala reagida" in texto

    def test_formatar_chunk_sem_mapa_sai_identico_ao_formato_antigo(self):
        chunk = [{"start": 0, "end": 4, "texto": "fala", "speaker": "SPEAKER_00"}]
        assert ClaudeIaService._formatar_chunk_para_prompt(chunk) == "(00:00:00) fala"

    def test_anotar_falantes_reaproveita_diarizacao_do_projeto(self):
        # transcricao_corte não guarda speaker; a raw do projeto (diarizada) sim.
        transcricao_bruta = [{"start": 5.0, "end": 8.0, "texto": "fala"}]
        transcricao_raw = [
            {"inicio": "00:00:00", "fim": "00:00:04", "texto": "x", "speaker": "SPEAKER_01"},
            {"inicio": "00:00:04", "fim": "00:00:12", "texto": "fala", "speaker": "SPEAKER_00"},
        ]
        anotada = ClaudeIaService._anotar_falantes_do_projeto(transcricao_bruta, transcricao_raw)
        assert anotada[0]["speaker"] == "SPEAKER_00"

    def test_anotar_falantes_sem_diarizacao_devolve_intacto(self):
        transcricao_bruta = [{"start": 5.0, "end": 8.0, "texto": "fala"}]
        transcricao_raw = [{"inicio": "00:00:00", "fim": "00:00:04", "texto": "x"}]  # sem speaker
        assert (
            ClaudeIaService._anotar_falantes_do_projeto(transcricao_bruta, transcricao_raw)
            is transcricao_bruta
        )

    def test_cabecalho_so_lista_ja_marcados_sem_revisao(self):
        """D-332: os já marcados são apenas LISTADOS (não repita; APENAS NOVOS);
        sem rótulos [REVISÁVEL]/[PROTEGIDO] nem contrato de `revisoes` (revogados)."""
        existentes = [
            _desvio("00:05:00", "00:05:30", "chat", origem="claude"),
            _desvio("00:10:00", "00:10:20", "manual do editor"),
        ]
        cabecalho = ClaudeIaService._cabecalho_meta_corte(
            {"titulo": "C", "tema_central": "t", "inicio_hms": "00:00:00", "fim_hms": "00:30:00"},
            existentes,
        )
        # lista os dois motivos, com a instrução de propor só novos
        assert "chat" in cabecalho and "manual do editor" in cabecalho
        assert "APENAS NOVOS" in cabecalho
        # nada de revisão: sem rótulos nem contrato de `revisoes`
        assert "REVISÁVEL" not in cabecalho
        assert "PROTEGIDO" not in cabecalho
        assert "revisoes" not in cabecalho


# ── Fase 3: cenas e metadados via Claude ────────────────────────────────────────


class TestCenasMetadados:
    def test_gerar_cenas_concatena_partes_e_importa(self, monkeypatch):
        from app.services.cenas_remotion import CenasRemotionService

        async def fake_montar(_corte_id):
            return {"prompts": [{"texto": "PARTE 1"}, {"texto": "PARTE 2"}]}

        capturado: dict = {}

        async def fake_importar(_corte_id, payload):
            capturado["payload"] = payload
            return payload

        chamadas = {"n": 0}

        async def fake_gen(_prompt, *, model="", **_kw):
            chamadas["n"] += 1
            return {"cenas": [{"tipo": "ficha", "i": chamadas["n"]}]}

        monkeypatch.setattr(CenasRemotionService, "montar_prompt", staticmethod(fake_montar))
        monkeypatch.setattr(CenasRemotionService, "importar_cenas", staticmethod(fake_importar))
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake_gen)

        resultado = asyncio.run(ClaudeIaService.gerar_cenas_via_claude("c1"))

        assert resultado == {"total_cenas": 2}, "deve concatenar as cenas das 2 partes"
        assert len(capturado["payload"]["cenas"]) == 2

    def test_gerar_metadados_usa_contexto_puro_e_skill(self, monkeypatch):
        """Espelha o fluxo da thumbnail: contexto puro + skill carrega expertise.

        O prompt enviado ao Claude deve trazer transcrição e histórico de
        títulos, e a skill `metadados-expert` deve ser ativada pelo parâmetro
        skill — não injetada no corpo do prompt.
        """
        from app.services.metadados import MetadadosService

        async def fake_ctx(_corte_id):
            return {
                "titulo_proposto": "Título Proposto",
                "tema": "filosofia política",
                "resumo": "resumo antigo",
                "numero_corte": 7,
                "transcricao": "fala real do corte",
                # D-342: o prompt passou a usar a transcrição marcada ([MM:SS])
                # para o modelo ancorar os capítulos.
                "transcricao_marcada": "[00:00] fala real do corte",
                "historico_titulos": "- Anterior 1\n- Anterior 2",
            }

        capturado: dict = {}

        async def fake_importar(_corte_id, resultado):
            capturado["resultado"] = resultado

        async def fake_gen(prompt, *, model="", skill=None, **_kw):
            capturado["enviado"] = prompt
            capturado["skill"] = skill
            return {"opcoes_titulo": ["t1"], "sinopse": "uma sinopse", "hashtags": ["tag"]}

        monkeypatch.setattr(MetadadosService, "montar_contexto_meta", staticmethod(fake_ctx))
        monkeypatch.setattr(
            MetadadosService, "importar_resultado_meta", staticmethod(fake_importar)
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake_gen)

        resultado = asyncio.run(ClaudeIaService.gerar_metadados_via_claude("c1"))

        assert resultado == {"ok": True}
        assert capturado["resultado"]["sinopse"] == "uma sinopse"
        # skill ativada nativamente, não injetada no corpo
        assert capturado["skill"] == "metadados-expert"
        # input do corte presente no prompt
        assert "fala real do corte" in capturado["enviado"]
        assert "Anterior 1" in capturado["enviado"]
        assert "titulo_proposto: Título Proposto" in capturado["enviado"]
        # regras detalhadas vivem na skill, NÃO replicadas no corpo
        assert "LISTA NEGRA" not in capturado["enviado"]
        assert "Tese-síntese" not in capturado["enviado"]


# ── Fase 4: prompt de thumbnail via Claude ──────────────────────────────────────


class TestPromptThumbnail:
    def test_usa_skill_contexto_e_salva_texto_sem_fences(self, monkeypatch):
        from app.services.metadados import MetadadosService

        async def fake_ctx(_corte_id):
            return {
                "tema": "catastrofismo",
                "titulo_youtube": "T",
                "texto_capa": "C",
                "resumo": "r",
                "transcricao": "fala do corte",
                "historico_visual": "—",
            }

        capturado: dict = {}

        async def fake_importar(_corte_id, prompt_thumbnail):
            capturado["salvo"] = prompt_thumbnail

        async def fake_gen_text(prompt, *, model="", skill=None, **_kw):
            capturado["enviado"] = prompt
            capturado["skill"] = skill
            capturado["thinking"] = _kw.get("thinking_tokens")
            return "```\nEditorial 2D thumbnail, 16:9 ... MAIN CHARACTER ...\n```"

        monkeypatch.setattr(MetadadosService, "montar_contexto_thumbnail", staticmethod(fake_ctx))
        monkeypatch.setattr(
            MetadadosService, "importar_prompt_thumbnail", staticmethod(fake_importar)
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_text", fake_gen_text)

        resultado = asyncio.run(ClaudeIaService.gerar_prompt_thumbnail_via_claude("c1"))

        assert resultado == {"ok": True}
        # cercas de markdown removidas do que foi salvo
        assert capturado["salvo"].startswith("Editorial 2D thumbnail")
        assert "```" not in capturado["salvo"]
        # a skill é ATIVADA nativamente (via skill=), não injetada no corpo do prompt
        assert capturado["skill"] == "thumbnail-prompt-expert"
        assert "Capista" not in capturado["enviado"]
        # os dados do corte entraram no prompt
        assert "catastrofismo" in capturado["enviado"]
        # I-038: o menu fixo de roupa foi removido do inline
        assert "REPERTÓRIO DE ROUPA" not in capturado["enviado"]
        # I-038: os menus inline de câmera foram abertos (sem enumerar opções)
        assert "contra-plongée" not in capturado["enviado"]
        # I-038: o eixo de luminosidade entrou no contrato de saída
        assert "luminosidade=" in capturado["enviado"]
        # I-038: thinking ligado neste caminho (qualidade sobre velocidade)
        assert capturado["thinking"] and capturado["thinking"] > 0

    def test_texto_vazio_levanta(self, monkeypatch):
        from app.services.metadados import MetadadosService

        async def fake_ctx(_corte_id):
            return {
                "tema": "",
                "titulo_youtube": "",
                "texto_capa": "",
                "resumo": "",
                "transcricao": "",
                "historico_visual": "",
            }

        async def fake_gen_text(_prompt, *, model="", **_kw):
            return "   "

        monkeypatch.setattr(MetadadosService, "montar_contexto_thumbnail", staticmethod(fake_ctx))
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_text", fake_gen_text)

        with pytest.raises(ValueError):
            asyncio.run(ClaudeIaService.gerar_prompt_thumbnail_via_claude("c1"))

    def _rodar_prompt_thumbnail(self, monkeypatch, nome_mascote: str, *, is_fire: bool) -> str:
        """Roda a geração de prompt de thumbnail com um mascote dado e devolve o
        prompt enviado ao Claude (fakes isolam banco/CLI). Helper de D-221."""
        from app.editorial_identity import Mascote
        from app.services.metadados import MetadadosService

        async def fake_ctx(_corte_id):
            return {
                "tema": "x",
                "titulo_youtube": "T",
                "texto_capa": "C",
                "resumo": "r",
                "transcricao": "fala",
                "historico_visual": "—",
                "is_fire": is_fire,
                "is_leitura": False,
            }

        capturado: dict = {}

        async def fake_importar(_corte_id, prompt_thumbnail):
            capturado["salvo"] = prompt_thumbnail

        async def fake_gen_text(prompt, *, model="", skill=None, **_kw):
            capturado["enviado"] = prompt
            return "prompt final da capa"

        monkeypatch.setattr(MetadadosService, "montar_contexto_thumbnail", staticmethod(fake_ctx))
        monkeypatch.setattr(
            MetadadosService, "importar_prompt_thumbnail", staticmethod(fake_importar)
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_text", fake_gen_text)
        monkeypatch.setattr(claude_ia, "identidade_do_mascote", lambda: Mascote(nome=nome_mascote))

        asyncio.run(ClaudeIaService.gerar_prompt_thumbnail_via_claude("c1"))
        return capturado["enviado"]

    def test_nome_do_mascote_vem_do_instance_editorial(self, monkeypatch):
        """E-010 (não-regressão PROD): com nome='Sapo' o prompt reproduz o texto
        anterior ('ombro do Sapo', 'Sapo sozinho é fallback'); o nome saiu do
        código e agora vem do instance/editorial."""
        enviado = self._rodar_prompt_thumbnail(monkeypatch, "Sapo", is_fire=True)

        assert "ombro do Sapo" in enviado
        assert "Sapo sozinho é fallback" in enviado
        # As chaves das VARIATION_TAGS ficaram neutras (não mais *_sapo).
        assert "relacao_mascote_personagens=" in enviado
        assert "escala_mascote=" in enviado
        assert "relacao_sapo_personagens" not in enviado
        assert "escala_sapo=" not in enviado

    def test_fallback_neutro_no_prompt_da_thumbnail(self, monkeypatch):
        """Sem instance/editorial, o prompt fala de um 'mascote' genérico."""
        enviado = self._rodar_prompt_thumbnail(monkeypatch, "mascote", is_fire=True)

        assert "ombro do mascote" in enviado
        assert "mascote sozinho é fallback" in enviado
