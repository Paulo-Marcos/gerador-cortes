"""Prova de NÃO-REGRESSÃO dos prompts do mascote em PROD (D-264 / E-010).

E-010/E-011 tiraram o nome do mascote ("Sapo") do código: os prompts passaram a
ler `identidade_do_mascote().nome` do `instance/editorial/mascote.yaml`, com
FALLBACK NEUTRO ("mascote"). Consequência: sem o arquivo (ou sem semeá-lo), a
saída do canal REGRIDE — o personagem some das capas/metadados.

Estes testes fixam o contrato que sustenta o setup PROD: com `nome="Sapo"`, cada
SLOT de identidade nos prompts de runtime volta a produzir EXATAMENTE o texto
pré-genericização; com o fallback, produz o texto neutro. Assim, uma vez semeado
o `mascote.yaml` (via `CANAL_MASCOTE_NOME=Sapo`), a saída é idêntica à anterior.

Escopo: apenas os slots de IDENTIDADE (dirigidos pelo yaml). Nomes de campo do
schema de saída (`escala_mascote`, `relacao_mascote_personagens`,
`atuacao_do_mascote`) foram genericizados de propósito — são rótulos estáveis da
API, NÃO referência ao personagem — e por isso permanecem "mascote" mesmo em PROD.
"""

from __future__ import annotations

from app import editorial_identity
from app.services import metadados
from app.services.claude_ia import ClaudeIaService

# Literais EXATOS anteriores à genericização (confirmados no diff de D-221/D-222).
_THUMB_SAPO = "possível; Sapo sozinho é fallback, não default."
_THUMB_NEUTRO = "possível; mascote sozinho é fallback, não default."
_HINTS_SAPO = "mantendo a identidade do Sapo e sem inventar fatos)"
_HINTS_NEUTRO = "mantendo a identidade do mascote e sem inventar fatos)"


def _ctx_minimo() -> dict:
    """Contexto mínimo do corte para montar o prompt de thumbnail."""
    return {
        "tema": "t",
        "titulo_youtube": "titulo",
        "texto_capa": "capa",
        "resumo": "r",
        "transcricao": "trans",
        "historico_visual": "hist",
    }


def test_prompt_thumbnail_com_sapo_reproduz_texto_anterior():
    prompt = ClaudeIaService._montar_prompt_thumbnail(
        _ctx_minimo(), marca_emojis="", bloco_hints="", mascote="Sapo"
    )

    assert _THUMB_SAPO in prompt


def test_prompt_thumbnail_neutro_quando_fallback():
    prompt = ClaudeIaService._montar_prompt_thumbnail(
        _ctx_minimo(), marca_emojis="", bloco_hints="", mascote="mascote"
    )

    assert _THUMB_NEUTRO in prompt


def test_bloco_hints_metadados_com_sapo_reproduz_texto_anterior(monkeypatch):
    monkeypatch.setattr(
        metadados,
        "identidade_do_mascote",
        lambda: editorial_identity.Mascote(nome="Sapo"),
    )

    bloco = metadados.formatar_bloco_hints_thumbnail("Direção do editor")

    assert _HINTS_SAPO in bloco


def test_bloco_hints_metadados_neutro_quando_fallback(monkeypatch):
    monkeypatch.setattr(
        metadados,
        "identidade_do_mascote",
        lambda: editorial_identity.MASCOTE_NEUTRO,
    )

    bloco = metadados.formatar_bloco_hints_thumbnail("Direção do editor")

    assert _HINTS_NEUTRO in bloco
