"""Testes dos prompts utilitários por canal (D-348).

Cobrem o contrato do `prompts_utilitarios` no mesmo espírito de
`test_editorial_scaffolds`: banco como fonte da verdade, seed idempotente a partir
do default versionado, o guardrail do contrato e as fachadas de gestão. Tudo
isolado por `tmp_path` (um `settings.db` por teste); os DEFAULTS vêm de
`examples/instance.example/editorial/prompts` reais.

Inclui a NÃO-REGRESSÃO: cada default versionado, formatado com os dados
computados, reproduz EXATAMENTE o prompt que estava HARDCODED nos serviços antes
do D-348 (oráculos = cópias fiéis das strings antigas).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from app import prompts_utilitarios

_CANAL = "canal-teste"


def _kw(tmp_path: Path) -> dict:
    return {"db_path": tmp_path / "settings.db", "channel_id": _CANAL}


# ─── Oráculos: cópias fiéis das strings HARDCODED (pré-D-348) ────────────────


def _oraculo_sentimento(comentarios: str) -> str:
    # Cópia fiel do `prompt` inline em `avaliar_sentimento_dos_comentarios`.
    return (
        "Você analisa o tom dos comentários do público de uma LIVE de "
        "política/filosofia/cultura. Devolva JSON puro nesse formato:\n"
        '{"score": <inteiro 0-10>, "destaques": ["frase curta", ...]}\n\n'
        "Regras:\n"
        '- 10 = entusiasmo claro ("melhor live", "obrigado", '
        '"esclarecedor"). 0 = rejeição/repulsa.\n'
        "- 5 = neutro/genérico.\n"
        "- destaques: até 3 frases curtas (≤80 chars) que justifiquem a nota; "
        "extraia trechos reais dos comentários abaixo, sem inventar.\n"
        "- Likes em (👍 N) indicam quão amplificado o comentário é — pese mais.\n"
        "- Ignore ironia óbvia.\n\n"
        "COMENTÁRIOS:\n" + comentarios + "\n\n"
        "Responda APENAS o JSON, sem comentário em volta."
    )


def _oraculo_padroes(total_melhores: int, com_tags: int, eixos: str, exemplos: str) -> str:
    # Cópia fiel do `_montar_prompt` inline em `services/padroes_thumbnail`.
    return (
        "Você é um diretor de arte editorial analisando os prompts de thumbnail "
        "MELHOR AVALIADOS de um canal. O objetivo é "
        "descobrir o que os melhores têm em comum para refinar a skill do "
        "Capista que os gera.\n\n"
        f"Total de melhores avaliados: {total_melhores} "
        f"(com linha [VARIATION_TAGS]: {com_tags}).\n\n"
        "=== FREQUÊNCIA DOS EIXOS VISUAIS NOS MELHORES ===\n"
        f"{eixos}\n\n"
        "=== PROMPTS DOS MELHORES (na íntegra) ===\n"
        f"{exemplos}\n\n"
        "=== TAREFA ===\n"
        "Identifique os PADRÕES recorrentes entre os melhores (cenário, elenco, "
        "luz, paleta, tipografia, composição, roupa, escala do mascote, etc.) e "
        "proponha um ajuste objetivo para a skill thumbnail-prompt-expert que "
        "reforce esses padrões sem engessar a variação. Seja concreto e honesto: "
        "se a amostra for pequena ou ruidosa, diga.\n\n"
        "Responda SOMENTE com JSON no formato:\n"
        "{\n"
        '  "resumo": "1-3 frases sobre o que os melhores têm em comum",\n'
        '  "padroes": [\n'
        '    {"eixo": "<eixo>", "padrao": "<o que se repete>", '
        '"evidencia": "<por que/como aparece>", "forca": "alta|media|baixa"}\n'
        "  ],\n"
        '  "proposta_ajuste_skill": "<texto objetivo do ajuste sugerido na skill>"\n'
        "}"
    )


# ─── Não-regressão: default formatado == string hardcoded antiga ────────────


def test_sentimento_default_identico_ao_oraculo():
    comentarios = "[1] (👍 5) melhor live\n[2] (👍 0) tanto faz"
    template = prompts_utilitarios._default_prompt(
        prompts_utilitarios._exigir_catalogo("sentimento-ranking")
    )
    assert template.format(comentarios=comentarios) == _oraculo_sentimento(comentarios)


def test_padroes_default_identico_ao_oraculo():
    eixos = '- cenario: "tribunal" (x3)\n- paleta: "azul" (x2)'
    exemplos = "[1] veredito=otimo\n[VARIATION_TAGS] cenario=..."
    template = prompts_utilitarios._default_prompt(
        prompts_utilitarios._exigir_catalogo("padroes-thumbnail")
    )
    montado = template.format(total_melhores=3, com_tags=3, eixos=eixos, exemplos=exemplos)
    assert montado == _oraculo_padroes(3, 3, eixos, exemplos)
    # Sanidade: nada de chaves não resolvidas (o `{{ }}` do JSON virou `{ }`).
    assert "{{" not in montado and "}}" not in montado


# ─── Seed, banco fonte-da-verdade e guardrail ───────────────────────────────


def test_seed_le_default_versionado_e_grava_no_banco(tmp_path: Path):
    from app.services import settings_store

    kw = _kw(tmp_path)
    prompt = prompts_utilitarios.resolver_prompt("sentimento-ranking", **kw)

    assert "{comentarios}" in prompt
    assert "COMENTÁRIOS:" in prompt
    # Efeito colateral: o banco foi semeado na tabela genérica, keyed pela chave.
    assert settings_store.ler_scaffold(kw["db_path"], _CANAL, "sentimento-ranking")


def test_banco_e_fonte_da_verdade_apos_definir(tmp_path: Path):
    kw = _kw(tmp_path)
    novo = "instrução própria {comentarios} — devolva o JSON"
    prompts_utilitarios.definir_prompt("sentimento-ranking", novo, **kw)

    assert prompts_utilitarios.resolver_prompt("sentimento-ranking", **kw) == novo


def test_definir_prompt_valida_placeholder_desconhecido(tmp_path: Path):
    with pytest.raises(ValueError, match="desconhecidos"):
        prompts_utilitarios.definir_prompt(
            "sentimento-ranking",
            "{comentarios} {campo_inventado} JSON",
            **_kw(tmp_path),
        )


def test_definir_prompt_valida_placeholder_obrigatorio_ausente(tmp_path: Path):
    with pytest.raises(ValueError, match="comentarios"):
        prompts_utilitarios.definir_prompt(
            "sentimento-ranking", "sem placeholder mas com JSON", **_kw(tmp_path)
        )


def test_definir_prompt_valida_marcador_ausente(tmp_path: Path):
    with pytest.raises(ValueError, match="JSON"):
        prompts_utilitarios.definir_prompt(
            "padroes-thumbnail",
            "{total_melhores} {com_tags} {eixos} {exemplos} sem marcador",
            **_kw(tmp_path),
        )


def test_resetar_prompt_volta_ao_default(tmp_path: Path):
    kw = _kw(tmp_path)
    prompts_utilitarios.definir_prompt("sentimento-ranking", "custom {comentarios} JSON", **kw)
    descrito = prompts_utilitarios.resetar_prompt("sentimento-ranking", **kw)

    assert descrito.prompt == descrito.prompt_default
    assert descrito.prompt == prompts_utilitarios._default_prompt(
        prompts_utilitarios._exigir_catalogo("sentimento-ranking")
    )


def test_descrever_prompts_traz_todos_na_ordem(tmp_path: Path):
    descritos = prompts_utilitarios.descrever_prompts(**_kw(tmp_path))
    assert [d.key for d in descritos] == ["sentimento-ranking", "padroes-thumbnail"]
    sent = next(d for d in descritos if d.key == "sentimento-ranking")
    assert sent.marcador == "JSON"
    assert "comentarios" in sent.placeholders


def test_prompt_desconhecido_levanta(tmp_path: Path):
    with pytest.raises(KeyError):
        prompts_utilitarios.resolver_prompt("inexistente", **_kw(tmp_path))


def test_todos_os_defaults_passam_no_guardrail():
    # Invariante: cada default versionado é montável e respeita o próprio contrato.
    for cat in prompts_utilitarios.catalogo():
        prompts_utilitarios.validar_prompt(prompts_utilitarios._default_prompt(cat), cat)
