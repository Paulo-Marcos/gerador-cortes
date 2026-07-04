"""Testes para `app.services.claude_ia.ClaudeIaService` (Fase 2 — análise).

Cobre a montagem do prompt/transcrição e a decisão direto-vs-lote, sem banco e
sem invocar o `claude` real (o `generate_json` é substituído por um fake).
"""

from __future__ import annotations

import asyncio

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
        assert "DESVIO" in prompt and "REPETICAO" in prompt
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

    def test_gerar_desvios_retorna_lista_do_json(self, monkeypatch):
        fake = _FakeGenerate(
            {"desvios": [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}]}
        )
        monkeypatch.setattr(claude_ia.claude_cli_client, "generate_json", fake)

        desvios = asyncio.run(
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
        assert desvios == [{"inicio_hms": "00:12:00", "fim_hms": "00:12:30", "motivo": "chat"}]

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
