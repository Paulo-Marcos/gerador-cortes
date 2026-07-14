"""D-355: âncora verbatim opcional nas bordas de CORTE e DESVIO.

Cobre o wiring (não a lógica pura, que vive em tests/domain/test_ancora_match):
  - `importar_resultado`: corte com `inicio_texto` resolve para o tempo real da
    palavra; sem citação mantém o HMS "de memória" do LLM (não-quebradiço).
  - `_ancorar_desvio`: com citação ancora antes do snap; sem citação devolve o
    desvio intacto (o snap então age sozinho, como hoje).

Os testes de corte mockam `AsyncSessionLocal` (mesmo padrão do audit-trail):
capturam o `Corte` passado a `db.add` sem tocar banco real.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.models import Corte
from app.services.analise import AnaliseService
from app.services.claude_ia import ClaudeIaService

# Transcrição word-level: a frase "o brasil vai crescer" começa em t=612.0.
_TRANSCRICAO = [
    {
        "inicio": "00:10:00",
        "fim": "00:10:20",
        "texto": "e ai o brasil vai crescer muito no proximo ano",
        "palavras": [
            {"texto": "e", "inicio_seg": 600.0},
            {"texto": "ai", "inicio_seg": 600.6},
            {"texto": "o", "inicio_seg": 611.5},
            {"texto": "brasil", "inicio_seg": 612.0},
            {"texto": "vai", "inicio_seg": 612.6},
            {"texto": "crescer", "inicio_seg": 613.2},
            {"texto": "muito", "inicio_seg": 614.0},
            {"texto": "no", "inicio_seg": 614.5},
            {"texto": "proximo", "inicio_seg": 615.0},
            {"texto": "ano", "inicio_seg": 615.8},
        ],
    }
]


def _mock_db_factory(transcricao_raw: str | None = None):
    cortes_capturados: list = []
    projeto_mock = MagicMock()
    projeto_mock.status = None
    projeto_mock.ultima_analise_em = None
    projeto_mock.descartados_analise = "[]"
    projeto_mock.transcricao_raw = transcricao_raw

    def _capturar(obj):
        if isinstance(obj, Corte):
            cortes_capturados.append(obj)

    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    exec_result = MagicMock()
    exec_result.scalar = lambda: 0
    exec_result.all = lambda: []
    session.execute = AsyncMock(return_value=exec_result)
    session.get = AsyncMock(return_value=projeto_mock)
    session.commit = AsyncMock()
    session.add = MagicMock(side_effect=_capturar)

    def factory():
        return session

    return factory, cortes_capturados


@pytest.mark.asyncio
async def test_corte_com_inicio_texto_ancora_no_tempo_da_palavra(monkeypatch):
    """O timestamp "de memória" (00:09:30 = 570s) erra por ~40s; a citação
    `inicio_texto` reancora o início no tempo real de "brasil" (612.0s)."""
    factory, cortes = _mock_db_factory(json.dumps(_TRANSCRICAO))
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-ancora",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:09:30",  # 570s — memória errada
                "fim_hms": "00:10:20",
                "inicio_texto": "brasil vai crescer",
            }
        ],
    )

    assert cortes[0].inicio_seg == 612.0
    assert cortes[0].inicio_hms == "00:10:12.000"


@pytest.mark.asyncio
async def test_corte_sem_citacao_mantem_hms_do_llm(monkeypatch):
    """Não-quebradiço: sem `inicio_texto`/`fim_texto`, mantém exatamente o HMS
    proposto pelo LLM (comportamento de hoje)."""
    factory, cortes = _mock_db_factory(json.dumps(_TRANSCRICAO))
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-sem-citacao",
        [{"titulo_proposto": "A", "inicio_hms": "00:09:30", "fim_hms": "00:10:20"}],
    )

    assert cortes[0].inicio_hms == "00:09:30"  # intacto (formato do LLM preservado)
    assert cortes[0].inicio_seg == 570.0


@pytest.mark.asyncio
async def test_corte_sem_palavras_e_no_op(monkeypatch):
    """Projeto sem transcrição word-level (VTT legado) → âncora no-op mesmo com
    citação: mantém o HMS do LLM."""
    factory, cortes = _mock_db_factory(transcricao_raw=None)
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", factory)

    await AnaliseService.importar_resultado(
        "p-legado",
        [
            {
                "titulo_proposto": "A",
                "inicio_hms": "00:09:30",
                "fim_hms": "00:10:20",
                "inicio_texto": "o brasil vai crescer",
            }
        ],
    )

    assert cortes[0].inicio_hms == "00:09:30"
    assert cortes[0].inicio_seg == 570.0


def _palavras_flat():
    from app.domain.ancora_match import achatar_palavras

    return achatar_palavras(_TRANSCRICAO)


class TestAncorarDesvio:
    def test_desvio_com_citacao_ancora_antes_do_snap(self):
        """Com `inicio_texto`/`fim_texto`, o desvio é reancorado no tempo real da
        palavra (janela ±5s do timestamp proposto)."""
        desvio = {
            "inicio_seg": 611.0,  # aproximado
            "fim_seg": 616.0,
            "inicio_hms": "00:10:11",
            "fim_hms": "00:10:16",
            "inicio_texto": "brasil vai",
            "fim_texto": "proximo ano",
            "motivo": "tangente",
        }
        ajustado = ClaudeIaService._ancorar_desvio(desvio, _palavras_flat())
        assert ajustado["inicio_seg"] == 612.0  # início de "brasil"
        # fim de "ano" (última palavra) = 615.8 + folga 0.3
        assert ajustado["fim_seg"] == 616.1
        assert ajustado["inicio_hms"] == "00:10:12.000"

    def test_desvio_sem_citacao_devolve_intacto(self):
        """Sem citação, `_ancorar_desvio` é no-op — o snap age sozinho depois."""
        desvio = {"inicio_seg": 611.0, "fim_seg": 616.0, "motivo": "chat"}
        assert ClaudeIaService._ancorar_desvio(desvio, _palavras_flat()) == desvio

    def test_desvio_sem_palavras_devolve_intacto(self):
        desvio = {
            "inicio_seg": 611.0,
            "fim_seg": 616.0,
            "inicio_texto": "brasil vai",
            "motivo": "chat",
        }
        assert ClaudeIaService._ancorar_desvio(desvio, []) == desvio
