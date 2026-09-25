"""Prompt manual da análise (modal "Análise IA" → modo manual).

O contrato consumido pelo frontend (`extrairPartesPrompt`) e pelo import do JSON
é: `prompts[{parte, total_partes, texto}]` + `formato_esperado`, uma parte por
chunk da transcrição, cada texto com a transcrição `[idx] (hms) fala` e o pedido
de JSON em bloco de código.
"""

import json
import re
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.domain.compartilhado.manual_prompt import JSON_CODE_BLOCK_INSTRUCTION
from app.services.analise import AnaliseService
from app.services.canal import editorial_scaffolds, editorial_skills

EXPERTISE_DO_CANAL = "EXPERTISE DO CANAL: cortes de 15 a 30 minutos."


@pytest.fixture(autouse=True)
def skill_e_scaffold_do_canal(monkeypatch):
    """Skill `cortador-expert` e scaffold `cortes` como viriam do banco do canal."""
    monkeypatch.setattr(
        editorial_skills,
        "resolver_skill",
        lambda key, **_kw: editorial_skills.SkillResolvida(
            key=key, corpo=EXPERTISE_DO_CANAL, modelo="", thinking_tokens=0, timeout=0.0, lentes=[]
        ),
    )
    monkeypatch.setattr(
        editorial_scaffolds,
        "resolver_scaffold",
        lambda key, **_kw: editorial_scaffolds._default_scaffold(
            editorial_scaffolds._exigir_catalogo(key)
        ),
    )


def _transcricao(duracao_seg: int, passo: int = 10) -> list[dict]:
    return [
        {"inicio": float(t), "fim": float(t + passo), "texto": f"fala numero {t}"}
        for t in range(0, duracao_seg, passo)
    ]


@pytest.fixture
def projeto(monkeypatch):
    projeto = MagicMock()
    projeto.titulo_live = "Live de teste"
    projeto.youtube_url = "https://youtu.be/abc12345678"
    projeto.duracao_segundos = 5400
    projeto.transcricao_raw = json.dumps(_transcricao(5400))

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.get = AsyncMock(return_value=projeto)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", lambda: session)
    return projeto


def _checar_contrato(resposta: dict) -> list[dict]:
    prompts = resposta["prompts"]
    assert prompts, "ao menos uma parte"
    total = len(prompts)
    for i, p in enumerate(prompts):
        assert p["parte"] == i + 1
        assert p["total_partes"] == total
        assert re.search(r"^\[\d+\] \(\d", p["texto"], re.M), "linha [idx] (hms) fala"
        assert JSON_CODE_BLOCK_INSTRUCTION.strip() in p["texto"]
    assert "cortes" in resposta["formato_esperado"]
    return prompts


@pytest.mark.asyncio
async def test_live_longa_vira_varias_partes_com_cabecalho(projeto):
    resposta = await AnaliseService.montar_prompt("p1")
    prompts = _checar_contrato(resposta)
    assert len(prompts) == 2
    assert "PARTE 1 de 2" in prompts[0]["texto"]
    assert "PARTE 2 de 2" in prompts[1]["texto"]


@pytest.mark.asyncio
async def test_intervalo_em_blocos_respeita_a_quantidade_pedida(projeto):
    resposta = await AnaliseService.montar_prompt_intervalo("p1", 600.0, 1800.0, blocos=3)
    prompts = _checar_contrato(resposta)
    assert len(prompts) == 3
    assert "PARTE 2 de 3" in prompts[1]["texto"]
    assert "Live de teste" in prompts[0]["texto"]


@pytest.mark.asyncio
async def test_prompt_manual_usa_a_skill_do_canal_e_nao_a_persona_antiga(projeto):
    """D-631: o modo manual segue a mesma receita da análise automática."""
    for resposta in (
        await AnaliseService.montar_prompt("p1"),
        await AnaliseService.montar_prompt_intervalo("p1", 600.0, 1800.0, blocos=2),
    ):
        for p in resposta["prompts"]:
            texto = p["texto"]
            assert texto.startswith(EXPERTISE_DO_CANAL)
            assert "=== TRANSCRI" in texto  # scaffold `cortes` do canal
            assert "analitico e intelectual" not in texto
            assert "GUIA EDITORIAL" not in texto
