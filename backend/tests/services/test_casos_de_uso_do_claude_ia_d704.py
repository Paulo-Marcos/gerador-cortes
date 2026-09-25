"""A avaliação do bruto e o prompt manual de cortes (D-704).

Teste de caracterização, antes de os dois casos de uso saírem do `claude_ia`
para o service de cada agregado. Fixa o que eles fazem: a avaliação monta o
prompt pelo scaffold do canal, pede o JSON à IA, normaliza e grava com o modelo
e a impressão digital da skill; o prompt manual leva a expertise da skill antes
da mesma receita da geração automática. Troca só as bordas — skill, scaffold,
IA e gravação. As referências que o movimento troca ficam no topo.
"""

from __future__ import annotations

import hashlib

import pytest
from app.domain.corte.avaliacao_bruto import normalizar_avaliacao
from app.services import avaliacao_bruto
from app.services.canal.editorial_skills import SkillResolvida
from app.services.claude_ia import ClaudeIaService

avaliar_bruto = avaliacao_bruto.avaliar_bruto_via_claude
prompt_manual_de_cortes = ClaudeIaService.montar_prompt_manual_cortes
receita_de_cortes = ClaudeIaService._montar_prompt
# Onde cada caso de uso lê a skill, o scaffold, a IA e as lentes.
_AVALIADOR = "app.services.avaliacao_bruto"
_PROMPT_MANUAL = "app.services.claude_ia"

_SCAFFOLD_CORTES = (
    "{variacao}|{cabecalho_section}|{titulo_live}|{duracao_humana}|{youtube_url}|"
    "{texto_transcricao}"
)
_SCAFFOLD = (
    "T={titulo} | tema={tema_central} | dur={duracao_humana} | emendas={total_emendas} | "
    "removido={removido_humano}\n{tipos_apontamento}\n---\n{texto_avaliado}"
)


def _skill(key: str, corpo: str = "corpo da skill") -> SkillResolvida:
    return SkillResolvida(
        key=key,
        corpo=corpo,
        modelo="modelo-x",
        thinking_tokens=0,
        timeout=60.0,
        lentes=[],
    )


@pytest.mark.asyncio
async def test_avaliar_bruto_pede_o_parecer_e_grava_normalizado(monkeypatch):
    contexto = avaliacao_bruto.ContextoAvaliacao(
        corte_id="c1",
        projeto_id="p1",
        titulo="Título",
        tema_central="Tema",
        duracao_seg=125.0,
        emendas=[],
        texto_avaliado="o texto que sobrou",
    )
    skill = _skill("avaliador-bruto")
    pedidos, gravados = [], []

    async def contexto_de(corte_id):
        assert corte_id == "c1"
        return contexto

    async def gerar_json(provider, prompt, skill_usada, chave, **ids):
        pedidos.append((provider, prompt, skill_usada, chave, ids))
        return {"nota": 4, "veredito": "bom", "apontamentos": []}

    async def registrar(ctx, avaliacao, *, modelo, skill_sha):
        gravados.append((ctx, avaliacao, modelo, skill_sha))
        return {"id": "av-1"}

    monkeypatch.setattr(avaliacao_bruto, "montar_contexto", contexto_de)
    monkeypatch.setattr(avaliacao_bruto, "registrar_avaliacao", registrar)
    monkeypatch.setattr(f"{_AVALIADOR}.editorial_skills.resolver_skill", lambda _k, **_kw: skill)
    monkeypatch.setattr(
        f"{_AVALIADOR}.editorial_scaffolds.resolver_scaffold", lambda _k, **_kw: _SCAFFOLD
    )
    monkeypatch.setattr(f"{_AVALIADOR}.gerar_json", gerar_json)

    resultado = await avaliar_bruto("c1", "claude")

    assert resultado == {"id": "av-1"}
    ((provider, prompt, skill_usada, chave, ids),) = pedidos
    assert (provider, skill_usada, chave, ids) == (
        "claude",
        skill,
        "avaliador-bruto",
        {"projeto_id": "p1", "corte_id": "c1"},
    )
    assert prompt.startswith("T=Título | tema=Tema | dur=")
    assert prompt.endswith("---\no texto que sobrou")
    ((ctx, avaliacao, modelo, skill_sha),) = gravados
    assert ctx is contexto
    assert avaliacao == normalizar_avaliacao({"nota": 4, "veredito": "bom", "apontamentos": []})
    assert modelo == "modelo-x"
    assert skill_sha == hashlib.sha1(b"corpo da skill").hexdigest()[:8]


def _canal_sem_banco(monkeypatch, skill: SkillResolvida) -> None:
    """Skill, scaffold e lente sem ler o banco de configurações do canal."""
    monkeypatch.setattr(
        f"{_PROMPT_MANUAL}.editorial_skills.resolver_skill", lambda _k, **_kw: skill
    )
    monkeypatch.setattr(
        "app.services.claude_ia.editorial_scaffolds.resolver_scaffold",
        lambda _k, **_kw: _SCAFFOLD_CORTES,
    )
    monkeypatch.setattr(f"{_PROMPT_MANUAL}.bloco_variacao_de", lambda _lentes: "LENTE")


def test_prompt_manual_poe_a_expertise_antes_da_receita_automatica(monkeypatch):
    skill = _skill("cortador-expert", corpo="  EXPERTISE DO CANAL  ")
    _canal_sem_banco(monkeypatch, skill)
    meta = {"projeto_id": "p1", "titulo": "Live"}

    prompt = prompt_manual_de_cortes("00:00:01 fala", meta, cabecalho="CAB")

    receita = receita_de_cortes("00:00:01 fala", meta, cabecalho="CAB", variacao="LENTE")
    assert prompt == f"EXPERTISE DO CANAL\n\n{receita}"


def test_prompt_manual_sem_expertise_e_so_a_receita(monkeypatch):
    _canal_sem_banco(monkeypatch, _skill("cortador-expert", corpo=""))

    prompt = prompt_manual_de_cortes("texto", {}, cabecalho="")

    assert prompt == receita_de_cortes("texto", {}, cabecalho="", variacao="LENTE")
