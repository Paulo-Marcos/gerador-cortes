"""Testes de regressão: geração de brutos NÃO deve ocorrer automaticamente.

Regra: brutos só são gerados quando o usuário clicar explicitamente em
"Gerar bruto" / "Regerar bruto". Nenhuma importação de análise pode
disparar geração em massa como efeito colateral.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.analise import AnaliseService

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mock_db_session():
    """Retorna um mock de AsyncSessionLocal que não acessa banco real."""
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    projeto_mock = MagicMock()
    projeto_mock.status = None
    projeto_mock.ultima_analise_em = None
    session.get = AsyncMock(return_value=projeto_mock)
    session.commit = AsyncMock()
    session.add = MagicMock()
    return session


# ---------------------------------------------------------------------------
# Teste 1 — importar_resultado não dispara _auto_pipeline_cortes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_importar_resultado_nao_dispara_autopipeline(monkeypatch):
    """importar_resultado NÃO deve criar a task _auto_pipeline_cortes.

    Geração de brutos é ação explícita do usuário — nunca automática.
    Regressão: antes desse fix, qualquer importação de análise gerava
    brutos para todos os cortes do projeto sem aviso.
    """
    tasks_criadas: list = []

    monkeypatch.setattr(
        "app.services.analise.asyncio.create_task",
        lambda coro, **kw: (
            tasks_criadas.append(getattr(coro, "__name__", str(coro))) or MagicMock()
        ),
    )
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", _mock_db_session)

    await AnaliseService.importar_resultado("projeto-fake-123", [])

    assert tasks_criadas == [], (
        "importar_resultado NÃO deve criar nenhuma asyncio.Task — "
        "geração de brutos é ação explícita do usuário.\n"
        f"Tasks criadas: {tasks_criadas}"
    )


# ---------------------------------------------------------------------------
# Teste 2 — _auto_pipeline_cortes existe mas não é chamado por importar_resultado
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_auto_pipeline_nao_e_chamado_indiretamente(monkeypatch):
    """_auto_pipeline_cortes não deve ser chamado como efeito colateral."""
    chamadas: list = []

    monkeypatch.setattr(
        AnaliseService,
        "_auto_pipeline_cortes",
        AsyncMock(side_effect=lambda pid: chamadas.append(pid)),
    )
    monkeypatch.setattr("app.services.analise.asyncio.create_task", MagicMock())
    monkeypatch.setattr("app.services.analise.AsyncSessionLocal", _mock_db_session)

    await AnaliseService.importar_resultado("projeto-fake-456", [])

    assert chamadas == [], (
        "_auto_pipeline_cortes NÃO deve ser invocado por importar_resultado.\n"
        f"Foi chamado para projetos: {chamadas}"
    )
