"""D-455: a fábrica de shorts como etapa condicional da esteira do bruto.

O gate é `is_fire`, e ele é lido no INÍCIO da geração — antes de qualquer passo —
porque é ele que decide a lista de etapas que o dropdown de progresso mostra.
Listar "Propor shorts" num corte comum deixaria um pendente eterno na tela.

Os testes de esteira usam a mesma manobra do `test_gerar_bruto_salvaguarda_silencios`:
a sessão dublê devolve o corte e depois `None` para o projeto, o que faz a geração
sair cedo — o suficiente para provar a decisão sem tocar em FFmpeg.
"""

from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import export as export_module
from app.services.bruto_progress import BrutoProgress
from app.services.export import ExportService


def _fake_session_factory(corte_obj):
    session = AsyncMock()
    session.get = AsyncMock(side_effect=[corte_obj, None])
    session.refresh = AsyncMock()
    session.commit = AsyncMock()

    @asynccontextmanager
    async def factory():
        yield session

    return factory


def _corte(*, is_fire: bool, corte_id: str):
    corte = MagicMock(id=corte_id, projeto_id="proj-x")
    corte.is_fire = is_fire
    return corte


@pytest.fixture(autouse=True)
def _silenciar_silencios(monkeypatch):
    """A salvaguarda de silêncios não é o assunto aqui."""
    from app.services import corte as corte_module

    async def _noop(corte_id: str, limpar_anteriores: bool = False):
        return {"status": "sucesso"}

    monkeypatch.setattr(
        corte_module.CorteService, "detectar_silencios_tecnico", staticmethod(_noop)
    )


def test_passo_de_shorts_so_entra_quando_pedido():
    BrutoProgress.iniciar("comum")
    BrutoProgress.iniciar("fire", incluir_shorts=True)

    assert [p["chave"] for p in BrutoProgress.get("comum")][-1] == "cenas"
    assert [p["chave"] for p in BrutoProgress.get("fire")][-1] == "shorts"
    assert BrutoProgress.get("fire")[-1]["status"] == "pendente"


@pytest.mark.asyncio
async def test_corte_fire_ganha_a_etapa_de_shorts_na_esteira(monkeypatch):
    monkeypatch.setattr(
        export_module,
        "AsyncSessionLocal",
        _fake_session_factory(_corte(is_fire=True, corte_id="c-fire")),
    )

    await ExportService.gerar_bruto_via_worker("c-fire")

    assert "shorts" in [p["chave"] for p in BrutoProgress.get("c-fire")]


@pytest.mark.asyncio
async def test_corte_comum_nao_mostra_etapa_que_nunca_vai_rodar(monkeypatch):
    monkeypatch.setattr(
        export_module,
        "AsyncSessionLocal",
        _fake_session_factory(_corte(is_fire=False, corte_id="c-comum")),
    )

    await ExportService.gerar_bruto_via_worker("c-comum")

    assert "shorts" not in [p["chave"] for p in BrutoProgress.get("c-comum")]


@pytest.mark.asyncio
async def test_corte_sem_metadado_nao_quebra_a_geracao(monkeypatch):
    """Corte antigo pode não ter linha de metadado — ausência é 'não é Fire'."""
    corte = MagicMock(id="c-sem-meta", projeto_id="proj-x", is_fire=False)
    corte.metadado = None
    monkeypatch.setattr(export_module, "AsyncSessionLocal", _fake_session_factory(corte))

    resultado = await ExportService.gerar_bruto_via_worker("c-sem-meta")

    assert resultado == {"status": "erro", "mensagem": "Projeto não encontrado"}
    assert "shorts" not in [p["chave"] for p in BrutoProgress.get("c-sem-meta")]
