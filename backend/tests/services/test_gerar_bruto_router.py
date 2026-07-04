"""Testes para o endpoint POST /cortes/{corte_id}/gerar-bruto.

Garantem o contrato assíncrono do endpoint:
- responde imediatamente (não bloqueia)
- marca o corte como "cortando" no dicionário ExportService._tarefas_corte
- ao final do worker, atualiza o status para "pronto" ou "erro: ..."
- chamada duplicada enquanto está cortando é idempotente
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers import cortes as cortes_router
from app.services.export import ExportService


@pytest.fixture(autouse=True)
def _limpar_tarefas_corte():
    """Garante isolamento entre testes — limpa o dict in-memory antes e depois."""
    ExportService._tarefas_corte.clear()
    yield
    ExportService._tarefas_corte.clear()


@pytest.fixture(autouse=True)
def _corte_sem_bruto(monkeypatch):
    """Default: corte SEM bruto (1ª geração) — evita I/O de disco nos testes de contrato.

    Os testes que exercem a regeração (D-160) sobrescrevem via monkeypatch.
    """
    monkeypatch.setattr(cortes_router, "_corte_tem_bruto", lambda corte: False)


def _db_com_corte(corte=None):
    db = AsyncMock()
    db.get = AsyncMock(
        return_value=corte
        if corte is not None
        else MagicMock(id="corte-1", projeto_id="proj-1", arquivo_clip_path="")
    )
    return db


@pytest.mark.asyncio
async def test_gerar_bruto_responde_imediatamente_e_marca_cortando(monkeypatch):
    """O endpoint dispara o worker como task e retorna sem esperar."""
    worker_chamado = asyncio.Event()
    pode_terminar = asyncio.Event()

    async def worker_lento(corte_id: str, **kwargs):
        worker_chamado.set()
        await pode_terminar.wait()
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_lento)

    db = _db_com_corte()
    resposta = await cortes_router.gerar_bruto("corte-1", db=db)

    assert resposta["message"] == "Geração de bruto iniciada"
    assert resposta["corte_id"] == "corte-1"
    assert ExportService.get_tarefa_corte_status("corte-1") == "cortando"

    # Confirma que a task foi de fato disparada — o worker já está rodando
    await asyncio.wait_for(worker_chamado.wait(), timeout=1.0)

    # Libera o worker para terminar e dá um ciclo de event loop para o status atualizar
    pode_terminar.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert ExportService.get_tarefa_corte_status("corte-1") == "pronto"


@pytest.mark.asyncio
async def test_gerar_bruto_marca_erro_quando_worker_retorna_erro(monkeypatch):
    async def worker_falho(corte_id: str, **kwargs):
        return {"status": "erro", "mensagem": "ffmpeg morreu"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_falho)

    db = _db_com_corte()
    await cortes_router.gerar_bruto("corte-2", db=db)

    # Cede ao loop para a task interna completar
    for _ in range(5):
        await asyncio.sleep(0)

    status = ExportService.get_tarefa_corte_status("corte-2")
    assert status.startswith("erro:")
    assert "ffmpeg morreu" in status


@pytest.mark.asyncio
async def test_gerar_bruto_marca_erro_quando_worker_levanta_excecao(monkeypatch):
    async def worker_explode(corte_id: str, **kwargs):
        raise RuntimeError("disco cheio")

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_explode)

    db = _db_com_corte()
    await cortes_router.gerar_bruto("corte-3", db=db)

    for _ in range(5):
        await asyncio.sleep(0)

    status = ExportService.get_tarefa_corte_status("corte-3")
    assert status.startswith("erro:")
    assert "disco cheio" in status


@pytest.mark.asyncio
async def test_gerar_bruto_idempotente_quando_ja_cortando(monkeypatch):
    """Segundo POST enquanto já está cortando não dispara worker duplicado."""
    chamadas: list = []

    async def worker_lento(corte_id: str, **kwargs):
        chamadas.append(corte_id)
        await asyncio.sleep(0.05)
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_lento)

    db = _db_com_corte()
    primeira = await cortes_router.gerar_bruto("corte-4", db=db)
    # Antes do worker terminar, faz nova chamada
    segunda = await cortes_router.gerar_bruto("corte-4", db=db)

    assert primeira["message"] == "Geração de bruto iniciada"
    assert segunda["message"] == "Geração de bruto já em andamento"

    # Espera a task original completar
    for _ in range(20):
        if ExportService.get_tarefa_corte_status("corte-4") == "pronto":
            break
        await asyncio.sleep(0.01)

    assert chamadas == ["corte-4"], "worker deve ter sido chamado uma única vez"


@pytest.mark.asyncio
async def test_gerar_bruto_404_quando_corte_inexistente(monkeypatch):
    from fastapi import HTTPException

    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await cortes_router.gerar_bruto("inexistente", db=db)
    assert exc.value.status_code == 404


# ─── D-160: default de regeração = só o bruto (transcrição/cenas opt-in) ──────


async def _capturar_flags_do_worker(monkeypatch) -> dict:
    """Instrumenta o worker para capturar os flags recebidos e roda o endpoint."""
    capturado: dict = {}

    async def worker_espiao(corte_id: str, **kwargs):
        capturado.update(kwargs)
        return {"status": "pronto"}

    monkeypatch.setattr(ExportService, "gerar_bruto_via_worker", worker_espiao)
    return capturado


@pytest.mark.asyncio
async def test_primeira_geracao_forca_cadeia_completa(monkeypatch):
    """Corte SEM bruto: transcrição + cenas rodam, ignorando o body (não regride)."""
    monkeypatch.setattr(cortes_router, "_corte_tem_bruto", lambda corte: False)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    db = _db_com_corte()
    # Mesmo pedindo tudo desmarcado, a 1ª geração força a cadeia completa.
    body = cortes_router.GerarBrutoRequest(refazer_transcricao=False, refazer_cenas=False)
    await cortes_router.gerar_bruto("corte-1", body=body, db=db)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": True, "refazer_cenas": True}


@pytest.mark.asyncio
async def test_regeracao_sem_opt_in_roda_so_o_bruto(monkeypatch):
    """Corte COM bruto e body default: transcrição e cenas NÃO rodam."""
    monkeypatch.setattr(cortes_router, "_corte_tem_bruto", lambda corte: True)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    db = _db_com_corte()
    await cortes_router.gerar_bruto("corte-1", body=None, db=db)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": False, "refazer_cenas": False}


@pytest.mark.asyncio
async def test_regeracao_honra_opt_in_selecionado(monkeypatch):
    """Corte COM bruto: só o opt-in marcado (cenas) roda além do bruto."""
    monkeypatch.setattr(cortes_router, "_corte_tem_bruto", lambda corte: True)
    capturado = await _capturar_flags_do_worker(monkeypatch)

    db = _db_com_corte()
    body = cortes_router.GerarBrutoRequest(refazer_transcricao=False, refazer_cenas=True)
    await cortes_router.gerar_bruto("corte-1", body=body, db=db)
    for _ in range(5):
        await asyncio.sleep(0)

    assert capturado == {"refazer_transcricao": False, "refazer_cenas": True}
