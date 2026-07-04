"""I-034: audit trail da análise IA.

Cobre:
  - `AnaliseService.importar_resultado` persiste `justificativa` por corte.
  - `AnaliseService.importar_resultado` persiste `descartados` em
    `projeto.descartados_analise` (lista vazia também é persistida; None
    é ignorado para retrocompatibilidade).
  - `analisar_transcricao` (via Claude) propaga `descartados` da geração.

Estes testes mockam `AsyncSessionLocal` — não tocam banco real, mas capturam
o que entra em `db.add(Corte(...))` e o que é atribuído a `projeto.*`.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.analise import AnaliseService


def _mock_db_factory():
    """Devolve (factory, projeto_mock, cortes_capturados, session_mock).

    A factory imita `AsyncSessionLocal` (context manager assíncrono).
    `projeto_mock` é o objeto retornado por `db.get(Projeto, ...)`.
    `cortes_capturados` recebe cada `Corte` passado a `db.add`.
    """
    cortes_capturados: list = []
    projeto_mock = MagicMock()
    projeto_mock.status = None
    projeto_mock.ultima_analise_em = None
    projeto_mock.descartados_analise = "[]"

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    # COUNT(Corte.id) → 0 (não há cortes preexistentes)
    session.execute = AsyncMock(return_value=MagicMock(scalar=lambda: 0))
    session.get = AsyncMock(return_value=projeto_mock)
    session.commit = AsyncMock()
    session.add = MagicMock(side_effect=lambda corte: cortes_capturados.append(corte))

    def factory():
        return session

    return factory, projeto_mock, cortes_capturados, session


@pytest.mark.asyncio
async def test_importar_resultado_persiste_justificativa_por_corte(monkeypatch):
    """A justificativa que veio da skill é salva em Corte.justificativa."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    cortes_data = [
        {
            "titulo_proposto": "A",
            "resumo": "...",
            "tema_central": "ttese",
            "justificativa": "Arco fechado tese→desenvolvimento→conclusão (15 min).",
            "inicio_hms": "00:05:00",
            "fim_hms": "00:20:00",
            "inicio_seg": 300,
            "fim_seg": 1200,
            "desvios": [],
        },
        {
            "titulo_proposto": "B",
            "resumo": "...",
            "tema_central": "outra",
            # justificativa ausente — deve virar string vazia
            "inicio_hms": "00:25:00",
            "fim_hms": "00:40:00",
            "inicio_seg": 1500,
            "fim_seg": 2400,
            "desvios": [],
        },
    ]

    await AnaliseService.importar_resultado("p-123", cortes_data)

    assert len(cortes) == 2
    assert cortes[0].justificativa == ("Arco fechado tese→desenvolvimento→conclusão (15 min).")
    assert cortes[1].justificativa == "", "justificativa ausente deve virar ''"


@pytest.mark.asyncio
async def test_importar_resultado_normaliza_justificativa_strip(monkeypatch):
    """Whitespace em volta da justificativa deve ser cortado."""
    factory, _projeto, cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-strip",
        [
            {
                "titulo_proposto": "A",
                "justificativa": "   \n  com espaços em volta  \n  ",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
    )

    assert cortes[0].justificativa == "com espaços em volta"


@pytest.mark.asyncio
async def test_importar_resultado_persiste_descartados_no_projeto(monkeypatch):
    """Quando `descartados` é informado, vai pro campo `descartados_analise`."""
    factory, projeto, _cortes, _sess = _mock_db_factory()
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    descartados = [
        {"tema": "treta com chat", "motivo": "fora do tom intelectual"},
        {"tema": "desabafo de saúde", "motivo": "NÃO_RECOMENDADO"},
    ]

    await AnaliseService.importar_resultado(
        "p-desc",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        descartados=descartados,
    )

    salvo = json.loads(projeto.descartados_analise)
    assert salvo == descartados


@pytest.mark.asyncio
async def test_importar_resultado_descartados_lista_vazia_zera(monkeypatch):
    """Lista vazia explícita → o projeto fica com `[]` (zera análise anterior)."""
    factory, projeto, _cortes, _sess = _mock_db_factory()
    projeto.descartados_analise = '[{"tema":"velho","motivo":"limpar"}]'
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-zera",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        descartados=[],
    )

    assert json.loads(projeto.descartados_analise) == []


@pytest.mark.asyncio
async def test_importar_resultado_descartados_none_preserva(monkeypatch):
    """`descartados=None` (default) NÃO mexe no valor já salvo no projeto.

    Retrocompatibilidade: callers que não conhecem o parâmetro não devem
    apagar uma auditoria anterior.
    """
    factory, projeto, _cortes, _sess = _mock_db_factory()
    pre = '[{"tema":"antigo","motivo":"foi mantido"}]'
    projeto.descartados_analise = pre
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-preserva",
        [
            {
                "titulo_proposto": "x",
                "inicio_hms": "00:00:00",
                "fim_hms": "00:10:00",
                "inicio_seg": 0,
                "fim_seg": 600,
            }
        ],
        # descartados omitido → default None → NÃO sobrescreve
    )

    assert projeto.descartados_analise == pre


@pytest.mark.asyncio
async def test_analisar_transcricao_repassa_descartados_via_claude(monkeypatch):
    """`analisar_transcricao` (agora via Claude) deve extrair `descartados`
    do resultado da geração e repassar pro importador (audit trail editorial).
    """
    from app.services.claude_ia import ClaudeIaService

    repasse: dict = {}

    async def fake_importar(projeto_id, cortes_data, *, descartados=None):
        repasse["projeto_id"] = projeto_id
        repasse["cortes_data"] = cortes_data
        repasse["descartados"] = descartados

    monkeypatch.setattr(AnaliseService, "importar_resultado", staticmethod(fake_importar))

    factory, projeto, _, _ = _mock_db_factory()
    projeto.transcricao_raw = json.dumps([{"start": 0, "end": 4, "texto": "fala"}])
    projeto.youtube_url = "http://x"
    projeto.titulo_live = "L"
    projeto.duracao_segundos = 60
    # O caminho Claude abre a própria sessão (módulo distinto de analise).
    monkeypatch.setattr("app.services.claude_ia.AsyncSessionLocal", factory)

    claude_payload = {
        "cortes": [{"titulo_proposto": "A", "inicio_hms": "00:00:00", "fim_hms": "00:01:00"}],
        "descartados": [{"tema": "x", "motivo": "y"}],
    }

    async def fake_gerar_cortes(_transcricao, _meta):
        return claude_payload

    monkeypatch.setattr(ClaudeIaService, "_gerar_cortes", staticmethod(fake_gerar_cortes))

    # Sem vídeo no fluxo de teste: neutraliza o encadeamento de refazer-transcrição.
    async def fake_refazer(_projeto_id):
        return None

    monkeypatch.setattr(ClaudeIaService, "_refazer_transcricao", staticmethod(fake_refazer))

    await AnaliseService.analisar_transcricao("p-claude")

    assert repasse["descartados"] == [{"tema": "x", "motivo": "y"}]
