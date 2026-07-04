"""I-034: endpoint /projetos/{id}/auditoria-analise.

Cobre:
  - Retorna 404 quando o projeto não existe.
  - Retorna payload com cortes (id/numero/justificativa/duracao_min) e descartados.
  - Calcula `duracao_media_min` corretamente.
  - Lida com `descartados_analise` malformado (sem quebrar).
"""

from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.routers.projetos import obter_auditoria_analise
from fastapi import HTTPException


def _projeto(descartados_json: str = "[]") -> SimpleNamespace:
    return SimpleNamespace(
        id="p-1",
        ultima_analise_em=datetime(2026, 6, 1, 12, 0, 0),
        descartados_analise=descartados_json,
    )


def _corte(numero: int, inicio: float, fim: float, justificativa: str = "") -> SimpleNamespace:
    return SimpleNamespace(
        id=f"c-{numero}",
        numero=numero,
        titulo_proposto=f"Corte {numero}",
        tema_central="tema",
        justificativa=justificativa,
        inicio_hms="00:00:00",
        fim_hms="00:00:00",
        inicio_seg=inicio,
        fim_seg=fim,
        status="proposto",
    )


def _db_mock(projeto, cortes):
    db = AsyncMock()
    db.get = AsyncMock(return_value=projeto)
    result_obj = MagicMock()
    result_obj.scalars = lambda: SimpleNamespace(all=lambda: cortes)
    db.execute = AsyncMock(return_value=result_obj)
    return db


@pytest.mark.asyncio
async def test_404_quando_projeto_nao_existe():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await obter_auditoria_analise("inexistente", db)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_retorna_cortes_com_justificativa_e_duracao_em_minutos():
    projeto = _projeto()
    cortes = [
        _corte(1, 0, 600, "tese clara, 10 min é o tamanho certo"),
        _corte(2, 700, 1600, "argumento desenvolvido em 15 min"),
    ]
    db = _db_mock(projeto, cortes)

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["total_cortes"] == 2
    assert payload["cortes"][0]["id"] == "c-1"
    assert payload["cortes"][0]["duracao_min"] == 10.0
    assert payload["cortes"][0]["justificativa"] == ("tese clara, 10 min é o tamanho certo")
    assert payload["cortes"][1]["duracao_min"] == 15.0


@pytest.mark.asyncio
async def test_calcula_duracao_media_em_minutos():
    projeto = _projeto()
    # 10 min e 20 min → média 15 min
    cortes = [_corte(1, 0, 600), _corte(2, 700, 1900)]
    db = _db_mock(projeto, cortes)

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["duracao_media_min"] == 15.0


@pytest.mark.asyncio
async def test_duracao_media_zero_quando_nao_ha_cortes():
    projeto = _projeto()
    db = _db_mock(projeto, [])

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["total_cortes"] == 0
    assert payload["duracao_media_min"] == 0.0
    assert payload["cortes"] == []


@pytest.mark.asyncio
async def test_carrega_descartados_do_projeto():
    descartados = [
        {"tema": "treta", "motivo": "off-topic"},
        {"tema": "desabafo", "motivo": "fora do tom"},
    ]
    import json as _json

    projeto = _projeto(descartados_json=_json.dumps(descartados))
    db = _db_mock(projeto, [_corte(1, 0, 600)])

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["descartados"] == descartados


@pytest.mark.asyncio
async def test_descartados_malformados_viram_lista_vazia():
    """JSON inválido em descartados_analise não pode derrubar o endpoint."""
    projeto = _projeto(descartados_json="<<isto não é json>>")
    db = _db_mock(projeto, [])

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["descartados"] == []


@pytest.mark.asyncio
async def test_descartados_objeto_em_vez_de_lista_vira_lista_vazia():
    """Se um caller antigo gravou um objeto em vez de array, não estoura."""
    projeto = _projeto(descartados_json='{"oops": "deveria ser array"}')
    db = _db_mock(projeto, [])

    payload = await obter_auditoria_analise("p-1", db)

    assert payload["descartados"] == []
